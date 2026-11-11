// StaffList — the TV (external display) scene.
//
// When the user turns on Screen Mirroring to an Apple TV / AirPlay TV, iOS hands the app a
// second, non-interactive scene for that display (AppDelegate routes it here). While nothing
// is placed in it, iOS keeps mirroring the iPad / iPhone. ExternalDisplayPlugin puts a window
// with the presentation page into this scene when presenting starts, and removes it at End,
// which returns the TV to plain mirroring.

import UIKit

/// The TV scene currently connected, if any. Read by ExternalDisplayPlugin.
final class TVDisplay {
    static let shared = TVDisplay()
    static let didChange = Notification.Name("StaffListTVDisplayDidChange")

    private(set) weak var scene: UIWindowScene?

    func connect(_ scene: UIWindowScene) {
        self.scene = scene
        NotificationCenter.default.post(name: TVDisplay.didChange, object: nil)
    }

    func disconnect(_ scene: UIWindowScene) {
        if self.scene === scene { self.scene = nil }
        NotificationCenter.default.post(name: TVDisplay.didChange, object: nil)
    }
}

class TVSceneDelegate: UIResponder, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        TVDisplay.shared.connect(windowScene)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        guard let windowScene = scene as? UIWindowScene else { return }
        TVDisplay.shared.disconnect(windowScene)
    }
}
