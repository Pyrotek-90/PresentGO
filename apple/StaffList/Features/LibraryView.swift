import SwiftUI
import Supabase

/// The team's song library: search by title, artist or CCLI number.
struct LibraryView: View {
    @Environment(SessionStore.self) private var session
    @State private var songs: [Song] = []
    @State private var search = ""
    @State private var loading = true
    @State private var error: String?
    @State private var creating = false
    @State private var importing = false
    @State private var offline = false
    @State private var adding = AddToSetModel()
    /// Settings → Song Library language: songs in other languages (and occasion songs) are left
    /// out of the main list, as on the web; ⇅ → Also show brings them in.
    @AppStorage("libraryLanguage") private var libraryLanguage = "English"
    @AppStorage("librarySort") private var sort = "az"          // "az" | "recent"
    @State private var showFilters = false
    @State private var rotationOnly = false
    @State private var activeThemes: Set<String> = []
    @State private var include: Set<String> = []                // "occ:Christmas", "lang:Hindi"
    @State private var only: Set<String> = []                   // filled-in bubbles: only these
    @State private var lastUsed: [UUID: String] = [:]           // song → latest set date it was in

    // Tags, like src/lib/songTags.js.
    static let themes = ["Worship", "Praise", "Communion", "Offering", "Opening", "Closing", "Prayer", "Salvation", "Healing"]
    static let occasions = ["Christmas", "Easter", "Good Friday", "Baptism", "Wedding", "Funeral"]
    private static func isOccasion(_ t: String) -> Bool { occasions.contains { $0.caseInsensitiveCompare(t) == .orderedSame } }
    static func themes(_ s: Song) -> [String] { (s.metadata?.themes ?? []).filter { !isOccasion($0) } }
    static func occasions(_ s: Song) -> [String] {
        let legacy = (s.metadata?.themes ?? []).compactMap { t in occasions.first { $0.caseInsensitiveCompare(t) == .orderedSame } }
        var out: [String] = []
        for o in (s.metadata?.occasions ?? []) + legacy where !out.contains(o) { out.append(o) }
        return out
    }
    static func language(_ s: Song) -> String {
        let l = s.metadata?.language ?? ""
        return l.isEmpty ? "English" : l
    }

    private func visibleByDefault(_ s: Song) -> Bool { Self.occasions(s).isEmpty && Self.language(s) == libraryLanguage }
    private func included(_ s: Song) -> Bool {
        let occ = Self.occasions(s)
        return (occ.isEmpty || occ.contains { include.contains("occ:\($0)") })
            && (Self.language(s) == libraryLanguage || include.contains("lang:\(Self.language(s))"))
    }
    private func matchesOnly(_ s: Song) -> Bool {
        only.isEmpty || only.contains { k in
            k.hasPrefix("occ:") ? Self.occasions(s).contains(String(k.dropFirst(4))) : Self.language(s) == String(k.dropFirst(5))
        }
    }
    private var inView: [Song] { songs.filter(included) }
    private var hiddenCount: Int { songs.count - inView.count }

    private var occasionCounts: [(String, Int)] {
        var m: [String: Int] = [:]
        for s in songs { for o in Self.occasions(s) { m[o, default: 0] += 1 } }
        let known = Self.occasions.filter { m[$0] != nil }
        let custom = m.keys.filter { !Self.occasions.contains($0) }.sorted()
        return (known + custom).map { ($0, m[$0]!) }
    }
    private var languageCounts: [(String, Int)] {
        var m: [String: Int] = [:]
        for s in songs where Self.language(s) != libraryLanguage { m[Self.language(s), default: 0] += 1 }
        return m.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.map { ($0.key, $0.value) }
    }
    private var themeCounts: [(String, Int)] {
        var m: [String: Int] = [:]
        for s in inView { for t in Self.themes(s) { m[t, default: 0] += 1 } }
        let custom = m.keys.filter { !Self.themes.contains($0) }.sorted()
        return (Self.themes + custom).map { ($0, m[$0] ?? 0) }
    }
    private var activeFilterCount: Int { activeThemes.count + (rotationOnly ? 1 : 0) + only.count }

    private var filtered: [Song] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        // A search looks through every song, including hidden ones, so nothing is ever lost.
        let pool = q.isEmpty ? inView : songs
        let byTitle: (Song, Song) -> Bool = { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        return pool
            .filter { q.isEmpty || $0.title.lowercased().contains(q) || ($0.artist ?? "").lowercased().contains(q) || ($0.ccliNumber ?? "").contains(q) }
            .filter { !rotationOnly || ($0.metadata?.rotation ?? false) }
            .filter(matchesOnly)
            .filter { activeThemes.isEmpty || Self.themes($0).contains(where: activeThemes.contains) }
            .sorted { a, b in
                if sort == "recent" {
                    let la = lastUsed[a.id] ?? "", lb = lastUsed[b.id] ?? ""
                    if la != lb { return la > lb }
                }
                return byTitle(a, b)
            }
    }

    private func tagLine(_ s: Song) -> String? {
        guard !visibleByDefault(s) else { return nil }
        let parts = Self.occasions(s) + (Self.language(s) != libraryLanguage ? [Self.language(s)] : [])
        return parts.joined(separator: " · ")
    }

    var body: some View {
        NavigationStack {
            List {
                if showFilters { filterBar }
                ForEach(filtered) { song in
                    if adding.active {
                        HStack(spacing: 10) {
                            NavigationLink(value: song) { SongRow(song: song, tag: tagLine(song)) }
                            AddSongButton(song: song, model: adding)
                        }
                    } else {
                        NavigationLink(value: song) {
                            SongRow(song: song, tag: tagLine(song))
                        }
                    }
                }
            }
            .listStyle(.plain)
            .safeAreaInset(edge: .top, spacing: 0) {
                if adding.active { AddToSetBar(model: adding) }
            }
            .overlay { overlay }
            .navigationTitle("Songs")
            .safeAreaInset(edge: .top) {
                if offline {
                    Label("Offline — showing your saved library", systemImage: "icloud.slash")
                        .font(.footnote).foregroundStyle(.secondary).padding(.vertical, 4)
                }
            }
            .navigationDestination(for: Song.self) { SongView(song: $0) }
            .searchable(text: $search, prompt: "Title, artist or CCLI #")
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { withAnimation(.snappy) { showFilters.toggle() } } label: {
                        Label(activeFilterCount > 0 ? "Filter (\(activeFilterCount))" : "Filter",
                              systemImage: activeFilterCount > 0 || showFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                    sortMenu
                }
                if session.currentTeam?.canEdit ?? false {
                    ToolbarItem(placement: .primaryAction) {
                        if adding.active {
                            Button { adding.active = false } label: { Label("Done", systemImage: "checkmark") }
                                .labelStyle(.titleAndIcon)
                        } else {
                            Menu {
                                Button("Add Songs to a Set", systemImage: "text.badge.plus") {
                                    Task { await adding.start(team: session.currentTeam, user: session.user) }
                                }
                                Divider()
                                Button("New Song", systemImage: "square.and.pencil") { creating = true }
                                Button("Import Charts…", systemImage: "square.and.arrow.down.on.square") { importing = true }
                            } label: {
                                Label("Add", systemImage: "plus")
                            }
                        }
                    }
                }
            }
            .sheet(isPresented: $creating) { SongEditorView() }
            .sheet(isPresented: $importing) { BulkImportView(existingTitles: Set(songs.map(\.title))) }
            .refreshable { await load() }
            .task { await load() }
            .onReceive(NotificationCenter.default.publisher(for: .songsChanged)) { _ in
                Task { await load() }
            }
        }
    }

    @ViewBuilder private var overlay: some View {
        if loading && songs.isEmpty {
            ProgressView()
        } else if let error {
            ContentUnavailableView("Couldn't load songs", systemImage: "wifi.exclamationmark", description: Text(error))
        } else if songs.isEmpty {
            ContentUnavailableView("No songs yet", systemImage: "music.note",
                                   description: Text("Tap + to add a song or import a chart file."))
        } else if filtered.isEmpty {
            if search.isEmpty {
                ContentUnavailableView("No songs match your filters", systemImage: "line.3.horizontal.decrease.circle",
                    description: Text(hiddenCount > 0 ? "\(hiddenCount) occasion or other-language song\(hiddenCount == 1 ? " is" : "s are") hidden — show them from the ⇅ menu." : ""))
            } else {
                ContentUnavailableView.search(text: search)
            }
        }
    }

    // MARK: Sort and filters (like the web Song Library)

    private var sortMenu: some View {
        Menu {
            Section("Sort") {
                Picker("Sort", selection: $sort) {
                    Text("Recently used in a set").tag("recent")
                    Text("A–Z").tag("az")
                }
            }
            if !occasionCounts.isEmpty || !languageCounts.isEmpty {
                Section("Also show") {
                    ForEach(occasionCounts, id: \.0) { o, n in includeToggle("occ:\(o)", "\(o) (\(n))") }
                    ForEach(languageCounts, id: \.0) { l, n in includeToggle("lang:\(l)", "\(l) (\(n))") }
                    if !include.isEmpty {
                        Button("Back to the Main List", systemImage: "arrow.uturn.backward") { include = []; only = [] }
                    }
                }
            }
        } label: {
            Label(sort == "recent" ? "Recent" : "A–Z", systemImage: include.isEmpty ? "arrow.up.arrow.down.circle" : "arrow.up.arrow.down.circle.fill")
        }
        .accessibilityLabel("Sort and show more songs")
    }

    private func includeToggle(_ key: String, _ title: String) -> some View {
        Toggle(title, isOn: Binding(get: { include.contains(key) }, set: { on in
            if on { include.insert(key) } else { include.remove(key) }
            only.remove(key)
            if on { showFilters = true }
        }))
    }

    private var filterBar: some View {
        FlowLayout(spacing: 6) {
            chip("Rotation List", count: inView.filter { $0.metadata?.rotation ?? false }.count, on: rotationOnly, strong: true) { rotationOnly.toggle() }
            ForEach(include.sorted(), id: \.self) { k in
                let name = String(k[k.index(after: k.firstIndex(of: ":")!)...])
                let n = inView.filter { k.hasPrefix("occ:") ? Self.occasions($0).contains(name) : Self.language($0) == name }.count
                chip(name, count: n, on: only.contains(k), strong: true) {
                    if only.contains(k) { only.remove(k) } else { only.insert(k) }
                }
            }
            Rectangle().fill(Color.secondary.opacity(0.3)).frame(width: 1, height: 18).padding(.horizontal, 2)
            ForEach(themeCounts, id: \.0) { t, n in
                chip(t, count: n, on: activeThemes.contains(t), strong: false) {
                    if activeThemes.contains(t) { activeThemes.remove(t) } else { activeThemes.insert(t) }
                }
                .disabled(n == 0 && !activeThemes.contains(t))
                .opacity(n == 0 && !activeThemes.contains(t) ? 0.35 : 1)
            }
            if activeFilterCount > 0 {
                Button { activeThemes = []; rotationOnly = false; only = [] } label: {
                    Label("Clear", systemImage: "xmark").font(.caption)
                }
                .buttonStyle(.borderless).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .listRowSeparator(.hidden)
    }

    /// A filter bubble: "strong" ones (Rotation List, occasions, languages) fill in solid when on.
    private func chip(_ title: String, count: Int, on: Bool, strong: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                Text("\(count)").opacity(0.65)
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 9).frame(height: 26)
            .foregroundStyle(on ? (strong ? .white : Theme.accentLight) : (strong ? Theme.accentLight : .secondary))
            .background(on ? (strong ? Theme.accent : Theme.accent.opacity(0.2)) : .clear, in: Capsule())
            .overlay(Capsule().stroke(on || strong ? Theme.accent.opacity(on ? 1 : 0.5) : Color.secondary.opacity(0.35)))
        }
        .buttonStyle(.borderless)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private struct UsedSet: Decodable {
        let service_date: String?
        let created_at: String?
        let set_items: [Item]?
        struct Item: Decodable { let type: String; let content: JSONObject? }
    }

    /// The latest set each song was used in, for "Recently used in a set".
    private func loadLastUsed(team: UUID) async {
        guard let rows: [UsedSet] = try? await supabase.from("sets").select("service_date,created_at,set_items(type,content)")
            .eq("church_id", value: team).limit(1000).execute().value else { return }
        var m: [UUID: String] = [:]
        for r in rows {
            let d = r.service_date ?? r.created_at ?? ""
            for it in r.set_items ?? [] where it.type == "song" {
                if let id = it.content?["song_id"]?.stringValue.flatMap(UUID.init(uuidString:)), d > (m[id] ?? "") { m[id] = d }
            }
        }
        lastUsed = m
    }

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        Task { await loadLastUsed(team: team.id) }
        loading = true
        defer { loading = false }
        do {
            songs = try await supabase.from("songs")
                .select(Song.columns)
                .eq("church_id", value: team.id)
                .order("title")
                .limit(5000)
                .execute()
                .value
            error = nil
            offline = false
            OfflineStore.save(songs, as: OfflineStore.songsKey(team.id))
        } catch {
            if let saved = OfflineStore.load([Song].self, from: OfflineStore.songsKey(team.id)) {
                songs = saved
                offline = true
            } else {
                self.error = error.localizedDescription
            }
        }
    }
}

struct SongRow: View {
    let song: Song
    /// Occasion / other language, for songs outside the main list.
    var tag: String? = nil

    /// Original key first, then saved keys: "G, A".
    private var keys: String {
        var out: [String] = []
        for k in [song.metadata?.originalKey ?? song.metadata?.key] + (song.metadata?.transposedKeys ?? []).map(Optional.some) {
            if let k, !k.isEmpty { let s = Song.shortKey(k); if !out.contains(s) { out.append(s) } }
        }
        return out.joined(separator: ", ")
    }

    var body: some View {
        HStack(spacing: 12) {
            // Title · Artist on one line, like the web list.
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(song.title).font(.body.weight(.medium)).lineLimit(1).layoutPriority(1)
                if let artist = song.artist, !artist.isEmpty {
                    Text("· \(artist)").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                }
                if let tag {
                    Text(tag).font(.caption2)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .foregroundStyle(.orange.opacity(0.9))
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(.orange.opacity(0.4)))
                        .lineLimit(1).fixedSize()
                }
            }
            Spacer(minLength: 8)
            if !keys.isEmpty {
                Text(keys)
                    .font(.caption.monospaced().bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.tint.opacity(0.2), in: Capsule())
                    .fixedSize()
            }
        }
    }
}
