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
                if canEdit {
                    ToolbarItem(placement: .primaryAction) {
                        Button("New Set", systemImage: "plus") { creating = true }
                    }
                }
            }
            .sheet(isPresented: $creating) {
                SetDetailsSheet(set: nil, onSaved: { created in
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
        } catch {
            self.error = error.localizedDescription
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

    enum SheetKind: String, Identifiable {
        case addSong, announcement, details
        var id: String { rawValue }
    }

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }

    var body: some View {
        List {
            Section {
                ForEach(items) { item in row(item) }
                    .onMove(perform: canEdit ? move : nil)
                    .onDelete(perform: canEdit ? remove : nil)
            } header: {
                if let when = set.whenText { Text(when) }
            }
        }
        .overlay {
            if loading && items.isEmpty { ProgressView() }
            else if !loading && items.isEmpty {
                ContentUnavailableView {
                    Label("Nothing in this set yet", systemImage: "music.note.list")
                } actions: {
                    if canEdit { Button("Add Song") { sheet = .addSong }.buttonStyle(.borderedProminent) }
                }
            }
        }
        .navigationTitle(set.name)
        .toolbar {
            if canEdit {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Add Song", systemImage: "music.note") { sheet = .addSong }
                        Button("Add Welcome", systemImage: "hand.wave") {
                            Task { await add(type: "welcome", content: ["title": "Welcome", "subtitle": "Glad you're here!"]) }
                        }
                        Button("Add Announcement", systemImage: "megaphone") { sheet = .announcement }
                        Button("Add Blank Slide", systemImage: "rectangle") {
                            Task { await add(type: "blank", content: [:]) }
                        }
                        Divider()
                        Button("Edit Set Details", systemImage: "pencil") { sheet = .details }
                    } label: {
                        Label("Add", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
            }
        }
        .sheet(item: $sheet) { kind in
            switch kind {
            case .addSong:
                AddSongSheet { song in
                    Task { await add(type: "song", content: ["song_id": .string(song.id.uuidString), "song_title": .string(song.title), "song_artist": .string(song.artist ?? "")]) }
                }
            case .announcement:
                AnnouncementSheet { title, slides in
                    Task { await add(type: "announcement", content: ["title": .string(title), "slides": .array(slides.map { .object(["lines": .array($0.map(AnyJSON.string))]) })]) }
                }
            case .details:
                SetDetailsSheet(set: set, onSaved: { set = $0 }, onDeleted: { dismiss() })
            }
        }
        .alert("Something went wrong", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("OK") {}
        } message: { Text(error ?? "") }
        .refreshable { await load() }
        .task { await load() }
    }

    @ViewBuilder private func row(_ item: SetItem) -> some View {
        if item.type == "song", let id = item.songId, let song = songs[id] {
            NavigationLink {
                SongView(song: song, setKey: item.key)
            } label: {
                HStack {
                    SongRow(song: song)
                    if let key = item.key {
                        Text(Song.shortKey(key)).font(.caption.bold()).foregroundStyle(.tint)
                    }
                }
            }
            .contextMenu {
                if canEdit {
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
        } else {
            Label(item.displayTitle, systemImage: item.systemImage)
                .foregroundStyle(item.type == "song" ? .secondary : .primary)
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
            self.error = error.localizedDescription
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
                    try await supabase.from("set_items").update(["position": position]).eq("id", value: id).execute()
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
            try await supabase.from("set_items").update(["content": AnyJSON.object(content)]).eq("id", value: item.id).execute()
            items[index].content = content
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Sheets

/// New set, or edit an existing set's name, date and time (and delete it).
struct SetDetailsSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let set: ServiceSet?
    var onSaved: (ServiceSet) -> Void
    var onDeleted: () -> Void

    @State private var name: String
    @State private var date: Date
    @State private var hasTime: Bool
    @State private var time: Date
    @State private var saving = false
    @State private var confirmDelete = false
    @State private var error: String?

    init(set: ServiceSet?, onSaved: @escaping (ServiceSet) -> Void = { _ in }, onDeleted: @escaping () -> Void = {}) {
        self.set = set
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        _name = State(initialValue: set?.name ?? "Sunday Service")
        _date = State(initialValue: set?.date ?? SetDetailsSheet.nextSunday())
        _hasTime = State(initialValue: set?.timeValue != nil)
        _time = State(initialValue: set?.timeValue ?? Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: .now) ?? .now)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    Toggle("Service time", isOn: $hasTime.animation())
                    if hasTime {
                        DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                    }
                }
                if set != nil {
                    Section {
                        Button("Delete Set", role: .destructive) { confirmDelete = true }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle(set == nil ? "New Set" : "Set Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button(set == nil ? "Create" : "Save") { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .confirmationDialog("Delete \"\(set?.name ?? "")\"?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Set", role: .destructive) { Task { await delete() } }
            } message: {
                Text("The set and its order of service are deleted for everyone on the team. Songs stay in the library.")
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var dateString: String { ServiceSet.dayFormatter.string(from: date) }
    private var timeString: String? {
        guard hasTime else { return nil }
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        return String(format: "%02d:%02d:00", c.hour ?? 0, c.minute ?? 0)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        do {
            let saved: ServiceSet
            if let set {
                saved = try await supabase.from("sets")
                    .update(SetDetailsPatch(name: trimmed, service_date: dateString, service_time: timeString))
                    .eq("id", value: set.id)
                    .select(ServiceSet.columns).single().execute().value
            } else {
                guard let team = session.currentTeam, let user = session.user else { return }
                saved = try await supabase.from("sets")
                    .insert(NewSet(name: trimmed, service_date: dateString, service_time: timeString, user_id: user.id, church_id: team.id))
                    .select(ServiceSet.columns).single().execute().value
            }
            onSaved(saved)
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let set else { return }
        do {
            try await supabase.from("sets").delete().eq("id", value: set.id).execute()
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            dismiss()
            onDeleted()
        } catch {
            self.error = error.localizedDescription
        }
    }

    static func nextSunday() -> Date {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let weekday = cal.component(.weekday, from: today)   // 1 = Sunday
        return cal.date(byAdding: .day, value: weekday == 1 ? 0 : 8 - weekday, to: today) ?? today
    }
}

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
