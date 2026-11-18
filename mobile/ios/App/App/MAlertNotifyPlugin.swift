import Foundation
import Capacitor
import UserNotifications

/// Notifications d'alerte M-Alert sur iOS (appelées par la page, voir mobile/mobile.js).
///
/// - Niveau d'interruption : « urgente » (Time Sensitive, traverse les modes de concentration) dès
///   l'orange, « critique » (sonne même en mode silencieux et en Ne pas déranger) en rouge et majeure.
///   Les alertes critiques demandent l'autorisation d'Apple (droit
///   com.apple.developer.usernotifications.critical-alerts dans le profil de signature) ; sans elle,
///   iOS les présente comme des notifications urgentes ou normales.
/// - Son : alerte-mobile.caf (dans l'application) dès l'orange, son par défaut sinon.
@objc(MAlertNotifyPlugin)
public class MAlertNotifyPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "MAlertNotifyPlugin"
    public let jsName = "MAlertNotify"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "permission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        UNUserNotificationCenter.current().delegate = self
    }

    private func describe(_ s: UNNotificationSettings) -> [String: Any] {
        func state(_ v: UNNotificationSetting) -> String {
            switch v {
            case .enabled: return "enabled"
            case .disabled: return "disabled"
            default: return "notSupported"
            }
        }
        let display: String
        switch s.authorizationStatus {
        case .authorized, .provisional, .ephemeral: display = "granted"
        case .denied: display = "denied"
        default: display = "prompt"
        }
        var out: [String: Any] = ["display": display, "critical": state(s.criticalAlertSetting), "sound": state(s.soundSetting)]
        if #available(iOS 15.0, *) {
            out["timeSensitive"] = state(s.timeSensitiveSetting)
        } else {
            out["timeSensitive"] = "notSupported"
        }
        return out
    }

    @objc func permission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            call.resolve(self.describe(s))
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        // .criticalAlert : la demande n'apparaît que si l'application a le droit d'Apple.
        let options: UNAuthorizationOptions = [.alert, .sound, .badge, .criticalAlert]
        UNUserNotificationCenter.current().requestAuthorization(options: options) { _, _ in
            UNUserNotificationCenter.current().getNotificationSettings { s in
                call.resolve(self.describe(s))
            }
        }
    }

    @objc func notify(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? UUID().uuidString
        // Déjà notifiée par la réception en arrière-plan (ou l'inverse) : pas de doublon.
        guard AlertNotifier.claim(id) else {
            call.resolve()
            return
        }
        // Une notification par langue (parts), sinon une seule.
        var parts = (call.getArray("parts") ?? []).compactMap { v -> (title: String, body: String)? in
            guard let o = v as? JSObject, let t = o["title"] as? String, let b = o["body"] as? String else { return nil }
            return (title: t, body: b)
        }
        if parts.isEmpty { parts = [(title: call.getString("title") ?? "M-Alert", body: call.getString("body") ?? "")] }
        AlertNotifier.postParts(id: id, parts: parts,
                                level: call.getInt("level") ?? 1, timeSensitive: call.getBool("timeSensitive") ?? false,
                                critical: call.getBool("critical") ?? false, alertSound: call.getString("sound") == "alerte-mobile") { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// Réglages de la page et réception des alertes en arrière-plan (AlertListener).
    @objc func configure(_ call: CAPPluginCall) {
        let settings = call.getString("settings") ?? "{}"
        let background = call.getBool("background") ?? true
        DispatchQueue.main.async {
            AlertListener.shared.configure(settingsJson: settings, background: background)
            call.resolve(["background": background])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let l = AlertListener.shared
            call.resolve(["running": l.running, "connected": l.connected, "location": l.locationState])
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    /// Ouvre une adresse dans Safari (mise à jour : page de la nouvelle version et son .ipa).
    @objc func openUrl(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), s.hasPrefix("https://"), let url = URL(string: s) else {
            call.reject("adresse refusée")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url)
            call.resolve()
        }
    }

    // Application au premier plan : le bandeau M-Alert est déjà affiché et sonne ; la notification
    // va seulement dans le centre de notifications (sans son ni bannière en double).
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if #available(iOS 14.0, *) {
            completionHandler([.list])
        } else {
            completionHandler([])
        }
    }

    // Notification touchée : la page affiche l'alerte.
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                       withCompletionHandler completionHandler: @escaping () -> Void) {
        let id = response.notification.request.content.userInfo["id"] as? String ?? ""
        notifyListeners("tap", data: ["id": id], retainUntilConsumed: true)
        completionHandler()
    }
}
