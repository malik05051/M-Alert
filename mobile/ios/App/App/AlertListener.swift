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
    /// Ping du serveur (canal allégé, le serveur ne pinge pas) : une fois par minute.
    private static let tickSeconds: TimeInterval = 60
    /// Notification « M-Alert ne reçoit plus les alertes » : 5 minutes sans réveil de l'application.
    private static let watchdogSeconds: TimeInterval = 300

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
            // Un réveil par minute (ping du serveur et notification de garde ensemble) : la radio du
            // téléphone reste en veille le reste du temps.
            timer = Timer.scheduledTimer(withTimeInterval: AlertListener.tickSeconds, repeats: true) { [weak self] _ in self?.tick() }
            timer?.tolerance = 10
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

    /// Toutes les minutes : ping du serveur, son silencieux relancé, notification de garde repoussée.
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
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: AlertListener.watchdogSeconds, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: AlertListener.watchdogId, content: content, trigger: trigger))
    }

    // MARK: - Connexion au serveur

    private func connect() {
        task?.cancel(with: .goingAway, reason: nil)
        var server = (settings["serverUrl"] as? String) ?? "https://m-alert-sender.onrender.com"
        while server.hasSuffix("/") { server.removeLast() }
        if server.lowercased().hasPrefix("http") { server = "ws" + server.dropFirst(4) }
        // Canal allégé : seulement les alertes et notifications qui sonnent (pas la vigilance, l'OBS,
        // les marégraphes…), pas de ping du serveur : moins de réveils, moins de batterie.
        // Version et empreinte de l'application (le serveur peut refuser une version trop ancienne).
        var comps = URLComponents(string: server + "/ws")
        comps?.queryItems = [
            URLQueryItem(name: "lite", value: "1"),
            URLQueryItem(name: "v", value: settings["appVersion"] as? String ?? ""),
            URLQueryItem(name: "b", value: settings["appBuild"] as? String ?? ""),
        ]
        guard let url = comps?.url else { return }
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
        if type == "cancel" {
            // Alerte annulée (fausse alerte) : annoncée si elle me concernait (mêmes règles que l'alerte).
            guard var a = msg["alert"] as? [String: Any], let v = a["voided"], !(v is NSNull),
                  a["silent"] as? Bool != true, UIApplication.shared.applicationState != .active else { return }
            a.removeValue(forKey: "cancelledAt")
            if wanted(a) { AlertNotifier.notifyCancel(a, settings: settings) }
            return
        }
        if type == "vig-ring" {
            // Vigilance Météo-France relancée en « alerte mobile » depuis M-Alert-sender.
            guard msg["mobileAlert"] as? Bool == true, let g = msg["group"] as? [String: Any],
                  UIApplication.shared.applicationState != .active else { return }
            if !(settings["all"] as? Bool ?? false) && !concernsMe(g) { return }
            let ph = num(g["phenomenon"]) ?? 0
            if (settings["phenomenaOff"] as? [Any] ?? []).contains(where: { num($0) == ph }) { return }
            AlertNotifier.notifyVigMobile(g, settings: settings)
            return
        }
        if type == "notice" {
            // Notification de M-Alert qui déclenche l'alerte mobile : sonne comme une alerte, titre et
            // texte tels quels (« Sécurité Civile » / « Avis de tornade »).
            guard let n = msg["notice"] as? [String: Any], n["mobileAlert"] as? Bool == true,
                  settings["notices"] as? Bool ?? true, UIApplication.shared.applicationState != .active else { return }
            if !(settings["all"] as? Bool ?? false) && !concernsMe(n) { return }
            AlertNotifier.notifyMobileNotice(n, settings: settings)
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

    /** Alerte critique : même règle que M.isCritical (common.js). */
    private func critical(_ a: [String: Any]) -> Bool {
        if let c = a["critical"] as? Bool { return c }
        let level = num(a["level"]) ?? 1
        let cat = a["category"] as? String ?? "meteo"
        if ["tsunami", "missile", "attentat"].contains(cat) { return level >= 4 }
        return level >= 5 || (a["mobileAlert"] as? Bool ?? false)
    }

    private func wanted(_ a: [String: Any]) -> Bool {
        if a["silent"] as? Bool == true || a["pending"] as? Bool == true { return false }
        if let c = a["cancelledAt"], !(c is NSNull) { return false }
        let level = num(a["level"]) ?? 1
        let cat = a["category"] as? String ?? "meteo"
        if (settings["categoriesOff"] as? [String] ?? []).contains(cat) { return false }
        let all = settings["all"] as? Bool ?? false
        if let q = Quake.wanted(a, settings: settings, mine: all || concernsMe(a)) { return q }
        // Alerte critique (avertissement de tsunami…) : même sous le niveau minimum choisi.
        if level < (num(settings["minLevel"]) ?? 1) && !critical(a) { return false }
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
                     silent: Bool = false, thread: String = "malert-alerts", completion: ((Error?) -> Void)? = nil) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.threadIdentifier = thread
        let custom = alertSound && Bundle.main.url(forResource: "alerte-mobile", withExtension: "caf") != nil
        let name = UNNotificationSoundName("alerte-mobile.caf")
        if silent {
            content.sound = nil
        } else if critical {
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

    /// Notification en plusieurs langues : une notification par langue, car iOS coupe le texte d'une
    /// bannière après 4 lignes environ. La seconde langue part d'abord, sans son ; la première ensuite,
    /// avec le son : elle s'affiche au-dessus (écran verrouillé et centre de notifications).
    static func postParts(id: String, parts: [(title: String, body: String)], level: Int, timeSensitive: Bool, critical: Bool,
                          alertSound: Bool, completion: ((Error?) -> Void)? = nil) {
        guard parts.count > 1 else {
            post(id: id, title: parts.first?.title ?? "M-Alert", body: parts.first?.body ?? "", level: level,
                 timeSensitive: timeSensitive, critical: critical, alertSound: alertSound, completion: completion)
            return
        }
        var delay = 0.0
        for (i, p) in parts.enumerated().reversed() {
            let primary = i == 0
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                post(id: primary ? id : "\(id)#\(i)", title: p.title, body: p.body, level: level, timeSensitive: timeSensitive,
                     critical: critical, alertSound: alertSound, silent: !primary, thread: "malert-lang\(i)",
                     completion: primary ? completion : nil)
            }
            delay += 0.6
        }
    }

    /// Alerte reçue en arrière-plan : mêmes textes et niveaux que la page.
    static func notifyAlert(_ a: [String: Any], settings: [String: Any]) {
        let id = a["id"] as? String ?? ""
        guard claim(id) else { return }
        let level = Int(num(a["level"]) ?? 1)
        let test = a["test"] as? Bool == true ? "[TEST] " : ""
        var parts = [(title: "\(test)\(a["levelName"] as? String ?? "Alerte") — \(a["title"] as? String ?? "")",
                      body: a["description"] as? String ?? "")]
        if a["category"] as? String == "seisme" {
            parts = Quake.notificationParts(a, settings: settings).map { (title: test + $0.title, body: $0.body) }
        }
        // Alerte mobile demandée dans M-Alert-sender : urgente avec le son d'alerte mobile, quel que soit le niveau.
        let mobile = a["mobileAlert"] as? Bool == true
        // Son choisi dans M-Alert-sender : seule l'alerte mobile est embarquée (alerte-mobile.caf) ;
        // un autre son choisi donne le son par défaut d'iOS.
        let chosen = (a["sound"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        postParts(id: id, parts: parts, level: level,
                  timeSensitive: (settings["timeSensitive"] as? Bool ?? true) && (level >= 3 || mobile || chosen == "alerte-mobile"),
                  critical: false,
                  alertSound: chosen.map { $0 == "alerte-mobile" } ?? (level >= 3 || mobile))
    }

    /// Vigilance relancée en alerte mobile (même identifiant que la page : pas de doublon).
    static func notifyVigMobile(_ g: [String: Any], settings: [String: Any]) {
        let id = "vig-" + (g["key"] as? String ?? "")
        guard claim(id) else { return }
        let names = ["", "verte", "jaune", "orange", "rouge", "majeure"]
        let level = max(0, min(5, Int(num(g["level"]) ?? 2)))
        let kinds = settings["kindNames"] as? [String: Any]
        let fr = (kinds?["fr"] ?? kinds?.values.first) as? [String: Any]
        let ph = fr?["p\(Int(num(g["phenomenon"]) ?? 0))"] as? String ?? ""
        let deps = (g["departments"] as? [String] ?? [])
        let body = "Météo-France" + (deps.isEmpty ? "" : " · " + deps.prefix(8).joined(separator: ", ") + (deps.count > 8 ? "…" : ""))
        postParts(id: id, parts: [(title: "Rappel · Vigilance \(names[level])" + (ph.isEmpty ? "" : " — \(ph)"), body: body)], level: 3,
                  timeSensitive: settings["timeSensitive"] as? Bool ?? true, critical: false, alertSound: true)
    }

    /// Notification de M-Alert qui déclenche l'alerte mobile (même identifiant que la page : pas de doublon).
    static func notifyMobileNotice(_ n: [String: Any], settings: [String: Any]) {
        let id = "notice-" + (n["id"] as? String ?? "")
        guard claim(id) else { return }
        let test = n["test"] as? Bool == true ? "[TEST] " : ""
        postParts(id: id, parts: [(title: test + (n["title"] as? String ?? "M-Alert"), body: n["body"] as? String ?? "")], level: 3,
                  timeSensitive: settings["timeSensitive"] as? Bool ?? true, critical: false, alertSound: true)
    }

    /// Alerte annulée reçue en arrière-plan.
    static func notifyCancel(_ a: [String: Any], settings: [String: Any]) {
        let id = "void-" + (a["id"] as? String ?? "")
        guard claim(id) else { return }
        let test = a["test"] as? Bool == true ? "[TEST] " : ""
        let parts = Quake.cancelNotificationParts(a, settings: settings).map { (title: test + "❌ " + $0.title, body: $0.body) }
        postParts(id: id, parts: parts, level: 2,
                  timeSensitive: settings["timeSensitive"] as? Bool ?? true, critical: false, alertSound: true)
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

    private static func title(_ l: String, strong: Bool) -> String {
        switch l {
        case "en": return strong ? "Emergency Alert" : "Earthquake Alert"
        case "de": return strong ? "Notfallwarnung" : "Erdbebenwarnung"
        case "es": return strong ? "Alerta de emergencia" : "Alerta sísmica"
        default: return strong ? "Alerte d'urgence" : "Alerte sismique"
        }
    }

    /// Même disposition dans chaque langue (comme web/js/i18n.js).
    private static func body(_ l: String, _ i: String) -> String {
        let has = !i.isEmpty
        switch l {
        case "en": return "Earthquake Early Warning : Shaking is expected." + (has ? " Expected intensity is \(i)." : "") + " Stay calm and protect yourself. (M-Alert)"
        case "de": return "Erdbebenfrühwarnung : Erschütterungen werden erwartet." + (has ? " Die erwartete Intensität beträgt \(i)." : "") + " Bleiben Sie ruhig und schützen Sie sich. (M-Alert)"
        case "es": return "Alerta sísmica temprana : Se esperan sacudidas." + (has ? " La intensidad esperada es \(i)." : "") + " Mantenga la calma y protéjase. (M-Alert)"
        default: return "Alerte sismique précoce : Des secousses sont attendues." + (has ? " Intensité attendue : \(i)." : "") + " Restez calme et protégez-vous. (M-Alert)"
        }
    }

    static func langs(_ settings: [String: Any]) -> [String] {
        let l = settings["notifLangs"] as? [String] ?? []
        return l.isEmpty ? ["fr", "en"] : l
    }

    /// Langue principale en haut, seconde en dessous :
    ///   Alerte sismique précoce : Des secousses sont attendues. Intensité attendue : 4. Restez calme et protégez-vous. (M-Alert)
    /// Intensité : celle de mes départements, sinon l'intensité maximale de l'alerte.
    static func notificationParts(_ a: [String: Any], settings: [String: Any]) -> [(title: String, body: String)] {
        let local = localIntensity(a, settings: settings)
        let intensity = (local != nil && local != "0") ? local! : (a["shindo"] as? String ?? "")
        let strong = Int(num(a["level"]) ?? 1) >= 4 || rank(intensity) >= 5
        return langs(settings).map { (title: title($0, strong: strong), body: body($0, intensity)) }
    }

    /// Alerte annulée (toutes les alertes), deux langues :
    ///   L'alerte de tremblement de terre émise à 14 h 32 a été annulée. (M-Alert)
    ///   The earthquake alert triggered at 14:32 has been canceled. (M-Alert)
    static func cancelNotificationParts(_ a: [String: Any], settings: [String: Any]) -> [(title: String, body: String)] {
        let cat = a["category"] as? String ?? "meteo"
        let key = cat == "meteo" ? "p\(Int(num(a["phenomenon"]) ?? 0))" : cat
        var hm = ""
        if let s = a["createdAt"] as? String {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let d = iso.date(from: s) ?? ISO8601DateFormatter().date(from: s)
            if let d = d {
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US_POSIX")
                f.dateFormat = "HH:mm"
                hm = f.string(from: d)
            }
        }
        let names = settings["kindNames"] as? [String: Any]
        var titles: [String] = []
        var bodies: [String] = []
        for l in langs(settings) {
            let ph = (names?[l] as? [String: Any])?[key] as? String ?? (a["title"] as? String ?? "")
            switch l {
            case "en":
                titles.append("Alert canceled")
                bodies.append("The \(ph) alert triggered at \(hm) has been canceled. (M-Alert)")
            case "de":
                titles.append("Warnung aufgehoben")
                bodies.append("Die Warnung „\(ph)“ von \(hm) Uhr wurde aufgehoben. (M-Alert)")
            case "es":
                titles.append("Alerta cancelada")
                bodies.append("La alerta de \(ph) emitida a las \(hm) ha sido cancelada. (M-Alert)")
            default:
                titles.append("Alerte annulée")
                let vowel = ph.first.map { "aeiouyhàâéèêîïôûü".contains(Character($0.lowercased())) } ?? false
                bodies.append("L'alerte \(vowel ? "d'" : "de ")\(ph) émise à \((hm.hasPrefix("0") ? String(hm.dropFirst()) : hm).replacingOccurrences(of: ":", with: " h ")) a été annulée. (M-Alert)")
            }
        }
        return Array(zip(titles, bodies)).map { (title: $0.0, body: $0.1) }
    }
}
