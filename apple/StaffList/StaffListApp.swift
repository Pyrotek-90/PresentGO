import SwiftUI

@main
struct StaffListApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate   // TV output (Present/TVScene.swift)
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.observeAuth() }
                .tint(.staffTeal)
                .preferredColorScheme(.dark)
        }
    }
}

extension Color {
    /// The teal from the StaffList crest.
    static let staffTeal = Color(red: 0.06, green: 0.46, blue: 0.56)
}
