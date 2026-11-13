import SwiftUI
import Supabase

/// "Team for This Set", shown right in the set's list: who's serving in each position and
/// their answer (Not sent / Waiting / Accepted / Declined). Admins and Leaders add and remove
/// people and send the requests (email and in-app, through the shared API).
struct SetTeamSection: View {
    @Environment(SessionStore.self) private var session
    let set: ServiceSet
    @State private var assignments: [Assignment] = []
    @State private var members: [UUID: TeamMember] = [:]
    @State private var positions: [Position] = []
    @State private var loaded = false
    @State private var adding = false
    @State private var sending = false
    @State private var note: String?

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private var drafts: [Assignment] { assignments.filter { ($0.status ?? "draft") == "draft" } }

    /// Assignments in the team's position order, then by name.
    private var rows: [(assignment: Assignment, position: String, name: String)] {
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        let names = Dictionary(uniqueKeysWithValues: positions.map { ($0.id, $0.name) })
        return assignments
            .sorted {
                let a = order[$0.positionId] ?? .max, b = order[$1.positionId] ?? .max
                if a != b { return a < b }
                return (members[$0.memberId]?.name ?? "") < (members[$1.memberId]?.name ?? "")
            }
            .map { ($0, names[$0.positionId] ?? "Position", members[$0.memberId]?.name ?? "Someone") }
    }

    var body: some View {
        Section {
            if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if assignments.isEmpty {
                HStack(spacing: 12) {
                    Image(systemName: "person.2.slash").foregroundStyle(.secondary).frame(width: 30)
                    Text("No one scheduled yet").foregroundStyle(.secondary)
                }
            } else {
                ForEach(rows, id: \.assignment.id) { row in
                    HStack(spacing: 12) {
                        Text(row.position)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .frame(width: 96, alignment: .leading)
                            .lineLimit(1)
                        Text(row.name).lineLimit(1)
                        Spacer(minLength: 8)
                        StatusPill(status: row.assignment.status)
                    }
                    .swipeActions {
                        if canEdit {
                            Button("Remove", role: .destructive) { Task { await remove(row.assignment) } }
                        }
                    }
                }
            }
            if canEdit && loaded {
                HStack(spacing: 10) {
                    Button { adding = true } label: {
                        Label("Add Person", systemImage: "person.badge.plus")
                    }
                    .buttonStyle(.bordered)
                    if !drafts.isEmpty {
                        Button { Task { await sendRequests() } } label: {
                            if sending { ProgressView() } else {
                                Label("Send Requests (\(drafts.count))", systemImage: "paperplane")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(sending)
                    }
                }
                .padding(.vertical, 2)
            }
            if let note {
                Text(note).font(.footnote).foregroundStyle(.secondary)
            }
        } header: {
            HStack {
                Text("Team for This Set")
                Spacer()
                if !assignments.isEmpty {
                    let yes = assignments.filter { $0.status == "accepted" }.count
                    Text("\(yes) of \(assignments.count) accepted").textCase(nil)
                }
            }
        }
        .sheet(isPresented: $adding) {
            AssignPersonSheet(members: Array(members.values), positions: positions) { position, member in
                Task { await add(position: position, member: member) }
            }
        }
        .task(id: set.id) { await load() }
    }

    func load() async {
        defer { loaded = true }
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
            note = nil
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

/// Not sent / Waiting / Accepted / Declined, in the web Team Schedule's colors.
struct StatusPill: View {
    let status: String?

    var body: some View {
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.15), in: Capsule())
    }

    private var label: String {
        switch status ?? "draft" {
        case "invited": return "Waiting"
        case "accepted": return "Accepted"
        case "declined": return "Declined"
        default: return "Not sent"
        }
    }

    private var color: Color {
        switch status {
        case "accepted": return .green
        case "declined": return .red
        case "invited": return .orange
        default: return .secondary
        }
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
