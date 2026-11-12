import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.phase {
        case .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
        case .signedOut:
            SignInView()
        case .signedIn:
            MainTabView()
        }
    }
}

/// Tabs on iPhone; on iPad, iOS 18+ shows them as a sidebar-adaptable bar automatically.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        TabView {
            SetsView()
                .tabItem { Label("Sets", systemImage: "music.note.list") }
            LibraryView()
                .tabItem { Label("Songs", systemImage: "books.vertical") }
            MediaLibraryView()
                .tabItem { Label("Media", systemImage: "photo.on.rectangle") }
            if session.currentTeam?.canEdit ?? false {
                TeamView()
                    .tabItem { Label("Team", systemImage: "person.3") }
            }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .id(session.currentTeam?.id)   // reload every tab when the team changes
    }
}
