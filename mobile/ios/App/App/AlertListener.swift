import Foundation
import UIKit
import CoreLocation
import AVFoundation
import UserNotifications

/// Réception des alertes en arrière-plan sur iOS, application fermée (comme le service Android).
///
/// iOS endort une application quittée ; comme l'application Clip (AltStore), M-Alert reste active en
/// arrière-plan grâce à la localisation (mode d'arrière-plan « location », autorisation « Toujours »)
/// et à un son silencieux joué en boucle (mode « audio », mélangé aux autres sons). Pendant ce temps,
/// une connexion WebSocket native au serveur M-Alert reçoit les alertes et les notifie (mêmes règles
/// que la page : départements, niveau, catégories, séismes).
///
/// Si iOS arrête quand même l'application (mémoire, application balayée), une notification
/// « M-Alert ne reçoit plus les alertes » est programmée en avance et repoussée tant que
/// l'application tourne : elle s'affiche si l'application ne la repousse plus.
final class AlertListener: NSObject, CLLocationManagerDelegate, URLSessionWebSocketDelegate {
    static let shared = AlertListener()

    private let defaults = UserDefaults.standard
    private let location = CLLocationManager()
    private var player: AVAudioPlayer?
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var timer: Timer?
    private var retry = 0
    private var seen = Set<String>()
    private(set) var connected = false
    private(set) var running = false
    private var settings: [String: Any] = [:]

    private static let watchdogId = "malert-watchdog"

    override init() {
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.waitsForConnectivity = true
        session = URLSession(configuration: config, delegate: self, delegateQueue: OperationQueue.main)
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyThreeKilometers
        location.distanceFilter = 3000
        location.pausesLocationUpdatesAutomatically = false
        location.activityType = .other
        if let s = defaults.string(forKey: "malert.settings"),
           let d = s.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            settings = obj
        }
    }

    /// Autorisation de localisation : « always », « whenInUse », « denied » ou « notDetermined ».
    var locationState: String {
        switch location.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied, .restricted: return "denied"
        default: return "notDetermined"
        }
    }

    var enabled: Bool { defaults.object(forKey: "malert.background") as? Bool ?? true }

    /// Réglages de la page (JSON) et réception en arrière-plan activée ou non.
    func configure(settingsJson: String, background: Bool) {
        defaults.set(settingsJson, forKey: "malert.settings")
        defaults.set(background, forKey: "malert.background")
        if let d = settingsJson.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            let serverChanged = (obj["serverUrl"] as? String) != (settings["serverUrl"] as? String)
            settings = obj
            if serverChanged && running { connect() }
        }
        if background { start() } else { stop() }
    }

    /// Démarrage (lancement de l'application, réglages, relance par iOS après un déplacement).
    func start() {
        guard enabled, (settings["department"] as? String) != nil || (settings["all"] as? Bool ?? false) else { return }
        if !running {
            running = true
            keepAlive()
            connect()
            timer = Timer.scheduledTimer(withTimeInterval: 25, repeats: true) { [weak self] _ in self?.tick() }
        }
        armWatchdog()
    }

    func stop() {
        running = false
        timer?.invalidate()
        timer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        connected = false
        location.stopUpdatingLocation()
        location.stopMonitoringSignificantLocationChanges()
        player?.stop()
        player = nil
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [AlertListener.watchdogId])
    }

    // MARK: - Rester actif en arrière-plan

    private func keepAlive() {
        // Localisation : « Lorsque l'app est active » d'abord, puis « Toujours » (iOS le propose plus tard).
        switch location.authorizationStatus {
        case .notDetermined: location.requestWhenInUseAuthorization()
        case .authorizedWhenInUse: location.requestAlwaysAuthorization(); startLocation()
        case .authorizedAlways: startLocation()
        default: break
        }
        // Son silencieux en boucle, mélangé aux autres sons (musique, vidéos…).
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            if player == nil, let url = Bundle.main.url(forResource: "silence", withExtension: "caf") {
                player = try AVAudioPlayer(contentsOf: url)
                player?.numberOfLoops = -1
            }
            player?.play()
        } catch {
            // la localisation suffit
        }
    }

    private func startLocation() {
        location.allowsBackgroundLocationUpdates = true
        location.showsBackgroundLocationIndicator = false
        location.startUpdatingLocation()
        // Relance de l'application par iOS après un déplacement important, si elle a été arrêtée.
        if location.authorizationStatus == .authorizedAlways { location.startMonitoringSignificantLocationChanges() }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard running else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse: manager.requestAlwaysAuthorization(); startLocation()
        case .authorizedAlways: startLocation()
        default: break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {}
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    /// Toutes les 25 s : ping du serveur, son silencieux relancé, notification de garde repoussée.
    private func tick() {
        guard running else { return }
        if player?.isPlaying == false { player?.play() }
        if let task = task, connected {
            task.sendPing { [weak self] error in
                if error != nil { DispatchQueue.main.async { self?.reconnect() } }
            }
        } else if task == nil {
            connect()
        }
        armWatchdog()
    }

    private func armWatchdog() {
        let content = UNMutableNotificationContent()
        content.title = "M-Alert"
        content.body = AlertNotifier.text("watchdog", settings: settings)
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 120, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: AlertListener.watchdogId, content: content, trigger: trigger))
    }

    // MARK: - Connexion au serveur

    private func connect() {
        task?.cancel(with: .goingAway, reason: nil)
        var server = (settings["serverUrl"] as? String) ?? "https://m-alert-sender.onrender.com"
        while server.hasSuffix("/") { server.removeLast() }
        if server.lowercased().hasPrefix("http") { server = "ws" + server.dropFirst(4) }
        guard let url = URL(string: server + "/ws") else { return }
        let t = session.webSocketTask(with: url)
        task = t
        t.resume()
        receive(t)
    }

    private func receive(_ t: URLSessionWebSocketTask) {
        t.receive { [weak self] result in
            guard let self = self, t === self.task else { return }
            switch result {
            case .success(let message):
                if case .string(let text) = message { DispatchQueue.main.async { self.handle(text) } }
                self.receive(t)
            case .failure:
                DispatchQueue.main.async { self.reconnect() }
            }
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        connected = true
        retry = 0
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        if webSocketTask === task { reconnect() }
    }

    private func reconnect() {
        connected = false
        task = nil
        guard running else { return }
        let delay = min(60.0, 2.0 * pow(2.0, Double(min(5, retry))))
        retry += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self, self.running, self.task == nil else { return }
            self.connect()
        }
    }

    private func handle(_ text: String) {
        guard let d = text.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let type = msg["type"] as? String else { return }
        if type == "hello" {
            // Alertes déjà en cours : connues, pas renotifiées.
            for a in msg["alerts"] as? [[String: Any]] ?? [] { if let id = a["id"] as? String { seen.insert(id) } }
            return
        }
        guard type == "alert" || type == "ring", let a = msg["alert"] as? [String: Any], let id = a["id"] as? String else { return }
        if type == "alert" && seen.contains(id) { return }
        seen.insert(id)
        // Application à l'écran : la page affiche et notifie elle-même.
        if UIApplication.shared.applicationState == .active { return }
        guard wanted(a) else { return }
        AlertNotifier.notifyAlert(a, settings: settings)
    }

    // MARK: - Règles de la page

    private func concernsMe(_ a: [String: Any]) -> Bool {
        var mine = Set<String>()
        if let d = settings["department"] as? String { mine.insert(d) }
        for e in settings["extra"] as? [String] ?? [] { mine.insert(e) }
        for d in a["departments"] as? [String] ?? [] where d == "ALL" || mine.contains(d) { return true }
        return false
    }

    private func wanted(_ a: [String: Any]) -> Bool {
        if a["silent"] as? Bool == true || a["pending"] as? Bool == true { return false }
        if let c = a["cancelledAt"], !(c is NSNull) { return false }
        let level = num(a["level"]) ?? 1
        let cat = a["category"] as? String ?? "meteo"
        if (settings["categoriesOff"] as? [String] ?? []).contains(cat) { return false }
        let all = settings["all"] as? Bool ?? false
        if let q = Quake.wanted(a, settings: settings, mine: all || concernsMe(a)) { return q }
        if level < (num(settings["minLevel"]) ?? 1) { return false }
        if cat == "meteo" {
            let ph = num(a["phenomenon"]) ?? 0
            if (settings["phenomenaOff"] as? [Any] ?? []).contains(where: { num($0) == ph }) { return false }
        }
        return all || concernsMe(a)
    }
}

func num(_ v: Any?) -> Double? {
    if let d = v as? Double { return d }
    if let i = v as? Int { return Double(i) }
    if let n = v as? NSNumber { return n.doubleValue }
    if let s = v as? String { return Double(s) }
    return nil
}

/// Notifications d'alerte (page et réception en arrière-plan), sans doublon.
enum AlertNotifier {
    private static var notified: [String: Date] = [:]
    private static let lock = NSLock()

    /// false si cette alerte vient d'être notifiée (moins de 2 minutes, par la page ou en arrière-plan) :
    /// pas de doublon quand la page et la réception en arrière-plan reçoivent la même alerte.
    static func claim(_ id: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        if id.isEmpty { return true }
        let now = Date()
        notified = notified.filter { now.timeIntervalSince($0.value) < 120 }
        if notified[id] != nil { return false }
        notified[id] = now
        return true
    }

    static func post(id: String, title: String, body: String, level: Int, timeSensitive: Bool, critical: Bool, alertSound: Bool,
                     completion: ((Error?) -> Void)? = nil) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.threadIdentifier = "malert-alerts"
        let custom = alertSound && Bundle.main.url(forResource: "alerte-mobile", withExtension: "caf") != nil
        let name = UNNotificationSoundName("alerte-mobile.caf")
        if critical {
            content.sound = custom ? UNNotificationSound.criticalSoundNamed(name, withAudioVolume: 1.0)
                                   : UNNotificationSound.defaultCriticalSound(withAudioVolume: 1.0)
        } else {
            content.sound = custom ? UNNotificationSound(named: name) : .default
        }
        if #available(iOS 15.0, *) {
            content.interruptionLevel = critical ? .critical : (timeSensitive ? .timeSensitive : .active)
            content.relevanceScore = min(1.0, Double(level) / 5.0)
        }
        content.userInfo = ["id": id]
        let request = UNNotificationRequest(identifier: id.isEmpty ? UUID().uuidString : id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in completion?(error) }
    }

    /// Alerte reçue en arrière-plan : mêmes textes et niveaux que la page.
    static func notifyAlert(_ a: [String: Any], settings: [String: Any]) {
        let id = a["id"] as? String ?? ""
        guard claim(id) else { return }
        let level = Int(num(a["level"]) ?? 1)
        let test = a["test"] as? Bool == true ? "[TEST] " : ""
        var title = "\(test)\(a["levelName"] as? String ?? "Alerte") — \(a["title"] as? String ?? "")"
        var body = a["description"] as? String ?? ""
        if a["category"] as? String == "seisme" {
            let q = Quake.notification(a, settings: settings)
            title = test + q.title
            body = q.body
        }
        post(id: id, title: title, body: body, level: level,
             timeSensitive: (settings["timeSensitive"] as? Bool ?? true) && level >= 3,
             critical: (settings["critical"] as? Bool ?? true) && level >= 4,
             alertSound: level >= 3)
    }

    static func text(_ key: String, settings: [String: Any]) -> String {
        let lang = (settings["notifLangs"] as? [String])?.first ?? "fr"
        switch lang {
        case "en": return "M-Alert is no longer receiving alerts in the background: open the app."
        case "de": return "M-Alert empfängt keine Warnungen mehr im Hintergrund: Öffnen Sie die App."
        case "es": return "M-Alert ya no recibe alertas en segundo plano: abra la aplicación."
        default: return "M-Alert ne reçoit plus les alertes en arrière-plan : ouvrez l'application."
        }
    }
}

/// Tremblements de terre : intensité chez moi et notification en deux langues (comme Quake.java et i18n.js).
enum Quake {
    static let shindo = ["0", "1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"]

    static func rank(_ s: String?) -> Int { s.flatMap { shindo.firstIndex(of: $0) } ?? -1 }

    static func estimate(mag: Double, depth: Double, km: Double) -> Double {
        let d = max(0, depth)
        let x = max(3, hypot(km, d))
        let logPgv = 0.58 * mag + 0.0038 * d - log10(x + 0.0028 * pow(10, 0.5 * mag)) - 0.002 * x - 1.29
        return 2.68 + 1.72 * log10(pow(10, logPgv) * 1.31)
    }

    static func toShindo(_ i: Double) -> String {
        let steps = [0.5, 1.5, 2.5, 3.5, 4.5, 5.0, 5.5, 6.0, 6.5]
        for (k, v) in steps.enumerated() where i < v { return shindo[k] }
        return shindo[9]
    }

    /// Distance (km) à un département (contours simplifiés), 0 à l'intérieur, nil si inconnu.
    static func deptKm(_ rings: [[[Double]]], lat: Double, lon: Double) -> Double? {
        let kx = cos(lat * .pi / 180) * 111.32
        var inside = false
        var best = Double.greatestFiniteMagnitude
        for ring in rings where ring.count >= 3 {
            var inRing = false
            var j = ring.count - 1
            for i in 0..<ring.count {
                guard ring[i].count >= 2, ring[j].count >= 2 else { j = i; continue }
                let xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
                if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi { inRing.toggle() }
                let ax = (xj - lon) * kx, ay = (yj - lat) * 110.57, bx = (xi - lon) * kx, by = (yi - lat) * 110.57
                let dx = bx - ax, dy = by - ay
                let t = (dx != 0 || dy != 0) ? max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0
                best = min(best, hypot(ax + t * dx, ay + t * dy))
                j = i
            }
            if inRing { inside.toggle() }
        }
        if inside { return 0 }
        return best == .greatestFiniteMagnitude ? nil : best
    }

    static func localIntensity(_ a: [String: Any], settings: [String: Any]) -> String? {
        guard let areas = settings["quakeAreas"] as? [String: Any] else { return nil }
        let fixed = a["intensities"] as? [String: Any]
        let epi = a["epicenter"] as? [String: Any]
        var best: String?
        for (code, raw) in areas {
            var s = fixed?[code] as? String
            if s == nil, let epi = epi, let lat = num(epi["lat"]), let lon = num(epi["lon"]), let mag = num(a["magnitude"]) {
                let rings = (raw as? [Any] ?? []).map { ($0 as? [Any] ?? []).map { ($0 as? [Any] ?? []).compactMap { num($0) } } }
                if let km = deptKm(rings, lat: lat, lon: lon) {
                    s = toShindo(estimate(mag: mag, depth: num(a["depth"]) ?? 10, km: km))
                }
            }
            if let s = s, rank(s) > rank(best) { best = s }
        }
        return best
    }

    static func wanted(_ a: [String: Any], settings: [String: Any], mine: Bool) -> Bool? {
        let mode = settings["quakeMode"] as? String ?? "level"
        guard a["category"] as? String == "seisme", mode != "level", !mode.isEmpty else { return nil }
        let magOk = (num(a["magnitude"]).map { $0 >= (num(settings["quakeMag"]) ?? 4) - 1e-9 } ?? false) && mine
        let local = localIntensity(a, settings: settings)
        let shOk = local != nil && rank(local) >= rank((settings["quakeShindo"] as? String) ?? "3")
        switch mode {
        case "magnitude": return magOk
        case "intensity": return shOk
        default: return magOk || shOk
        }
    }

    // [titre urgent, titre, alerte précoce, fortes secousses, secousses, épicentre, intensité chez moi, en mer]
    private static func texts(_ l: String) -> [String] {
        switch l {
        case "en": return ["Emergency Alert", "Earthquake Alert", "Earthquake Early Warning",
                           "Strong shaking is expected soon. Stay calm and seek shelter nearby.", "Shaking may be felt. Stay calm.",
                           "Epicentre", "Expected intensity where you are", "at sea"]
        case "de": return ["Notfallwarnung", "Erdbebenwarnung", "Erdbebenfrühwarnung",
                           "Starke Erschütterungen werden in Kürze erwartet. Bleiben Sie ruhig und suchen Sie in der Nähe Schutz.",
                           "Erschütterungen können spürbar sein. Bleiben Sie ruhig.", "Epizentrum", "Erwartete Intensität bei Ihnen", "auf See"]
        case "es": return ["Alerta de emergencia", "Alerta sísmica", "Alerta sísmica temprana",
                           "se esperan fuertes sacudidas en breve. Mantenga la calma y busque refugio cerca.", "pueden sentirse sacudidas. Mantenga la calma.",
                           "Epicentro", "Intensidad esperada en su zona", "en el mar"]
        default: return ["Alerte d'urgence", "Alerte sismique", "Alerte précoce séisme",
                         "de fortes secousses sont attendues. Restez calme et mettez-vous à l'abri à proximité.",
                         "des secousses peuvent être ressenties. Restez calme.", "Épicentre", "Intensité attendue chez vous", "en mer"]
        }
    }

    static func notification(_ a: [String: Any], settings: [String: Any]) -> (title: String, body: String) {
        var langs = settings["notifLangs"] as? [String] ?? []
        if langs.isEmpty { langs = ["fr", "en"] }
        let local = localIntensity(a, settings: settings)
        let strong = Int(num(a["level"]) ?? 1) >= 4 || rank(local) >= 5
        let mag = num(a["magnitude"]).map { String(format: "M%.1f", $0) } ?? ""
        var titles: [String] = []
        var bodies: [String] = []
        for l in langs {
            let t = texts(l)
            let colon = l == "fr" ? " : " : ": "
            var whereText = t[7]
            if let epi = a["epicenter"] as? [String: Any], let lat = num(epi["lat"]), let lon = num(epi["lon"]) {
                whereText = String(format: "%.2f° %@, %.2f° %@", abs(lat), lat >= 0 ? "N" : "S", abs(lon), lon >= 0 ? "E" : "W")
            }
            var b = t[2] + colon + (strong ? t[3] : t[4]) + " " + t[5] + colon + whereText
            if !mag.isEmpty { b += ", " + mag }
            b += "."
            if let local = local, local != "0" { b += " " + t[6] + colon + local + "." }
            b += " (M-Alert)"
            titles.append(strong ? t[0] : t[1])
            bodies.append(b)
        }
        return (titles.joined(separator: " · "), bodies.joined(separator: "\n"))
    }
}
