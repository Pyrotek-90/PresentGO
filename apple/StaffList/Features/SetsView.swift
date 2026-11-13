import SwiftUI
import Supabase

/// The current team's sets, Upcoming and Past. Members only see sets they're scheduled on — the
/// database enforces that. Admins and Leaders can create, edit and delete sets.
struct SetsView: View {
    @Environment(SessionStore.self) private var session
    @State private var sets: [ServiceSet] = []
    @State private var loading = true
    @State private var error: String?
    @State private var path: [ServiceSet] = []
    @State private var creating = false
    @State private var offline = false
    @State private var showingInbox = false

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private var today: String { ServiceSet.dayFormatter.string(from: .now) }
    /// Today and later (and sets without a date), soonest first.
    private var upcoming: [ServiceSet] {
        sets.filter { ($0.serviceDate ?? today) >= today }
            .sorted { ($0.serviceDate ?? "9999") < ($1.serviceDate ?? "9999") }
    }
    /// Earlier sets, most recent first.
    private var past: [ServiceSet] {
        sets.filter { ($0.serviceDate ?? today) < today }
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if offline {
                    Label("Offline — showing your saved sets", systemImage: "icloud.slash")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if !upcoming.isEmpty {
                    Section("Upcoming") { ForEach(upcoming) { SetRow(set: $0) } }
                }
                if !past.isEmpty {
                    Section("Past") { ForEach(past) { SetRow(set: $0) } }
                }
            }
            .overlay {
                if loading && sets.isEmpty { ProgressView() }
                else if let error { ContentUnavailableView("Couldn't load sets", systemImage: "wifi.exclamationmark", description: Text(error)) }
                else if sets.isEmpty {
                    ContentUnavailableView {
                        Label("No sets yet", systemImage: "calendar")
                    } actions: {
                        if canEdit { Button("New Set") { creating = true }.buttonStyle(.borderedProminent) }
                    }
                }
            }
            .navigationTitle(session.currentTeam?.name ?? "Sets")
            .navigationDestination(for: ServiceSet.self) { SetDetailView(set: $0) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Notifications", systemImage: "bell") { showingInbox = true }
                }
                if canEdit {
                    ToolbarItem(placement: .primaryAction) {
                        Button("New Set", systemImage: "plus") { creating = true }
                    }
                }
            }
            .sheet(isPresented: $showingInbox) { InboxView() }
            .sheet(isPresented: $creating) {
                SetDetailsSheet(set: nil, onSaved: { created, _ in
                    sets.insert(created, at: 0)
                    path.append(created)
                })
            }
            .refreshable { await load() }
            .task { await load() }
            .onReceive(NotificationCenter.default.publisher(for: .setsChanged)) { _ in
                Task { await load() }
            }
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            // Newest first; the view splits them into Upcoming and Past.
            sets = try await supabase.from("sets")
                .select(ServiceSet.columns)
                .eq("church_id", value: team.id)
                .order("service_date", ascending: false)
                .limit(200)
                .execute()
                .value
            error = nil
            offline = false
            OfflineStore.save(sets, as: OfflineStore.setsKey(team.id))
            let soon = upcoming
            Task.detached(priority: .background) { await OfflineStore.prefetch(soon) }
        } catch {
            if let saved = OfflineStore.load([ServiceSet].self, from: OfflineStore.setsKey(team.id)) {
                sets = saved
                offline = true
            } else {
                self.error = error.localizedDescription
            }
        }
    }
}

struct SetRow: View {
    let set: ServiceSet

    var body: some View {
        NavigationLink(value: set) {
            VStack(alignment: .leading, spacing: 2) {
                Text(set.name).font(.body.weight(.medium))
                if let when = set.whenText {
                    Text(when).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
    }
}

extension ServiceSet {
    /// "Sunday, November 16, 2026 · 10:30 AM"
    var whenText: String? {
        var parts: [String] = []
        if let date { parts.append(date.formatted(.dateTime.weekday(.wide).month(.wide).day().year())) }
        if let time = timeValue { parts.append(time.formatted(date: .omitted, time: .shortened)) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// The service time as a Date today (only the hours and minutes matter).
    var timeValue: Date? {
        guard let serviceTime, serviceTime.count >= 5 else { return nil }
        let parts = serviceTime.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: .now)
    }
}

// MARK: - One set

struct SetDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State var set: ServiceSet
    @State private var items: [SetItem] = []
    @State private var songs: [UUID: Song] = [:]
    @State private var loading = true
    @State private var sheet: SheetKind?
    @State private var error: String?
    @State private var presenting = false
    @State private var showingCharts = false

    @State private var arranging: SetItem?
    @State private var notice: String?

    enum SheetKind: String, Identifiable {
        case addSong, announcement, details, media
        var id: String { rawValue }
    }

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }

    var body: some View {
        itemList
        .navigationTitle(set.name)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { showingCharts = true } label: {
                    Label("Song Viewer", systemImage: "book")
                }
                .help("Song Viewer: step through the songs in order")
                .disabled(!items.contains { $0.type == "song" })
                if session.currentTeam?.canPresent ?? false {
                    Button { presenting = true } label: {
                        Label("Present", systemImage: "play.display")
                    }
                    .disabled(items.isEmpty)
                }
                if canEdit {
                    addMenu
                    EditButton()
                }
            }
        }
        .fullScreenCover(isPresented: $presenting) { PresenterView(set: set) }
        .fullScreenCover(isPresented: $showingCharts) { SetChartsView(set: set) }
        .sheet(item: $sheet) { kind in sheetView(kind) }
        .sheet(item: $arranging) { item in
            if let id = item.songId, let song = songs[id] {
                SetArrangementSheet(song: song, initial: item.arrangement) { order in
                    Task { await setArrangement(order, on: item) }
                }
            }
        }
        .alert("Something went wrong", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "") }
        .refreshable { await load() }
        .task { await load() }
    }

    private var itemList: some View {
        List {
            Section {
                if items.isEmpty {
                    if loading {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else {
                        HStack(spacing: 12) {
                            Image(systemName: "square.stack").foregroundStyle(.secondary).frame(width: 30)
                            Text(canEdit ? "Nothing in this set yet — add songs, a welcome, announcements or media." : "The leader hasn't added the program yet.")
                                .foregroundStyle(.secondary)
                        }
                        if canEdit {
                            Button { sheet = .addSong } label: { Label("Add Song", systemImage: "plus") }
                        }
                    }
                }
                ForEach(items) { item in
                    row(item)
                }
                .onMove { from, to in move(from: from, to: to) }
                .onDelete { offsets in remove(at: offsets) }
                .moveDisabled(!canEdit)
                .deleteDisabled(!canEdit)
            } header: {
                setHeader
            }
            SetTeamSection(set: set)
        }
    }

    @ViewBuilder private func sheetView(_ kind: SheetKind) -> some View {
        switch kind {
        case .addSong:
            AddSongSheet { song in Task { await addSong(song) } }
        case .announcement:
            AnnouncementSheet { title, slides in Task { await addAnnouncement(title: title, slides: slides) } }
        case .details:
            SetDetailsSheet(set: set, hasProgram: !items.isEmpty, onSaved: { saved, message in
                set = saved
                notice = message
            }, onDeleted: { dismiss() })
        case .media:
            MediaLibraryView(onPick: { media in Task { await add(type: "media", content: media.setItemContent) } })
        }
    }

    private func addSong(_ song: Song) async {
        var content: JSONObject = [:]
        content["song_id"] = .string(song.id.uuidString)
        content["song_title"] = .string(song.title)
        content["song_artist"] = .string(song.artist ?? "")
        await add(type: "song", content: content)
    }

    private func addAnnouncement(title: String, slides: [[String]]) async {
        var slideValues: [AnyJSON] = []
        for lines in slides {
            let lineValues: [AnyJSON] = lines.map { AnyJSON.string($0) }
            let slide: JSONObject = ["lines": AnyJSON.array(lineValues)]
            slideValues.append(AnyJSON.object(slide))
        }
        var content: JSONObject = [:]
        content["title"] = .string(title)
        content["slides"] = .array(slideValues)
        await add(type: "announcement", content: content)
    }

    private func addWelcome() async {
        var content: JSONObject = [:]
        content["title"] = .string("Welcome")
        content["subtitle"] = .string("Glad you're here!")
        await add(type: "welcome", content: content)
    }

    private var setHeader: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let when = set.whenText { Text(when) }
            if let venue = set.venueText { Label(venue, systemImage: "mappin.and.ellipse").lineLimit(1) }
            ForEach(set.extraTimes ?? []) { t in
                Label("\(t.label): \(Self.extraTimeText(t))", systemImage: "clock")
            }
            if let rule = set.recurrence, set.seriesId != nil {
                Label(Self.repeatText(rule), systemImage: "repeat")
            }
            if let notice { Text(notice).foregroundStyle(.tint).textCase(nil) }
        }
        .textCase(nil)
        .font(.footnote)
        .padding(.bottom, 4)
    }

    static func extraTimeText(_ t: ExtraTime) -> String {
        var parts: [String] = []
        if let d = ServiceSet.dayFormatter.date(from: t.date) { parts.append(d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())) }
        if let clock = SetDetailsSheet.clock(t.time) { parts.append(clock.formatted(date: .omitted, time: .shortened)) }
        if t.time != nil, let m = t.minutes { parts.append(SetDetailsSheet.durationLabel(m)) }
        return parts.joined(separator: " · ")
    }

    static func repeatText(_ r: RepeatRule) -> String {
        let f = ["weekly": "Repeats weekly", "biweekly": "Repeats every 2 weeks", "monthly": "Repeats monthly"][r.freq] ?? "Repeats"
        if let u = r.until, let d = ServiceSet.dayFormatter.date(from: u) { return "\(f) until \(d.formatted(date: .abbreviated, time: .omitted))" }
        return "\(f) · \(r.count ?? 12) sets"
    }

    private var addMenu: some View {
        Menu {
            Button("Add Song", systemImage: "music.note") { sheet = .addSong }
            Button("Add Welcome", systemImage: "hand.wave") { Task { await addWelcome() } }
            Button("Add Announcement", systemImage: "megaphone") { sheet = .announcement }
            Button("Add Media", systemImage: "photo.on.rectangle") { sheet = .media }
            if session.currentTeam?.isPaid ?? false {
                Button("Add Worship Leader Notes", systemImage: "text.quote") { Task { await addNotes() } }
            }
            Button("Add Blank Slide", systemImage: "rectangle") { Task { await add(type: "blank", content: JSONObject()) } }
            Divider()
            Button("Edit Set Details", systemImage: "pencil") { sheet = .details }
        } label: {
            Label("Add", systemImage: "plus")
        }
    }

    @ViewBuilder private func row(_ item: SetItem) -> some View {
        if item.type == "song", let id = item.songId, let song = songs[id] {
            NavigationLink {
                SongView(song: song, setKey: item.key)
            } label: {
                HStack(spacing: 12) {
                    ItemIcon(type: "song")
                    SongRow(song: song)
                    if let key = item.key {
                        Text(Song.shortKey(key)).font(.caption.bold()).foregroundStyle(.tint)
                    }
                }
            }
            .contextMenu {
                if canEdit {
                    Button("Song Order for This Set", systemImage: "list.number") { arranging = item }
                Menu("Key for This Set", systemImage: "tuningfork") {
                        Button("Song's Key" + (song.key.map { " (\(Song.shortKey($0)))" } ?? "")) {
                            Task { await setKey(nil, on: item) }
                        }
                        ForEach(MusicKeys.options(like: song.key), id: \.self) { k in
                            Button(Song.shortKey(k)) { Task { await setKey(k, on: item) } }
                        }
                    }
                }
            }
        } else if item.type == "note" {
            NavigationLink {
                NoteView(content: item.content)
            } label: {
                ItemLabel(item: item)
            }
        } else {
            ItemLabel(item: item)
        }
    }

    /// AI Worship Leader Notes for songs that don't have one yet, each placed just before its song.
    private func addNotes() async {
        var noted = Set<String>()
        for item in items where item.type == "note" { if let s = item.content["song_id"]?.stringValue { noted.insert(s.lowercased()) } }
        let targets = items.filter { $0.type == "song" && $0.songId != nil && !noted.contains($0.songId!.uuidString.lowercased()) }
        guard !targets.isEmpty else { error = "Every song in this set already has a note."; return }
        for target in targets {
            guard let id = target.songId, let song = songs[id] else { continue }
            do {
                let n = try await AITools.worshipNote(title: song.title, artist: song.artist ?? "", lyrics: song.rawLyrics ?? "")
                var content: JSONObject = [:]
                content["song_id"] = .string(id.uuidString.lowercased())
                content["song_title"] = .string(song.title)
                content["song_artist"] = .string(song.artist ?? "")
                content["summary"] = .string(n.summary)
                content["reflection"] = .string(n.reflection)
                content["verses"] = .array(n.verses.map { v in .object(["reference": .string(v.reference), "text": .string(v.text)]) })
                guard let at = items.firstIndex(where: { $0.id == target.id }) else { continue }
                let row = NewSetItem(set_id: set.id, type: "note", content: content, position: items[at].position)
                let saved: SetItem = try await supabase.from("set_items").insert(row).select(SetItem.columns).single().execute().value
                items.insert(saved, at: at)
                for i in items.indices where i > at {
                    items[i].position += 1
                    let patch: JSONObject = ["position": .integer(items[i].position)]
                    try await supabase.from("set_items").update(patch).eq("id", value: items[i].id).execute()
                }
            } catch {
                self.error = AITools.message(for: error)
                return
            }
        }
    }

    private func setArrangement(_ order: [String]?, on item: SetItem) async {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        var content = items[index].content
        if let order, !order.isEmpty { content["arrangement"] = .array(order.map { AnyJSON.string($0) }) }
        else { content.removeValue(forKey: "arrangement") }
        do {
            let patch: JSONObject = ["content": AnyJSON.object(content)]
            try await supabase.from("set_items").update(patch).eq("id", value: item.id).execute()
            items[index].content = content
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Loading and saving

    private func load() async {
        defer { loading = false }
        do {
            items = try await supabase.from("set_items")
                .select(SetItem.columns)
                .eq("set_id", value: set.id)
                .order("position")
                .execute()
                .value
            await loadSongs()
        } catch {
            // Offline: use the saved copy of this set, if there is one.
            if let saved = OfflineStore.load(SetPresentation.self, from: OfflineStore.presentationKey(set.id)) {
                items = saved.items
                for s in saved.songs { songs[s.id] = s }
            } else {
                self.error = error.localizedDescription
            }
        }
    }

    private func loadSongs() async {
        let ids = Set(items.compactMap(\.songId)).subtracting(songs.keys).map(\.uuidString)
        guard !ids.isEmpty else { return }
        if let found: [Song] = try? await supabase.from("songs").select(Song.columns).in("id", values: ids).execute().value {
            for s in found { songs[s.id] = s }
        }
    }

    private func add(type: String, content: JSONObject) async {
        do {
            let row = NewSetItem(set_id: set.id, type: type, content: content, position: (items.map(\.position).max() ?? -1) + 1)
            let saved: SetItem = try await supabase.from("set_items").insert(row).select(SetItem.columns).single().execute().value
            items.append(saved)
            await loadSongs()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func move(from source: IndexSet, to destination: Int) {
        items.move(fromOffsets: source, toOffset: destination)
        var changed: [(UUID, Int)] = []
        for i in items.indices where items[i].position != i {
            items[i].position = i
            changed.append((items[i].id, i))
        }
        Task {
            do {
                for (id, position) in changed {
                    let patch: JSONObject = ["position": AnyJSON.integer(position)]
                    try await supabase.from("set_items").update(patch).eq("id", value: id).execute()
                }
            } catch {
                self.error = "Couldn't save the new order. \(error.localizedDescription)"
                await load()
            }
        }
    }

    private func remove(at offsets: IndexSet) {
        let doomed = offsets.map { items[$0].id.uuidString }
        items.remove(atOffsets: offsets)
        Task {
            do {
                try await supabase.from("set_items").delete().in("id", values: doomed).execute()
            } catch {
                self.error = error.localizedDescription
                await load()
            }
        }
    }

    private func setKey(_ key: String?, on item: SetItem) async {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        var content = items[index].content
        if let key { content["key"] = .string(key) } else { content.removeValue(forKey: "key") }
        do {
            let patch: JSONObject = ["content": AnyJSON.object(content)]
            try await supabase.from("set_items").update(patch).eq("id", value: item.id).execute()
            items[index].content = content
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Sheets

/// Pick a song from the team's library to add to a set.
struct AddSongSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onPick: (Song) -> Void
    @State private var songs: [Song] = []
    @State private var search = ""

    private var filtered: [Song] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return songs }
        return songs.filter { $0.title.lowercased().contains(q) || ($0.artist ?? "").lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { song in
                Button {
                    onPick(song)
                    dismiss()
                } label: {
                    SongRow(song: song)
                }
                .tint(.primary)
            }
            .listStyle(.plain)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search songs")
            .navigationTitle("Add Song")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task {
                guard let team = session.currentTeam else { return }
                songs = (try? await supabase.from("songs").select(Song.columns)
                    .eq("church_id", value: team.id).order("title").limit(5000).execute().value) ?? []
            }
        }
    }
}

/// An announcement: a title and one or more slides (separate slides with a blank line).
struct AnnouncementSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onSave: (String, [[String]]) -> Void
    @State private var title = "Announcements"
    @State private var text = ""

    private var slides: [[String]] {
        text.components(separatedBy: "\n\n")
            .map { $0.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Title", text: $title) }
                Section {
                    TextEditor(text: $text).frame(minHeight: 200)
                } header: {
                    Text("Slides")
                } footer: {
                    Text("Leave a blank line between slides. \(slides.count) slide\(slides.count == 1 ? "" : "s").")
                }
            }
            .navigationTitle("Announcement")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { onSave(title, slides); dismiss() }.disabled(slides.isEmpty)
                }
            }
        }
    }
}

/// A song's order of sections for one set only (the song itself keeps its own order).
struct SetArrangementSheet: View {
    @Environment(\.dismiss) private var dismiss
    let song: Song
    var onSave: ([String]?) -> Void
    @State private var order: [String]
    private let sections: [String]

    init(song: Song, initial: [String]?, onSave: @escaping ([String]?) -> Void) {
        self.song = song
        self.onSave = onSave
        let own = slideSequence(song.slides)
        var unique: [String] = []
        for label in own where !unique.contains(label) { unique.append(label) }
        sections = unique
        _order = State(initialValue: initial ?? own)
    }

    var body: some View {
        NavigationStack {
            ArrangementEditor(title: song.title, order: $order, sections: sections,
                              resetLabel: "Use the Song's Own Order", onReset: { order = slideSequence(song.slides) })
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") {
                            onSave(order == slideSequence(song.slides) ? nil : order)
                            dismiss()
                        }
                    }
                }
        }
    }
}

/// A Worship Leader Note: summary, reflection and Scripture for a song.
struct NoteView: View {
    let content: JSONObject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(content["song_title"]?.stringValue ?? "Song").font(.title2.bold())
                    if let a = content["song_artist"]?.stringValue, !a.isEmpty { Text(a).foregroundStyle(.secondary) }
                }
                if let s = content["summary"]?.stringValue, !s.isEmpty {
                    section("Summary") { Text(s) }
                }
                if let r = content["reflection"]?.stringValue, !r.isEmpty {
                    section("Reflection") { Text(r) }
                }
                if let verses = content["verses"]?.arrayValue, !verses.isEmpty {
                    section("Scripture") {
                        ForEach(Array(verses.enumerated()), id: \.offset) { _, v in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(v.objectValue?["reference"]?.stringValue ?? "").font(.headline).foregroundStyle(.tint)
                                Text("“\(v.objectValue?["text"]?.stringValue ?? "")”").italic().font(.system(.body, design: .serif))
                            }
                        }
                    }
                }
            }
            .padding()
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Worship Leader Note")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ body: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased()).font(.caption.bold()).foregroundStyle(.secondary)
            body()
        }
    }
}

/// The web Program list's item icon: a tinted rounded square (src/pages/SetEditor.jsx ITEM_ICONS / ITEM_COLORS).
struct ItemIcon: View {
    let type: String

    var body: some View {
        Image(systemName: Self.symbol(type))
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Self.color(type))
            .frame(width: 30, height: 30)
            .background(Self.color(type).opacity(type == "song" ? 0.2 : 0.12), in: RoundedRectangle(cornerRadius: 7))
    }

    static func symbol(_ type: String) -> String {
        switch type {
        case "song": return "music.note"
        case "welcome": return "star"
        case "announcement": return "megaphone"
        case "blank": return "square"
        case "media": return "folder"
        case "note": return "square.and.pencil"
        default: return "square.stack"
        }
    }

    static func color(_ type: String) -> Color {
        switch type {
        case "song": return Theme.accentLight
        case "welcome": return Color(red: 0.98, green: 0.80, blue: 0.08)       // yellow-400
        case "announcement": return Color(red: 0.98, green: 0.57, blue: 0.24)  // orange-400
        case "media": return Color(red: 0.75, green: 0.52, blue: 0.99)         // purple-400
        case "note": return Color(red: 0.98, green: 0.57, blue: 0.24)
        default: return .secondary
        }
    }
}

struct ItemLabel: View {
    let item: SetItem

    var body: some View {
        HStack(spacing: 12) {
            ItemIcon(type: item.type)
            Text(item.displayTitle)
                .foregroundStyle(item.type == "song" ? .secondary : .primary)
        }
    }
}
