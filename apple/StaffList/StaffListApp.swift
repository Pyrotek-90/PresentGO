import SwiftUI

@main
struct StaffListApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate   // TV output (Present/TVScene.swift)
    @State private var session = SessionStore()
    @AppStorage("appearance") private var appearance = "dark"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .task { await session.observeAuth() }
                .tint(.staffTeal)
                .preferredColorScheme(appearance == "light" ? .light : appearance == "system" ? nil : .dark)
        }
    }
}

extension Color {
    /// "#0e7490" → Color.
    init?(hex: String?) {
        guard var h = hex?.trimmingCharacters(in: .whitespaces), !h.isEmpty else { return nil }
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }

    /// The teal from the StaffList crest.
    static let staffTeal = Color(red: 0.06, green: 0.46, blue: 0.56)
}
