import SwiftUI
import Supabase

/// A song in a set's program, like the web's options dialog (src/components/sets/ItemOptionsDialog.jsx):
/// the key for this set, the arrangement for this set, the Song Leader (from the people on the set),
/// and Remove from Set. Changes save as they're made; the song itself isn't changed.
struct SongItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    let set: ServiceSet
    let item: SetItem
    @State var song: Song
    /// Saves the item's new content.
    var onChange: (JSONObject) async -> Void
    var onRemove: () async -> Void

    @State private var content: JSONObject
    @State private var team: [Person] = []
    @State private var teamLoaded = false
    @State private var arranging = false
    @State private var editingSong = false
    @State private var confirmRemove = false

    struct Person: Identifiable, Hashable {
        let id: UUID
        let name: String
        var positions: [String]
        var singer: Bool
        var status: String
    }

    init(set: ServiceSet, item: SetItem, song: Song, onChange: @escaping (JSONObject) async -> Void, onRemove: @escaping () async -> Void) {
        self.set = set
        self.item = item
        _song = State(initialValue: song)
        self.onChange = onChange
        self.onRemove = onRemove
        _content = State(initialValue: item.content)
    }

    // MARK: Keys

    private var original: String? { song.metadata?.originalKey ?? song.metadata?.key }
    private var preferred: String? { song.metadata?.preferredKey }
    private var chosen: String? { content["key"]?.stringValue }
    private var current: String? { chosen ?? preferred ?? original }
    private var songKeys: [String] {
        var out: [String] = []
        for k in [original] + (song.metadata?.transposedKeys ?? []).map(Optional.some) {
            if let k, !k.isEmpty, !out.contains(where: { Chords.sameKey($0, k) }) { out.append(k) }
        }
        return out
    }
    private var otherKeys: [String] {
        Chords.keyOptions(original).filter { k in !songKeys.contains { Chords.sameKey($0, k) } }
    }

    // MARK: Arrangement

    private var ownOrder: [String] { slideSequence(song.slides) }
    private var setOrder: [String]? {
        guard let a = content["arrangement"]?.arrayValue?.compactMap(\.stringValue), !a.isEmpty else { return nil }
        return a
    }

    private var lead: (id: String, name: String)? {
        guard let o = content["lead"]?.objectValue, let n = o["name"]?.stringValue else { return nil }
        return (o["member_id"]?.stringValue ?? "", n)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if original == nil {
                        Text("Set this song's original key on its Chords step first, then you can choose a key here.")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        ForEach(songKeys, id: \.self) { k in keyRow(k) }
                        if !otherKeys.isEmpty {
                            Picker("Other key", selection: Binding(
                                get: { songKeys.contains { Chords.sameKey($0, current) } ? "" : (current ?? "") },
                                set: { k in if !k.isEmpty { setKey(k) } })) {
                                Text("Choose…").tag("")
                                ForEach(otherKeys, id: \.self) { Text(Song.shortKey($0)).tag($0) }
                            }
                        }
                    }
                } header: {
                    HStack {
                        Label("Key for this set", systemImage: "tuningfork")
                        Spacer()
                        if chosen != nil {
                            Button("Use song's key") { setKey(nil) }.font(.caption).textCase(nil)
                        }
                    }
                } footer: {
                    if let current { Text("Opens in \(Song.shortKey(current)) in the Song Viewer for this set. The song itself isn't changed.") }
                }

                if !ownOrder.isEmpty {
                    Section {
                        Button { arranging = true } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(setOrder == nil ? "Song's arrangement" : "Custom").foregroundStyle(.primary)
                                    Spacer()
                                    Text("Change").foregroundStyle(Theme.accentLight)
                                }
                                Text((setOrder ?? ownOrder).map(SongViewer.abbreviate).joined(separator: " → "))
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                        if setOrder != nil {
                            Button("Use the Song's Arrangement") { setArrangement(nil) }
                        }
                    } header: {
                        Label("Arrangement for this set", systemImage: "list.number")
                    }
                }

                Section {
                    if !teamLoaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if team.isEmpty {
                        Text("No one is assigned to this set yet. Assign the team on this set, then pick a Song Leader here.")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        leadRow(nil)
                        ForEach(team) { leadRow($0) }
                    }
                } header: {
                    HStack {
                        Label("Song Leader", systemImage: "music.mic")
                        Spacer()
                        Text(lead?.name ?? "None").textCase(nil).foregroundStyle(lead == nil ? .secondary : Theme.accentLight)
                    }
                } footer: {
                    if !team.isEmpty { Text("From the team on this set; singers are listed first. Shows on the set list and in the Song Viewer.") }
                }

                Section {
                    Button("Remove from Set", role: .destructive) { confirmRemove = true }
                }
            }
            .navigationTitle(song.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { editingSong = true } label: { Label("Edit Song", systemImage: "pencil") }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .confirmationDialog("Remove \(song.title) from this set?", isPresented: $confirmRemove, titleVisibility: .visible) {
                Button("Remove from Set", role: .destructive) {
                    Task { await onRemove(); dismiss() }
                }
            }
            .sheet(isPresented: $arranging) {
                SetArrangementSheet(song: song, initial: setOrder) { order in setArrangement(order) }
            }
            .sheet(isPresented: $editingSong) {
                SongEditorView(song: song, onSaved: { song = $0 }, onDeleted: { dismiss() })
            }
            .task { await loadTeam() }
        }
    }

    private func keyRow(_ k: String) -> some View {
        let on = Chords.sameKey(k, current)
        let tags = [Chords.sameKey(k, original) ? "Original" : nil, Chords.sameKey(k, preferred) ? "Preferred" : nil].compactMap { $0 }
        return Button {
            setKey(Chords.sameKey(k, preferred ?? original) ? nil : k)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(on ? Theme.accentLight : .secondary)
                Text(Song.shortKey(k)).font(.headline).foregroundStyle(on ? Theme.accentLight : .primary)
                    .frame(width: 40, alignment: .leading)
                ForEach(tags, id: \.self) { t in
                    Text(t).font(.caption2.weight(.semibold))
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .foregroundStyle(t == "Preferred" ? Theme.accentLight : .secondary)
                        .background((t == "Preferred" ? Theme.accent.opacity(0.2) : Color.secondary.opacity(0.15)), in: RoundedRectangle(cornerRadius: 4))
                }
                if let note = song.metadata?.keyNotes?[k], !note.isEmpty {
                    Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func leadRow(_ p: Person?) -> some View {
        let on = (lead?.id.lowercased() ?? "") == (p?.id.uuidString.lowercased() ?? "")
        return Button {
            setLead(p)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(on ? Theme.accentLight : .secondary)
                VStack(alignment: .leading, spacing: 1) {
                    Text(p?.name ?? "No Song Leader")
                        .font(.subheadline.weight(p == nil ? .regular : .medium))
                        .foregroundStyle(p == nil ? .secondary : (on ? Theme.accentLight : .primary))
                    if let p, !p.positions.isEmpty {
                        Text(p.positions.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                if p?.status == "declined" { Text("Declined").font(.caption2).foregroundStyle(.red) }
                if p?.status == "invited" { Text("Pending").font(.caption2).foregroundStyle(.yellow) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Saving

    private func save(_ next: JSONObject) {
        content = next
        Task { await onChange(next) }
    }

    private func setKey(_ k: String?) {
        var c = content
        if let k { c["key"] = .string(k) } else { c.removeValue(forKey: "key") }
        save(c)
    }

    private func setArrangement(_ order: [String]?) {
        var c = content
        if let order, !order.isEmpty, order != ownOrder { c["arrangement"] = .array(order.map { AnyJSON.string($0) }) }
        else { c.removeValue(forKey: "arrangement") }
        save(c)
    }

    private func setLead(_ p: Person?) {
        var c = content
        if let p {
            c["lead"] = .object(["member_id": .string(p.id.uuidString.lowercased()), "name": .string(p.name)])
        } else {
            c.removeValue(forKey: "lead")
        }
        save(c)
    }

    // MARK: The team on this set

    private struct Row: Decodable {
        let member_id: UUID
        let position_id: UUID
        let status: String?
    }
    private struct Member: Decodable { let id: UUID; let name: String }

    private func loadTeam() async {
        defer { teamLoaded = true }
        guard let rows: [Row] = try? await supabase.from("set_assignments").select("member_id,position_id,status")
            .eq("set_id", value: set.id).execute().value, !rows.isEmpty else { return }
        let memberIds = Array(Set(rows.map { $0.member_id.uuidString }))
        let positionIds = Array(Set(rows.map { $0.position_id.uuidString }))
        async let m: [Member] = supabase.from("team_members").select("id,name").in("id", values: memberIds).execute().value
        async let p: [Position] = supabase.from("positions").select("id,name,category").in("id", values: positionIds).execute().value
        let members = Dictionary(uniqueKeysWithValues: ((try? await m) ?? []).map { ($0.id, $0.name) })
        let positions = Dictionary(uniqueKeysWithValues: ((try? await p) ?? []).map { ($0.id, $0) })
        var people: [UUID: Person] = [:]
        for r in rows {
            guard let name = members[r.member_id] else { continue }
            var person = people[r.member_id] ?? Person(id: r.member_id, name: name, positions: [], singer: false, status: r.status ?? "draft")
            if let pos = positions[r.position_id] {
                if !person.positions.contains(pos.name) { person.positions.append(pos.name) }
                if ScheduleMatrix.MatrixGroup.of(pos) == .singers { person.singer = true }
            }
            if r.status == "accepted" { person.status = "accepted" }
            people[r.member_id] = person
        }
        team = people.values.sorted { a, b in
            a.singer != b.singer ? a.singer : a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
    }
}

/// A media item in a set's program, like the web: rename it, replace it with something else from
/// the Media Library, take out single slides, or remove it from the set.
struct MediaItemSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: SetItem
    var onSave: (JSONObject) async -> Void
    var onRemove: () async -> Void

    @State private var content: JSONObject
    @State private var name: String
    @State private var replacing = false
    @State private var confirmRemove = false
    @State private var saving = false

    init(item: SetItem, onSave: @escaping (JSONObject) async -> Void, onRemove: @escaping () async -> Void) {
        self.item = item
        self.onSave = onSave
        self.onRemove = onRemove
        _content = State(initialValue: item.content)
        _name = State(initialValue: item.content["media_name"]?.stringValue ?? "")
    }

    private var images: [String] {
        (content["images"]?.arrayValue ?? []).compactMap { $0.objectValue?["url"]?.stringValue }
    }
    private var fileCount: Int { content["files"]?.arrayValue?.count ?? 0 }
    private var changed: Bool {
        name.trimmingCharacters(in: .whitespaces) != (item.content["media_name"]?.stringValue ?? "") || content != item.content
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("Name", text: $name, prompt: Text("Sermon slides"))
                }

                Section {
                    if images.isEmpty {
                        Text(fileCount > 1 ? "\(fileCount) files" : "No slides to preview").foregroundStyle(.secondary)
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                            ForEach(Array(images.enumerated()), id: \.offset) { i, url in
                                ZStack(alignment: .topTrailing) {
                                    AsyncImage(url: URL(string: url)) { img in
                                        img.resizable().scaledToFit()
                                    } placeholder: {
                                        Color.black.overlay(ProgressView())
                                    }
                                    .frame(maxWidth: .infinity)
                                    .aspectRatio(16 / 9, contentMode: .fit)
                                    .background(Color.black)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay(alignment: .bottomLeading) {
                                        Text("\(i + 1)").font(.caption2).foregroundStyle(.white.opacity(0.75)).padding(4)
                                    }
                                    if images.count > 1 {
                                        Button { removeSlide(i) } label: {
                                            Image(systemName: "xmark.circle.fill").font(.title3)
                                                .symbolRenderingMode(.palette)
                                                .foregroundStyle(.white, .black.opacity(0.7))
                                        }
                                        .buttonStyle(.plain)
                                        .padding(4)
                                        .accessibilityLabel("Take out slide \(i + 1)")
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    Button { replacing = true } label: {
                        Label("Replace from Media Library", systemImage: "arrow.triangle.2.circlepath")
                    }
                } header: {
                    Text(images.isEmpty ? "Content" : "\(images.count) slide\(images.count == 1 ? "" : "s")")
                } footer: {
                    Text("Changes here are for this set's program; the Media Library isn't changed.")
                }

                Section {
                    Button("Remove from Set", role: .destructive) { confirmRemove = true }
                }
            }
            .navigationTitle("Edit Media")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Save") { Task { await save() } }.disabled(!changed)
                    }
                }
            }
            .confirmationDialog("Remove this from the set?", isPresented: $confirmRemove, titleVisibility: .visible) {
                Button("Remove from Set", role: .destructive) { Task { await onRemove(); dismiss() } }
            }
            .sheet(isPresented: $replacing) {
                MediaLibraryView(onPick: { media in
                    content = media.setItemContent
                    name = media.name
                })
            }
        }
    }

    private func removeSlide(_ i: Int) {
        guard var list = content["images"]?.arrayValue, list.indices.contains(i) else { return }
        list.remove(at: i)
        content["images"] = .array(list)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var c = content
        let n = name.trimmingCharacters(in: .whitespaces)
        c["media_name"] = .string(n.isEmpty ? (c["media_name"]?.stringValue ?? "Media") : n)
        await onSave(c)
        dismiss()
    }
}
