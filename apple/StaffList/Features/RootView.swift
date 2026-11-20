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
/// Tab icons are StaffList's own outline set (Assets: TabSets, TabSongs, TabTeam, TabMedia,
/// TabSettings), drawn as template images so they take the tab's color.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab = "sets"

    @State private var visited: Set<String> = ["sets"]
    @State private var chrome = ChromeState()

    private var tabs: [(id: String, title: String)] {
        var t = [("sets", "Sets"), ("songs", "Songs")]
        if session.currentTeam?.canEdit ?? false { t.append(("team", "Team")) }
        t += [("media", "Media"), ("settings", "Settings")]
        return t
    }

    var body: some View {
        Group {
            if UIDevice.current.userInterfaceIdiom == .phone { phoneTabs } else { padTabs }
        }
        .id(session.currentTeam?.id)   // reload every tab when the team changes
        .environment(chrome)
    }

    @ViewBuilder private func page(_ id: String) -> some View {
        switch id {
        case "sets": SetsView()
        case "songs": LibraryView()
        case "team": TeamView()
        case "media": MediaLibraryView()
        default: SettingsView()
        }
    }

    /// iPhone: a simple bar of page names, like the iPad's. Each page is made the first time it's
    /// opened and then kept, so it stays where you left it.
    private var phoneTabs: some View {
        ZStack {
            ForEach(tabs, id: \.id) { t in
                if visited.contains(t.id) {
                    page(t.id)
                        // Room at the end of every list and scroll view so the last row clears the bar.
                        .contentMargins(.bottom, 100, for: .scrollContent)
                        .contentMargins(.bottom, 86, for: .scrollIndicators)
                        .opacity(tab == t.id ? 1 : 0)
                        .allowsHitTesting(tab == t.id)
                        .accessibilityHidden(tab != t.id)
                }
            }
        }
        // The bubble floats over the page (the page scrolls under it); content margins above leave room.
        .overlay(alignment: .bottom) {
          if !chrome.hidePageBar {
            // A floating, see-through bubble like the system tab bar: the page scrolls under it.
            HStack(spacing: 2) {
                ForEach(tabs, id: \.id) { t in
                    Button {
                        visited.insert(t.id)
                        tab = t.id
                    } label: {
                        VStack(spacing: 3) {
                            Image(Self.tabIcon(t.id))
                                .renderingMode(.template)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 22, height: 22)
                                .accessibilityHidden(true)
                            Text(t.title)
                                .font(.caption.weight(tab == t.id ? .semibold : .medium))
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(tab == t.id ? Theme.accentLight : .primary)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .padding(.vertical, 3)
                        .background(tab == t.id ? Color.primary.opacity(0.12) : .clear,
                                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(tab == t.id ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(5)
            .modifier(GlassBubble())
            .padding(.horizontal, 20)
            .padding(.bottom, 2)
            .ignoresSafeArea(.keyboard)
            .transition(.move(edge: .bottom).combined(with: .opacity))
          }
        }
        .animation(.snappy, value: chrome.hidePageBar)
        .onChange(of: tabs.map(\.id)) { _, ids in if !ids.contains(tab) { tab = "sets" } }
    }

    /// iPad: the system tab bar (shown as page names at the top).
    private var padTabs: some View {
        TabView(selection: $tab) {
            SetsView()
                .tabItem { item("Sets", "sets") }.tag("sets")
            LibraryView()
                .tabItem { item("Songs", "songs") }.tag("songs")
            if session.currentTeam?.canEdit ?? false {
                TeamView()
                    .tabItem { item("Team", "team") }.tag("team")
            }
            MediaLibraryView()
                .tabItem { item("Media", "media") }.tag("media")
            SettingsView()
                .tabItem { item("Settings", "settings") }.tag("settings")
        }
    }

    private func item(_ title: String, _ id: String) -> some View {
        Label { Text(title) } icon: { Image(Self.tabIcon(id)).renderingMode(.template) }
    }

    /// The asset name of each tab's icon.
    static func tabIcon(_ id: String) -> String {
        switch id {
        case "sets": return "TabSets"
        case "songs": return "TabSongs"
        case "team": return "TabTeam"
        case "media": return "TabMedia"
        default: return "TabSettings"
        }
    }
}

/// Liquid Glass on iOS 26 and later; a thin material bubble before that.
struct GlassBubble: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular.interactive(), in: Capsule())
        } else {
            content
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Color.primary.opacity(0.1), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.25), radius: 10, y: 3)
        }
    }
}

/// App-wide chrome: a full-screen page (the Song Viewer) hides the iPhone page bar.
@Observable final class ChromeState {
    var hidePageBar = false
}
