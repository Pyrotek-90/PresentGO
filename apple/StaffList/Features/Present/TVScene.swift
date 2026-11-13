import SwiftUI
import UIKit

/// The TV (AirPlay or HDMI). iOS gives the app a separate, non-interactive scene for it. While
/// nothing is presenting we leave it empty, so the TV keeps mirroring the iPad; while a set is
/// presenting we put a window there that shows only the current slide.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if session.role == .windowExternalDisplayNonInteractive {
            let config = UISceneConfiguration(name: "TV", sessionRole: session.role)
            config.delegateClass = TVSceneDelegate.self
            return config
        }
        return UISceneConfiguration(name: nil, sessionRole: session.role)
    }
}

final class TVSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private weak var scene: UIWindowScene?
    private var observer: NSObjectProtocol?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        self.scene = scene
        TVConnection.shared.connected = true
        observer = NotificationCenter.default.addObserver(forName: .presentationChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.update() }
        }
        MainActor.assumeIsolated { update() }
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        window?.isHidden = true
        window = nil
        TVConnection.shared.connected = false
    }

    @MainActor private func update() {
        guard let scene else { return }
        if PresentationModel.shared.active {
            if window == nil {
                let w = UIWindow(windowScene: scene)
                let host = UIHostingController(rootView: TVSlideScreen())
                host.view.backgroundColor = .black
                w.rootViewController = host
                w.isHidden = false
                window = w
            }
        } else {
            window?.isHidden = true
            window?.windowScene = nil   // hand the TV back to mirroring
            window = nil
        }
    }
}

/// Whether a TV is connected, for the presenter's status line.
@MainActor
@Observable
final class TVConnection {
    static let shared = TVConnection()
    var connected = false
}

struct TVSlideScreen: View {
    private var model = PresentationModel.shared

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            SlideView(slide: model.current, blank: model.blank, fit: model.fit(for: model.current))
        }
        .animation(.easeInOut(duration: 0.2), value: model.index)
        .animation(.easeInOut(duration: 0.2), value: model.blank)
    }
}
