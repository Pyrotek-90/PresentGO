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
/// The tab icons are rounded squares like the title-bar buttons: outlined, and filled when chosen.
struct MainTabView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab = "sets"

    @State private var visited: Set<String> = ["sets"]

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
                        .opacity(tab == t.id ? 1 : 0)
                        .allowsHitTesting(tab == t.id)
                        .accessibilityHidden(tab != t.id)
                }
            }
        }
        // `spacing` lets every page scroll a little past the bubble so its last row is fully visible.
        .safeAreaInset(edge: .bottom, spacing: 18) {
            // A floating, see-through bubble like the system tab bar: the page scrolls under it.
            HStack(spacing: 2) {
                ForEach(tabs, id: \.id) { t in
                    Button {
                        visited.insert(t.id)
                        tab = t.id
                    } label: {
                        Text(t.title)
                            .font(.footnote.weight(tab == t.id ? .semibold : .medium))
                            .lineLimit(1).minimumScaleFactor(0.8)
                            .foregroundStyle(tab == t.id ? Theme.accentLight : .primary)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(tab == t.id ? Color.primary.opacity(0.12) : .clear, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(tab == t.id ? [.isSelected, .isButton] : .isButton)
                }
            }
            .padding(5)
            .modifier(GlassBubble())
            .padding(.horizontal, 20)
            .padding(.bottom, 2)
        }
        .onChange(of: tabs.map(\.id)) { _, ids in if !ids.contains(tab) { tab = "sets" } }
    }

    /// iPad: the system tab bar (shown as page names at the top).
    private var padTabs: some View {
        TabView(selection: $tab) {
            SetsView()
                .tabItem { item("Sets", "music.note.list", "sets") }.tag("sets")
            LibraryView()
                .tabItem { item("Songs", "books.vertical", "songs") }.tag("songs")
            if session.currentTeam?.canEdit ?? false {
                TeamView()
                    .tabItem { item("Team", "person.3", "team") }.tag("team")
            }
            MediaLibraryView()
                .tabItem { item("Media", "photo.on.rectangle", "media") }.tag("media")
            SettingsView()
                .tabItem { item("Settings", "gearshape", "settings") }.tag("settings")
        }
    }

    private func item(_ title: String, _ symbol: String, _ id: String) -> some View {
        Label { Text(title) } icon: { Image(uiImage: TabIcon.image(symbol, selected: tab == id)) }
    }
}

/// Draws a tab icon as a template image: a rounded square with the symbol inside.
enum TabIcon {
    private static var cache: [String: UIImage] = [:]

    static func image(_ symbol: String, selected: Bool) -> UIImage {
        let key = symbol + (selected ? "#on" : "#off")
        if let hit = cache[key] { return hit }
        let size = CGSize(width: 30, height: 30)
        let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1.5, dy: 1.5)
        let config = UIImage.SymbolConfiguration(pointSize: 13, weight: selected ? .bold : .semibold)
        let glyph = UIImage(systemName: symbol, withConfiguration: config)?.withRenderingMode(.alwaysTemplate)
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            let box = UIBezierPath(roundedRect: rect, cornerRadius: 8.5)
            UIColor.black.setFill(); UIColor.black.setStroke()
            if selected { box.fill() } else { box.lineWidth = 1.6; box.stroke() }
            if let glyph {
                let g = glyph.size
                let r = CGRect(x: (size.width - g.width) / 2, y: (size.height - g.height) / 2, width: g.width, height: g.height)
                if selected {
                    // Knock the symbol out of the filled square.
                    glyph.withTintColor(.black).draw(in: r, blendMode: .destinationOut, alpha: 1)
                } else {
                    glyph.withTintColor(.black).draw(in: r)
                }
            }
        }.withRenderingMode(.alwaysTemplate)
        cache[key] = img
        return img
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
