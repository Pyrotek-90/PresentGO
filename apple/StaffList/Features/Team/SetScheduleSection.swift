import SwiftUI
import Supabase

/// Who's serving on a set: positions and people, with each person's answer. Admins and Leaders
/// add people and send the requests (by email and in the app, through the shared API).
struct SetScheduleView: View {
    @Environment(SessionStore.self) private var session
    let set: ServiceSet
    @State private var assignments: [Assignment] = []
    @State private var members: [UUID: TeamMember] = [:]
    @State private var positions: [Position] = []
    @State private var adding = false
    @State private var note: String?
    @State private var sending = false

    private var drafts: [Assignment] { assignments.filter { ($0.status ?? "draft") == "draft" } }

    var body: some View {
        List {
            if let note { Section { Text(note).font(.footnote) } }
            ForEach(positions.filter { p in assignments.contains { $0.positionId == p.id } }) { p in
                Section(p.name) {
                    ForEach(assignments.filter { $0.positionId == p.id }) { a in
                        HStack {
                            Text(members[a.memberId]?.name ?? "Someone")
                            Spacer()
                            Text(a.statusLabel).font(.caption.bold()).foregroundStyle(color(a.status))
                        }
                        .swipeActions {
                            Button("Remove", role: .destructive) { Task { await remove(a) } }
                        }
                    }
                }
            }
        }
        .overlay {
            if assignments.isEmpty {
                ContentUnavailableView {
                    Label("No one scheduled yet", systemImage: "person.2.badge.plus")
                } actions: {
                    Button("Add Person") { adding = true }.buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Team for \(set.name)")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button(drafts.isEmpty ? "Sent" : "Send Requests (\(drafts.count))", systemImage: "paperplane") {
                    Task { await sendRequests() }
                }
                .disabled(drafts.isEmpty || sending)
                Button("Add Person", systemImage: "plus") { adding = true }
            }
        }
        .sheet(isPresented: $adding) {
            AssignPersonSheet(members: Array(members.values), positions: positions) { position, member in
                Task { await add(position: position, member: member) }
            }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func color(_ status: String?) -> Color {
        switch status {
        case "accepted": return .green
        case "declined": return .red
        case "invited": return .orange
        default: return .secondary
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { return }
        async let a: [Assignment] = supabase.from("set_assignments").select("id,set_id,position_id,member_id,status").eq("set_id", value: set.id).execute().value
        async let m: [TeamMember] = supabase.from("team_members").select(TeamMember.columns).eq("church_id", value: team.id).order("name").execute().value
        async let p: [Position] = supabase.from("positions").select("id,name,category").eq("church_id", value: team.id).order("created_at").execute().value
        if let list = try? await a { assignments = list }
        if let list = try? await m { members = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) }) }
        if let list = try? await p { positions = list }
    }

    private func add(position: Position, member: TeamMember) async {
        do {
            let a: Assignment = try await supabase.from("set_assignments")
                .insert(NewAssignment(set_id: set.id, position_id: position.id, member_id: member.id))
                .select("id,set_id,position_id,member_id,status").single().execute().value
            assignments.append(a)
        } catch {
            note = "\(member.name) is already on this set for \(position.name), or couldn't be added."
        }
    }

    private func remove(_ a: Assignment) async {
        do {
            try await supabase.from("set_assignments").delete().eq("id", value: a.id).execute()
            assignments.removeAll { $0.id == a.id }
        } catch {
            note = error.localizedDescription
        }
    }

    private func sendRequests() async {
        sending = true
        defer { sending = false }
        note = await Invites.send(assignments: drafts.map(\.id))
        await load()
    }
}

struct AssignPersonSheet: View {
    @Environment(\.dismiss) private var dismiss
    let members: [TeamMember]
    let positions: [Position]
    var onAdd: (Position, TeamMember) -> Void
    @State private var position: Position?

    var body: some View {
        NavigationStack {
            List {
                Section("Position") {
                    Picker("Position", selection: $position) {
                        Text("Choose…").tag(Position?.none)
                        ForEach(positions) { Text($0.name).tag(Optional($0)) }
                    }
                }
                if let position {
                    let fits = members.filter { ($0.positionIds ?? []).contains(position.id) }
                    let others = members.filter { !($0.positionIds ?? []).contains(position.id) }
                    Section("Plays \(position.name)") { ForEach(fits.sorted { $0.name < $1.name }) { personRow($0, position) } }
                    if !others.isEmpty {
                        Section("Everyone else") { ForEach(others.sorted { $0.name < $1.name }) { personRow($0, position) } }
                    }
                }
            }
            .navigationTitle("Add Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func personRow(_ m: TeamMember, _ p: Position) -> some View {
        Button(m.name) { onAdd(p, m); dismiss() }.tint(.primary)
    }
}
