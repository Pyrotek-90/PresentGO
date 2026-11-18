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

/// Who's serving on a set, right in the set's list: one compact row per person with their
/// position(s) and answer, grouped Production and Band. One Assign button opens the whole team
/// to pick positions from; Send Requests asks everyone not asked yet.
struct SetTeamSection: View {
    @Environment(SessionStore.self) private var session
    let set: ServiceSet
    @State private var assignments: [Assignment] = []
    @State private var members: [UUID: TeamMember] = [:]
    @State private var positions: [Position] = []
    @State private var loaded = false
    @State private var assigning = false
    @State private var sending = false
    @State private var note: String?

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private var posById: [UUID: Position] { Dictionary(uniqueKeysWithValues: positions.map { ($0.id, $0) }) }
    private var drafts: [Assignment] {
        assignments.filter { ($0.status ?? "draft") == "draft" && members[$0.memberId]?.email != nil }
    }

    /// One row per person: their assignments on this set, in position order.
    private struct Person: Identifiable {
        let member: TeamMember
        let assignments: [Assignment]
        var id: UUID { member.id }
    }

    private func people(in group: ScheduleMatrix.MatrixGroup) -> [Person] {
        let pos = posById
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        let rank: (Assignment) -> (Int, Int) = { a in
            guard let p = pos[a.positionId] else { return (999, 999) }
            return (ScheduleMatrix.MatrixGroup.rank(p), order[p.id] ?? 0)
        }
        let mine = assignments.filter { a in pos[a.positionId].map { ScheduleMatrix.MatrixGroup.of($0) == group } ?? false }
        return Dictionary(grouping: mine, by: \.memberId)
            .compactMap { id, list in members[id].map { Person(member: $0, assignments: list.sorted { rank($0) < rank($1) }) } }
            .sorted { a, b in
                let ra = rank(a.assignments[0]), rb = rank(b.assignments[0])
                return ra != rb ? ra < rb : a.member.name < b.member.name
            }
    }

    var body: some View {
        Section {
            if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if assignments.isEmpty {
                HStack {
                    Text("No one scheduled yet").foregroundStyle(.secondary)
                    Spacer()
                    if canEdit { assignButton }
                }
            } else {
                ForEach(ScheduleMatrix.MatrixGroup.allCases, id: \.self) { group in
                    let list = people(in: group)
                    if !list.isEmpty {
                        Text(group.label.uppercased())
                            .font(.caption2.weight(.semibold)).tracking(0.8).foregroundStyle(.secondary)
                            .listRowSeparator(.hidden)
                            .padding(.bottom, -4)
                        ForEach(list) { personRow($0) }
                    }
                }
                if canEdit { sendRow }
            }
            if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            HStack {
                Text("Team for This Set")
                if !assignments.isEmpty {
                    let yes = assignments.filter { $0.status == "accepted" }.count
                    Text("· \(yes) of \(assignments.count) accepted").textCase(nil)
                }
                Spacer()
                if canEdit && !assignments.isEmpty { assignButton.textCase(nil) }
            }
        }
        .sheet(isPresented: $assigning, onDismiss: { Task { await load() } }) {
            AssignTeamSheet(set: set, assignments: $assignments, members: $members, positions: $positions)
        }
        .task(id: set.id) { await load() }
    }

    private var assignButton: some View {
        Button { assigning = true } label: {
            Label("Assign", systemImage: "person.2.badge.plus")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10).padding(.vertical, 4)
                .foregroundStyle(Theme.accentLight)
                .background(Theme.accent.opacity(0.2), in: Capsule())
                .overlay(Capsule().stroke(Theme.accent.opacity(0.7)))
        }
        .buttonStyle(.borderless)
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
                .padding(.vertical, 8)
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
        .padding(.vertical, 2)
    }

    /// "Ana Smith   Keys, Singer   ● Accepted"
    private func personRow(_ person: Person) -> some View {
        let m = person.member
        let names = person.assignments.compactMap { posById[$0.positionId]?.name }.joined(separator: ", ")
        // The least settled answer: Declined, then Not sent, Waiting, Accepted.
        let order = ["declined", "draft", "invited", "accepted"]
        let status = person.assignments.map { $0.status ?? "draft" }.min { (order.firstIndex(of: $0) ?? 1) < (order.firstIndex(of: $1) ?? 1) }
        return HStack(spacing: 10) {
            Text(m.name).font(.subheadline.weight(.medium)).lineLimit(1)
            Text(names + (m.email == nil && status == "draft" ? " · no email" : ""))
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Spacer(minLength: 6)
            StatusPill(status: status)
        }
        .swipeActions {
            if canEdit {
                Button("Remove", role: .destructive) { Task { await remove(person.assignments) } }
                if person.assignments.contains(where: { $0.status == "invited" || $0.status == "declined" }), m.email != nil {
                    Button("Resend") { Task { await resend(person.assignments) } }.tint(Theme.accent)
                }
            }
        }
        .accessibilityElement(children: .combine)
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

    private func remove(_ list: [Assignment]) async {
        do {
            try await supabase.from("set_assignments").delete().in("id", values: list.map { $0.id.uuidString }).execute()
            let ids = Set(list.map(\.id))
            assignments.removeAll { ids.contains($0.id) }
        } catch {
            note = error.localizedDescription
        }
    }

    private func resend(_ list: [Assignment]) async {
        note = await Invites.send(assignments: list.filter { $0.status == "invited" || $0.status == "declined" }.map(\.id))
        await load()
    }

    private func sendRequests() async {
        sending = true
        defer { sending = false }
        note = await Invites.send(assignments: drafts.map(\.id))
        await load()
    }
}

/// Assign: the whole team in one list, each person with their positions as chips. Tap a chip to
/// put them on the set in that position (tap again to take them off); + gives any other position.
/// Add or edit people right here. Changes save as you tap.
struct AssignTeamSheet: View {
    @Environment(\.dismiss) private var dismiss
    let set: ServiceSet
    @Binding var assignments: [Assignment]
    @Binding var members: [UUID: TeamMember]
    @Binding var positions: [Position]

    @State private var search = ""
    @State private var group: ScheduleMatrix.MatrixGroup?
    @State private var busy: Set<String> = []
    @State private var editing: TeamMember?
    @State private var adding = false
    @State private var error: String?

    private var sortedPositions: [Position] {
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        return positions.sorted {
            (ScheduleMatrix.MatrixGroup.rank($0), order[$0.id] ?? 0) < (ScheduleMatrix.MatrixGroup.rank($1), order[$1.id] ?? 0)
        }
    }
    private func inGroup(_ p: Position) -> Bool { group == nil || ScheduleMatrix.MatrixGroup.of(p) == group }

    private var list: [TeamMember] {
        let q = search.lowercased().trimmingCharacters(in: .whitespaces)
        return members.values
            .filter { q.isEmpty || $0.name.lowercased().contains(q) }
            .filter { m in group == nil || theirs(m).contains(where: inGroup) || isOn(m) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    private func theirs(_ m: TeamMember) -> [Position] { sortedPositions.filter { (m.positionIds ?? []).contains($0.id) } }
    private func assignment(_ m: TeamMember, _ p: Position) -> Assignment? {
        assignments.first { $0.memberId == m.id && $0.positionId == p.id }
    }
    private func isOn(_ m: TeamMember) -> Bool { assignments.contains { $0.memberId == m.id } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Show", selection: $group) {
                        Text("Everyone").tag(ScheduleMatrix.MatrixGroup?.none)
                        ForEach(ScheduleMatrix.MatrixGroup.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                if let error {
                    Section { Text(error).font(.footnote).foregroundStyle(.red) }
                }
                Section {
                    if members.isEmpty {
                        Text("No one on the team yet. Tap Add Member to add someone.").foregroundStyle(.secondary)
                    }
                    ForEach(list) { m in row(m) }
                } footer: {
                    Text("Tap a position to put someone on this set; tap it again to take them off. Use + for a position they don't usually fill.")
                }
            }
            .searchable(text: $search, prompt: "Find a person")
            .navigationTitle("Assign Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { adding = true } label: { Label("Add Member", systemImage: "person.badge.plus") }
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .sheet(item: $editing) { m in
                MemberEditor(member: m, positions: $positions) { await reloadMembers() }
            }
            .sheet(isPresented: $adding) {
                MemberEditor(member: nil, positions: $positions) { await reloadMembers() }
            }
        }
        .presentationDetents([.large])
    }

    private func row(_ m: TeamMember) -> some View {
        let mine = theirs(m).filter(inGroup)
        // Positions they're on for this set that aren't among their usual ones.
        let extra = sortedPositions.filter { p in assignment(m, p) != nil && !mine.contains(p) }
        let others = sortedPositions.filter { p in inGroup(p) && !mine.contains(p) && !extra.contains(p) }
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(m.name).font(.subheadline.weight(.semibold))
                if isOn(m) { Image(systemName: "checkmark.circle.fill").font(.caption).foregroundStyle(Theme.accentLight) }
                Spacer()
                Button { editing = m } label: { Image(systemName: "pencil").font(.caption) }
                    .buttonStyle(.borderless).foregroundStyle(.secondary)
                    .accessibilityLabel("Edit \(m.name)")
            }
            FlowLayout(spacing: 6) {
                ForEach(mine + extra) { p in chip(m, p) }
                if !others.isEmpty {
                    Menu {
                        ForEach(others) { p in Button(p.name) { Task { await toggle(m, p) } } }
                    } label: {
                        Image(systemName: "plus").font(.caption.weight(.semibold))
                            .frame(width: 30, height: 28)
                            .foregroundStyle(Theme.accentLight)
                            .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3])))
                    }
                    .accessibilityLabel("Another position for \(m.name)")
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func chip(_ m: TeamMember, _ p: Position) -> some View {
        let a = assignment(m, p)
        let on = a != nil
        let key = "\(m.id)-\(p.id)"
        return Button { Task { await toggle(m, p) } } label: {
            HStack(spacing: 4) {
                if busy.contains(key) { ProgressView().controlSize(.mini) }
                else if on { Image(systemName: "checkmark").font(.caption2.bold()) }
                Text(p.name)
                if let a, a.status != nil, a.status != "draft" {
                    Circle().fill(statusColor(a.status)).frame(width: 6, height: 6)
                }
            }
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 10).frame(height: 28)
            .foregroundStyle(on ? Theme.accentLight : .secondary)
            .background(on ? Theme.accent.opacity(0.25) : .clear, in: Capsule())
            .overlay(Capsule().stroke(on ? Theme.accent : Color.secondary.opacity(0.35)))
        }
        .buttonStyle(.plain)
        .disabled(busy.contains(key))
        .accessibilityLabel("\(p.name)\(on ? ", on this set, \(a?.statusLabel ?? "")" : "")")
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func statusColor(_ s: String?) -> Color {
        switch s { case "accepted": return .green; case "declined": return .red; case "invited": return .orange; default: return .secondary }
    }

    private func toggle(_ m: TeamMember, _ p: Position) async {
        let key = "\(m.id)-\(p.id)"
        busy.insert(key)
        defer { busy.remove(key) }
        error = nil
        do {
            if let a = assignment(m, p) {
                try await supabase.from("set_assignments").delete().eq("id", value: a.id).execute()
                assignments.removeAll { $0.id == a.id }
            } else {
                let a: Assignment = try await supabase.from("set_assignments")
                    .insert(NewAssignment(set_id: set.id, position_id: p.id, member_id: m.id))
                    .select("id,set_id,position_id,member_id,status").single().execute().value
                assignments.append(a)
            }
        } catch {
            self.error = "Couldn't update \(m.name) as \(p.name). \(error.localizedDescription)"
        }
    }

    private func reloadMembers() async {
        guard let church = set.churchId else { return }
        if let list: [TeamMember] = try? await supabase.from("team_members").select(TeamMember.columns)
            .eq("church_id", value: church).order("name").execute().value {
            members = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
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
