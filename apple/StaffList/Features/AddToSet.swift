import SwiftUI
import Supabase

/// "Add songs to a set" in the Songs tab, like the web library: choose a set (or make a new
/// one), then go down the song list tapping + Add. Songs already in the set are marked.
@MainActor
@Observable
final class AddToSetModel {
    var active = false
    var sets: [ServiceSet] = []
    var targetID: UUID? { didSet { Task { await loadTarget() } } }
    var inSet: Set<UUID> = []
    var justAdded: UUID?
    var error: String?
    private var nextPosition = 0
    private(set) var team: Team?
    private(set) var user: User?

    var target: ServiceSet? { sets.first { $0.id == targetID } }

    func start(team: Team?, user: User?) async {
        self.team = team
        self.user = user
        active = true
        error = nil
        guard let team else { return }
        let today = ServiceSet.dayFormatter.string(from: .now)
        let all: [ServiceSet] = (try? await supabase.from("sets").select(ServiceSet.columns)
            .eq("church_id", value: team.id).order("service_date").limit(300).execute().value) ?? []
        // Upcoming first (soonest first), then past (most recent first) — like the web's list.
        let upcoming = all.filter { ($0.serviceDate ?? today) >= today }
        let past = all.filter { ($0.serviceDate ?? today) < today }.reversed()
        sets = upcoming + past
        if targetID == nil || target == nil { targetID = upcoming.first?.id ?? sets.first?.id }
    }

    func loadTarget() async {
        inSet = []
        nextPosition = 0
        guard let targetID else { return }
        struct Row: Decodable { let position: Int; let content: JSONObject? }
        let rows: [Row] = (try? await supabase.from("set_items").select("position, content")
            .eq("set_id", value: targetID).execute().value) ?? []
        nextPosition = (rows.map(\.position).max() ?? -1) + 1
        inSet = Set(rows.compactMap { $0.content?["song_id"]?.stringValue.flatMap(UUID.init(uuidString:)) })
    }

    func add(_ song: Song) async {
        guard let targetID else { error = "Choose a set first."; return }
        error = nil
        var content: JSONObject = [:]
        content["song_id"] = .string(song.id.uuidString.lowercased())
        content["song_title"] = .string(song.title)
        content["song_artist"] = .string(song.artist ?? "")
        do {
            try await supabase.from("set_items")
                .insert(NewSetItem(set_id: targetID, type: "song", content: content, position: nextPosition))
                .execute()
            nextPosition += 1
            inSet.insert(song.id)
            justAdded = song.id
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            try? await Task.sleep(for: .seconds(1.8))
            if justAdded == song.id { justAdded = nil }
        } catch {
            self.error = "Could not add \"\(song.title)\" to the set."
        }
    }

    /// New set from the bar: name and date (the rest can be filled in on the set later).
    func createSet(name: String, date: Date) async -> String? {
        guard let team else { return "No team selected." }
        let request = SetSaveRequest(
            id: nil, church_id: team.id, name: name, date: ServiceSet.dayFormatter.string(from: date),
            time: "10:00", duration: 90, venue: "", address: "", room: "", times: [], repeat: nil,
            copy_program: false, scope: "one", time_zone: TimeZone.current.identifier)
        do {
            let reply = try await StaffListAPI.shared.post("sets/save", request, as: SetSaveReply.self)
            sets.insert(reply.set, at: 0)
            targetID = reply.set.id
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            return nil
        } catch {
            return "Could not create the set. \(error.localizedDescription)"
        }
    }
}

/// The bar under the search field while adding: "Add to [set ▾]" with + New Set…
struct AddToSetBar: View {
    @Bindable var model: AddToSetModel
    @State private var newSetOpen = false
    @State private var newName = ""
    @State private var newDate = SetDetailsSheet.nextSunday()
    @State private var creating = false
    @State private var createError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("ADD TO").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                Menu {
                    Picker("Set", selection: $model.targetID) {
                        ForEach(model.sets) { s in
                            Text(label(s)).tag(Optional(s.id))
                        }
                    }
                    Divider()
                    Button("New Set…", systemImage: "plus") { newSetOpen = true }
                } label: {
                    HStack(spacing: 6) {
                        Text(model.target.map(label) ?? (model.sets.isEmpty ? "No sets yet — New Set…" : "Choose a set"))
                            .lineLimit(1)
                        Image(systemName: "chevron.up.chevron.down").font(.caption)
                    }
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color.secondary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
                }
                Spacer()
                if model.target != nil {
                    Text("\(model.inSet.count) in set").font(.caption).foregroundStyle(.secondary)
                }
            }
            if newSetOpen {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        TextField("New set name, e.g. Sunday Morning Worship", text: $newName)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.done)
                            .onSubmit { Task { await create() } }
                        DatePicker("Service date", selection: $newDate, displayedComponents: .date).labelsHidden()
                    }
                    HStack(spacing: 8) {
                        Button { Task { await create() } } label: {
                            if creating { ProgressView() } else { Text("Create") }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || creating)
                        Button("Cancel") { closeNewSet() }.buttonStyle(.bordered)
                        if let createError { Text(createError).font(.caption).foregroundStyle(.red) }
                    }
                }
            }
            if let error = model.error {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
        .onAppear { if model.sets.isEmpty { newSetOpen = true } }
    }

    private func label(_ s: ServiceSet) -> String {
        guard let d = s.date else { return s.name }
        return "\(s.name) · \(d.formatted(.dateTime.month(.abbreviated).day()))"
    }

    private func create() async {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !creating else { return }
        creating = true
        createError = await model.createSet(name: name, date: newDate)
        creating = false
        if createError == nil { closeNewSet() }
    }

    private func closeNewSet() {
        newSetOpen = false
        newName = ""
        newDate = SetDetailsSheet.nextSunday()
        createError = nil
    }
}

/// "+ Add" on each song while adding; "Added" for a moment after a tap; "In set" once it's there.
struct AddSongButton: View {
    let song: Song
    let model: AddToSetModel

    var body: some View {
        let justAdded = model.justAdded == song.id
        let already = model.inSet.contains(song.id)
        Button {
            Task { await model.add(song) }
        } label: {
            Label(justAdded ? "Added" : already ? "In set" : "Add",
                  systemImage: justAdded || already ? "checkmark" : "plus")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .foregroundStyle(justAdded ? .green : already ? .secondary : Theme.accentLight)
                .background((justAdded ? Color.green : already ? Color.secondary : Theme.accent).opacity(0.15), in: Capsule())
                .overlay(Capsule().stroke((justAdded ? Color.green : already ? Color.secondary : Theme.accent).opacity(0.5)))
        }
        .buttonStyle(.borderless)
        .disabled(model.target == nil)
        .accessibilityLabel(already ? "\(song.title) is in the set — add again" : "Add \(song.title) to the set")
    }
}
