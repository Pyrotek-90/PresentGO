import SwiftUI
import Supabase

/// Team sections, in the web schedule's order (src/components/calendar/SchedulePane.jsx).
/// Positions are placed by name first, then by category; anything else goes under Other.
enum TeamSection: String, CaseIterable, Identifiable {
    case production, singers, musicians, other
    var id: String { rawValue }

    var label: String { rawValue.capitalized }
    var names: [String] {
        switch self {
        case .production: return ["Presenter", "Audio"]
        case .singers: return ["Singer"]
        case .musicians: return ["Keys", "Acoustic", "Electric", "Bass", "Drums"]
        case .other: return []
        }
    }
    var categories: [String] {
        switch self {
        case .production: return ["Presenter", "Audio"]
        case .singers: return ["Singers"]
        case .musicians: return ["Band Musicians"]
        case .other: return []
        }
    }

    static func of(_ p: Position) -> TeamSection {
        let name = p.name.lowercased()
        return allCases.first { $0.names.contains { $0.lowercased() == name } }
            ?? allCases.first { $0.categories.contains(p.category ?? "") }
            ?? .other
    }

    /// Order within a section: the standard positions first, in the list's order.
    static func rank(_ p: Position) -> Int {
        let name = p.name.lowercased()
        return of(p).names.firstIndex { $0.lowercased() == name } ?? 100
    }
}

/// Who's serving on a set, shown right in the set's list and laid out like the web schedule:
/// Production, Singers and Musicians (and Other for custom positions), each with its own Add.
/// Admins and Leaders add and remove people, resend, and send the requests.
struct SetTeamSection: View {
    @Environment(SessionStore.self) private var session
    let set: ServiceSet
    @State private var assignments: [Assignment] = []
    @State private var members: [UUID: TeamMember] = [:]
    @State private var positions: [Position] = []
    @State private var loaded = false
    @State private var addingTo: TeamSection?
    @State private var sending = false
    @State private var note: String?

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private var posById: [UUID: Position] { Dictionary(uniqueKeysWithValues: positions.map { ($0.id, $0) }) }
    private var drafts: [Assignment] {
        assignments.filter { ($0.status ?? "draft") == "draft" && members[$0.memberId]?.email != nil }
    }

    private func positions(in section: TeamSection) -> [Position] {
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        return positions.filter { TeamSection.of($0) == section }
            .sorted { (TeamSection.rank($0), order[$0.id] ?? 0) < (TeamSection.rank($1), order[$1.id] ?? 0) }
    }

    private func rows(in section: TeamSection) -> [Assignment] {
        let pos = posById
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        return assignments
            .filter { a in pos[a.positionId].map { TeamSection.of($0) == section } ?? false && members[a.memberId] != nil }
            .sorted { a, b in
                let pa = pos[a.positionId]!, pb = pos[b.positionId]!
                if TeamSection.rank(pa) != TeamSection.rank(pb) { return TeamSection.rank(pa) < TeamSection.rank(pb) }
                if order[pa.id] != order[pb.id] { return (order[pa.id] ?? 0) < (order[pb.id] ?? 0) }
                return (members[a.memberId]?.name ?? "") < (members[b.memberId]?.name ?? "")
            }
    }

    private var visibleSections: [TeamSection] {
        TeamSection.allCases.filter { $0 != .other || !positions(in: .other).isEmpty || !rows(in: .other).isEmpty }
    }

    var body: some View {
        Section {
            if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else {
                ForEach(visibleSections) { section in
                    groupHeader(section)
                    let list = rows(in: section)
                    if list.isEmpty {
                        Text("No one yet").font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(list) { a in personRow(a) }
                }
                if canEdit && !assignments.isEmpty { sendRow }
                if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
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
        .sheet(item: $addingTo) { section in
            AddToSectionSheet(section: section, members: Array(members.values), pool: positions(in: section)) { position, member in
                await add(position: position, member: member)
            }
        }
        .task(id: set.id) { await load() }
    }

    /// "PRODUCTION ─────── + Add", as a small label row inside the section.
    private func groupHeader(_ section: TeamSection) -> some View {
        HStack(spacing: 10) {
            Text(section.label.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(0.8)
                .foregroundStyle(.secondary)
            Rectangle().fill(Color.secondary.opacity(0.25)).frame(height: 1)
            if canEdit {
                Button { addingTo = section } label: {
                    Label("Add", systemImage: "person.badge.plus")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .foregroundStyle(Theme.accentLight)
                        .overlay(Capsule().stroke(Theme.accent.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                }
                .buttonStyle(.borderless)
            }
        }
        .listRowSeparator(.hidden)
        .padding(.top, 4)
    }

    private var sendRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button { Task { await sendRequests() } } label: {
                HStack {
                    Spacer()
                    if sending { ProgressView() } else {
                        Label(drafts.isEmpty ? "Everyone has been asked" : "Send Requests (\(drafts.count))", systemImage: "envelope")
                    }
                    Spacer()
                }
                .font(.subheadline.weight(.semibold))
                .padding(.vertical, 10)
                .foregroundStyle(.white)
                .background(drafts.isEmpty ? Color.secondary.opacity(0.3) : Theme.accent, in: RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.borderless)
            .disabled(drafts.isEmpty || sending)
            let noEmail = assignments.filter { members[$0.memberId]?.email == nil && ($0.status ?? "draft") == "draft" }.count
            if noEmail > 0 {
                Text("\(noEmail) \(noEmail == 1 ? "person has" : "people have") no email address. Add one on the Team tab to invite them.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func personRow(_ a: Assignment) -> some View {
        let m = members[a.memberId]
        let p = posById[a.positionId]
        let draft = (a.status ?? "draft") == "draft"
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(m?.name ?? "Someone").font(.body.weight(.medium)).lineLimit(1)
                Text((p?.name ?? "") + (m?.email == nil && draft ? " · no email" : ""))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            StatusPill(status: a.status)
            if canEdit, (a.status == "invited" || a.status == "declined"), m?.email != nil {
                Button { Task { await resend(a) } } label: { Image(systemName: "paperplane") }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Send the invite again")
            }
            if canEdit {
                Button { Task { await remove(a) } } label: { Image(systemName: "xmark").foregroundStyle(.secondary) }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Remove \(m?.name ?? "") from this set")
            }
        }
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

    /// Returns an error message, or nil when added.
    private func add(position: Position, member: TeamMember) async -> String? {
        do {
            let a: Assignment = try await supabase.from("set_assignments")
                .insert(NewAssignment(set_id: set.id, position_id: position.id, member_id: member.id))
                .select("id,set_id,position_id,member_id,status").single().execute().value
            assignments.append(a)
            note = nil
            return nil
        } catch {
            return "\(member.name) is already on this set as \(position.name)."
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

    private func resend(_ a: Assignment) async {
        note = await Invites.send(assignments: [a.id])
        await load()
    }

    private func sendRequests() async {
        sending = true
        defer { sending = false }
        note = await Invites.send(assignments: drafts.map(\.id))
        await load()
    }
}

/// Add someone to one team section: choose the person (people who fill a position in this
/// section are listed first), then the position (theirs first). Stays open to add several.
struct AddToSectionSheet: View {
    @Environment(\.dismiss) private var dismiss
    let section: TeamSection
    let members: [TeamMember]
    let pool: [Position]
    var onAdd: (Position, TeamMember) async -> String?

    @State private var member: TeamMember?
    @State private var position: Position?
    @State private var error: String?
    @State private var added: [String] = []

    private var qualified: [TeamMember] {
        members.filter { m in pool.contains { (m.positionIds ?? []).contains($0.id) } }.sorted { $0.name < $1.name }
    }
    private var others: [TeamMember] {
        members.filter { m in !pool.contains { (m.positionIds ?? []).contains($0.id) } }.sorted { $0.name < $1.name }
    }
    private var theirPositions: [Position] { member.map { m in pool.filter { (m.positionIds ?? []).contains($0.id) } } ?? [] }
    private var otherPositions: [Position] { member.map { m in pool.filter { !(m.positionIds ?? []).contains($0.id) } } ?? pool }

    var body: some View {
        NavigationStack {
            Form {
                if members.isEmpty {
                    Text("Add people on the Team tab first.").foregroundStyle(.secondary)
                } else if pool.isEmpty {
                    Text("There are no \(section.label) positions yet. Add one on the Team tab.").foregroundStyle(.secondary)
                } else {
                    Section {
                        Picker("Person", selection: $member) {
                            Text("Choose a person…").tag(TeamMember?.none)
                            if !qualified.isEmpty {
                                Section(section.label) { ForEach(qualified) { Text($0.name).tag(Optional($0)) } }
                            }
                            if !others.isEmpty {
                                Section("Everyone else") { ForEach(others) { Text($0.name).tag(Optional($0)) } }
                            }
                        }
                        .onChange(of: member) { _, m in pick(m) }
                        if member != nil && pool.count > 1 {
                            Picker("Position", selection: $position) {
                                Text("Position…").tag(Position?.none)
                                if !theirPositions.isEmpty, let first = member?.name.split(separator: " ").first {
                                    Section("\(first)'s positions") { ForEach(theirPositions) { Text($0.name).tag(Optional($0)) } }
                                }
                                if !otherPositions.isEmpty {
                                    Section("Other positions") { ForEach(otherPositions) { Text($0.name).tag(Optional($0)) } }
                                }
                            }
                        }
                    }
                    Section {
                        Button {
                            Task { await add() }
                        } label: {
                            Label("Add", systemImage: "person.badge.plus").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(member == nil || position == nil)
                        .listRowBackground(Color.clear)
                    }
                    if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
                    if !added.isEmpty {
                        Section("Added") { ForEach(added, id: \.self) { Label($0, systemImage: "checkmark").foregroundStyle(.green) } }
                    }
                }
            }
            .navigationTitle("Add to \(section.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    /// Like the web: pick the person's only position in this section, or the section's only position.
    private func pick(_ m: TeamMember?) {
        error = nil
        guard let m else { position = nil; return }
        let mine = pool.filter { (m.positionIds ?? []).contains($0.id) }
        position = mine.count == 1 ? mine[0] : pool.count == 1 ? pool[0] : nil
    }

    private func add() async {
        guard let member, let position else { return }
        if let message = await onAdd(position, member) {
            error = message
        } else {
            added.append("\(member.name) · \(position.name)")
            self.member = nil
            self.position = nil
        }
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
