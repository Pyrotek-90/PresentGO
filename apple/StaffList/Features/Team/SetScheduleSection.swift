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
/// position(s) and answer, grouped Production, Singers and Musicians. One Assign button opens the whole team
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
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// Phones: a colored dot instead of the status word, with a legend under the table.
    private var compact: Bool { sizeClass != .regular }

    private var canEdit: Bool { session.team(for: set)?.canEdit ?? false }
    private var posById: [UUID: Position] { Dictionary(uniqueKeysWithValues: positions.map { ($0.id, $0) }) }
    private var drafts: [Assignment] {
        assignments.filter { ($0.status ?? "draft") == "draft" && members[$0.memberId]?.email != nil }
    }

    /// This group's assignments, in position order (Presenter, Audio… Singer… Keys, Acoustic…), then name.
    private func rows(in group: ScheduleMatrix.MatrixGroup) -> [Assignment] {
        let pos = posById
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        return assignments
            .filter { a in members[a.memberId] != nil && (pos[a.positionId].map { ScheduleMatrix.MatrixGroup.of($0) == group } ?? false) }
            .sorted { a, b in
                let pa = pos[a.positionId]!, pb = pos[b.positionId]!
                let ra = (ScheduleMatrix.MatrixGroup.rank(pa), order[pa.id] ?? 0), rb = (ScheduleMatrix.MatrixGroup.rank(pb), order[pb.id] ?? 0)
                return ra != rb ? ra < rb : (members[a.memberId]?.name ?? "") < (members[b.memberId]?.name ?? "")
            }
    }

    private var groupWidth: CGFloat { compact ? 66 : 92 }
    private var positionWidth: CGFloat { compact ? 78 : 104 }

    var body: some View {
        Section {
            if !loaded {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if assignments.isEmpty {
                Text("No one scheduled yet").foregroundStyle(.secondary)
            } else {
                columnHeader
                ForEach(ScheduleMatrix.MatrixGroup.allCases, id: \.self) { group in
                    let list = rows(in: group)
                    // The section's name sits in the first column of its first row only, and the
                    // people in one section sit together with no lines between them.
                    ForEach(Array(list.enumerated()), id: \.element.id) { i, a in
                        assignmentRow(a, group: i == 0 ? group : nil)
                            .listRowSeparator(i == 0 ? .visible : .hidden, edges: .top)
                            .listRowSeparator(i == list.count - 1 ? .visible : .hidden, edges: .bottom)
                            .listRowInsets(EdgeInsets(top: SetRowMetrics.vInset, leading: 16, bottom: SetRowMetrics.vInset, trailing: 16))
                    }
                }
                if canEdit { sendRow }
            }
            if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
        } header: {
            HStack {
                Text("Team")
                if !assignments.isEmpty {
                    let yes = assignments.filter { $0.status == "accepted" }.count
                    Text("\(yes) of \(assignments.count) accepted").foregroundStyle(.secondary).textCase(nil)
                }
                Spacer()
                if canEdit { assignButton.textCase(nil) }
            }
        } footer: {
            if !assignments.isEmpty && compact { StatusLegend() }
        }
        // The sheet keeps its own copy while open, so changes here don't redraw (and close) it.
        .sheet(isPresented: $assigning, onDismiss: { Task { await load() } }) {
            AssignTeamSheet(set: set, assignments: assignments, members: members, positions: positions)
                .interactiveDismissDisabled(false)
        }
        .task(id: set.id) { await load() }
    }

    private var statusWidth: CGFloat { compact ? 40 : 84 }

    private var assignButton: some View {
        Button { assigning = true } label: {
            // Same as New Set on the Sets page.
            Label("Assign", systemImage: "plus").font(.caption.weight(.semibold))
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

    /// SECTION · POSITION · NAME · STATUS, like the Who's Serving table.
    private var columnHeader: some View {
        HStack(spacing: compact ? 6 : 10) {
            Text("Section").frame(width: groupWidth, alignment: .leading)
            Text("Position").frame(width: positionWidth, alignment: .leading)
            Text("Name").frame(maxWidth: .infinity, alignment: .leading)
            Text("Status").frame(width: statusWidth, alignment: compact ? .center : .trailing)
        }
        .font(.system(size: 10, weight: .semibold)).tracking(0.8).textCase(.uppercase)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    private func assignmentRow(_ a: Assignment, group: ScheduleMatrix.MatrixGroup?) -> some View {
        let m = members[a.memberId]
        let draft = (a.status ?? "draft") == "draft"
        return HStack(spacing: compact ? 6 : 10) {
            Text(group?.label.uppercased() ?? "")
                .font(.system(size: compact ? 9 : 11, weight: .bold)).tracking(0.4).foregroundStyle(Theme.accentLight)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: groupWidth, alignment: .leading)
            Text(posById[a.positionId]?.name ?? "")
                .font(compact ? .footnote : .subheadline).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.85)
                .frame(width: positionWidth, alignment: .leading)
            HStack(spacing: 4) {
                Text(m?.name ?? "Someone").font((compact ? Font.footnote : .subheadline).weight(.medium)).lineLimit(1).minimumScaleFactor(0.85)
                if m?.email == nil && draft {
                    Text("· no email").font(.caption).foregroundStyle(.orange.opacity(0.8)).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if compact {
                Circle().fill(StatusPill.color(a.status)).frame(width: 10, height: 10)
                    .frame(width: statusWidth)
                    .accessibilityLabel(StatusPill.label(a.status))
            } else {
                StatusPill(status: a.status).frame(width: statusWidth, alignment: .trailing)
            }
        }
        .frame(minHeight: SetRowMetrics.minHeight)   // same row height as the Program
        .swipeActions {
            if canEdit {
                Button("Remove", role: .destructive) { Task { await remove([a]) } }
                if a.status == "invited" || a.status == "declined", m?.email != nil {
                    Button("Resend") { Task { await resend([a]) } }.tint(Theme.accent)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    func load() async {
        defer { loaded = true }
        guard let team = session.team(for: set) else { return }
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
    @State private var assignments: [Assignment]
    @State private var members: [UUID: TeamMember]
    @State private var positions: [Position]

    init(set: ServiceSet, assignments: [Assignment], members: [UUID: TeamMember], positions: [Position]) {
        self.set = set
        _assignments = State(initialValue: assignments)
        _members = State(initialValue: members)
        _positions = State(initialValue: positions)
    }

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
            // Same layout as the web Assign Team: filter + search on top, then one line per person
            // (name on the left, their positions beside it), divided like a list.
            VStack(spacing: 0) {
                VStack(spacing: 8) {
                    Picker("Show", selection: $group) {
                        Text("Everyone").tag(ScheduleMatrix.MatrixGroup?.none)
                        ForEach(ScheduleMatrix.MatrixGroup.allCases, id: \.self) { Text($0.label).tag(Optional($0)) }
                    }
                    .pickerStyle(.segmented)
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").font(.footnote).foregroundStyle(.secondary)
                        TextField("Find a person", text: $search)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                        if !search.isEmpty {
                            Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 10).frame(height: 36)
                    .background(Color.secondary.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                    if let error { Text(error).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider()
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if members.isEmpty {
                            Text("No one on the team yet. Tap Add Member to add someone.")
                                .foregroundStyle(.secondary).padding(32)
                        } else if list.isEmpty {
                            Text("No one matches.").foregroundStyle(.secondary).padding(32)
                        }
                        ForEach(list) { m in
                            row(m).padding(.horizontal, 16).padding(.vertical, 6)
                            Divider().padding(.leading, 16)
                        }
                    }
                }
                Divider()
                Text("Tap a position to put someone on this set; tap it again to take them off. Use + for a position they don't usually fill.")
                    .font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.vertical, 8)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("Assign Team").font(.headline)
                        Text(set.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
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
        // Compact: the name on the left with their positions on the same line (wrapping if needed).
        return HStack(alignment: .top, spacing: 8) {
            HStack(spacing: 4) {
                Text(m.name).font(.subheadline.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                if isOn(m) { Image(systemName: "checkmark.circle.fill").font(.caption).foregroundStyle(Theme.accentLight) }
            }
            .frame(width: 112, height: 28, alignment: .leading)
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
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { editing = m } label: { Image(systemName: "pencil").font(.caption) }
                .buttonStyle(.borderless).foregroundStyle(.secondary)
                .frame(height: 28)
                .accessibilityLabel("Edit \(m.name)")
        }
        .padding(.vertical, 1)
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
        StatusPill.color(s)
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
        Text(Self.label(status))
            .font(.caption.weight(.semibold))
            .lineLimit(1).fixedSize()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(Self.color(status))
            .background(Self.color(status).opacity(0.15), in: Capsule())
    }

    static func label(_ status: String?) -> String {
        switch status ?? "draft" {
        case "invited": return "Pending"
        case "accepted": return "Accepted"
        case "declined": return "Declined"
        default: return "Not sent"
        }
    }

    /// Grey not sent, yellow pending, green accepted, red declined.
    static func color(_ status: String?) -> Color {
        switch status {
        case "accepted": return .green
        case "declined": return .red
        case "invited": return .yellow
        default: return .gray
        }
    }
}

/// The key for the status dots: ● Not sent ● Pending ● Accepted ● Declined.
struct StatusLegend: View {
    var body: some View {
        HStack(spacing: 10) {
            ForEach(["draft", "invited", "accepted", "declined"], id: \.self) { s in
                HStack(spacing: 4) {
                    Circle().fill(StatusPill.color(s)).frame(width: 7, height: 7)
                    Text(StatusPill.label(s))
                }
            }
        }
        .font(.caption2)
        .accessibilityElement(children: .combine)
    }
}


/// Assign Team opened from the Team tab's Who's Serving: choose the set (the next one by
/// default), then assign people to it exactly as on the set's own page.
struct TeamAssignSheet: View {
    @Environment(SessionStore.self) private var session
    let members: [UUID: TeamMember]
    let positions: [Position]
    /// The set selected in Who's Serving; nil = the next upcoming one.
    var initialSetID: UUID? = nil

    @State private var sets: [ServiceSet] = []
    @State private var selected: ServiceSet?
    @State private var assignments: [Assignment] = []
    @State private var assignmentsFor: UUID?   // the set `assignments` belong to
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 0) {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if sets.isEmpty {
                ContentUnavailableView("No dated sets yet", systemImage: "calendar",
                                       description: Text("Give a set a date to assign the team."))
            } else {
                HStack {
                    Text("Set").font(.subheadline).foregroundStyle(.secondary)
                    Picker("Set", selection: Binding(get: { selected?.id }, set: { id in
                        selected = sets.first { $0.id == id }
                    })) {
                        ForEach(sets) { s in Text(label(s)).tag(Optional(s.id)) }
                    }
                    .labelsHidden()
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.vertical, 8)
                if let set = selected, assignmentsFor == set.id {
                    AssignTeamSheet(set: set, assignments: assignments, members: members, positions: positions)
                        .id(set.id)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        }
        .task { await load() }
        .task(id: selected?.id) { await loadAssignments() }
    }

    private func label(_ s: ServiceSet) -> String {
        var parts = [s.name]
        if let d = s.date { parts.append(d.formatted(.dateTime.month(.abbreviated).day())) }
        return parts.joined(separator: " · ")
    }

    private func load() async {
        defer { loaded = true }
        guard let team = session.currentTeam else { return }
        let today = ServiceSet.dayFormatter.string(from: .now)
        do {
            async let last: [ServiceSet] = supabase.from("sets").select(ServiceSet.columns)
                .eq("church_id", value: team.id).lt("service_date", value: today)
                .order("service_date", ascending: false).order("service_time", ascending: false)
                .limit(1).execute().value
            async let next: [ServiceSet] = supabase.from("sets").select(ServiceSet.columns)
                .eq("church_id", value: team.id).gte("service_date", value: today)
                .order("service_date").order("service_time")
                .limit(30).execute().value
            let list = try await last + next
            sets = list
            selected = list.first { $0.id == initialSetID }
                ?? list.first { ($0.serviceDate ?? today) >= today } ?? list.last
        } catch {
            sets = []
        }
    }

    private func loadAssignments() async {
        guard let set = selected else { return }
        if let list: [Assignment] = try? await supabase.from("set_assignments")
            .select("id,set_id,position_id,member_id,status").eq("set_id", value: set.id).execute().value {
            assignments = list
            assignmentsFor = set.id
        }
    }
}
