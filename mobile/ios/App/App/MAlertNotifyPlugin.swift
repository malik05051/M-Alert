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
    ]

    private static let alertSound = "alerte-mobile.caf"

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
        let content = UNMutableNotificationContent()
        content.title = call.getString("title") ?? "M-Alert"
        content.body = call.getString("body") ?? ""
        content.threadIdentifier = "malert-alerts"
        let level = call.getInt("level") ?? 1
        let critical = call.getBool("critical") ?? false
        let timeSensitive = call.getBool("timeSensitive") ?? false
        let soundName = call.getString("sound") ?? "default"
        let custom = soundName == "alerte-mobile"
            && Bundle.main.url(forResource: "alerte-mobile", withExtension: "caf") != nil

        if critical {
            content.sound = custom
                ? UNNotificationSound.criticalSoundNamed(UNNotificationSoundName(MAlertNotifyPlugin.alertSound), withAudioVolume: 1.0)
                : UNNotificationSound.defaultCriticalSound(withAudioVolume: 1.0)
        } else {
            content.sound = custom ? UNNotificationSound(named: UNNotificationSoundName(MAlertNotifyPlugin.alertSound)) : .default
        }
        if #available(iOS 15.0, *) {
            content.interruptionLevel = critical ? .critical : (timeSensitive ? .timeSensitive : .active)
            content.relevanceScore = min(1.0, Double(level) / 5.0)
        }
        content.userInfo = ["id": call.getString("id") ?? ""]

        let id = call.getString("id") ?? UUID().uuidString
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
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
