import UIKit
import Capacitor

/// Vue principale de l'application : la page M-Alert dans Capacitor, sans zoom, avec le plugin de
/// notifications d'alerte (MAlertNotifyPlugin).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MAlertNotifyPlugin())
        // Pas de zoom (pincement ni double appui) : un toucher ne doit jamais agrandir la page.
        if let scroll = webView?.scrollView {
            scroll.pinchGestureRecognizer?.isEnabled = false
            scroll.minimumZoomScale = 1
            scroll.maximumZoomScale = 1
            scroll.bouncesZoom = false
        }
    }
}
