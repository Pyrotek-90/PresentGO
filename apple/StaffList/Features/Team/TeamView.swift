import SwiftUI
import Supabase

/// The team: members with their positions, add / edit / remove people, invite them to join the
/// team, and message the team. For Admins and Leaders.
struct TeamView: View {
    @Environment(SessionStore.self) private var session
    @State private var members: [TeamMember] = []
    @State private var positions: [Position] = []
    @State private var search = ""
    @State private var editing: TeamMember?
    @State private var adding = false
    @State private var messaging = false
    @State private var note: String?
    @State private var loading = true
    @AppStorage("teamMembersCollapsed") private var membersCollapsed = false
    @AppStorage("servingMatrixCollapsed") private var matrixCollapsed = false
    @State private var reloadToken = 0
    @State private var openSet: ServiceSet?
    @State private var expanded = false      // Who's Serving full screen
    @State private var assigning = false     // Assign Team (from the Who's Serving header)
    @State private var assigningFull = false // Assign Team (from the full-screen view)
    @State private var coverSet: ServiceSet?
    /// The set selected in Who's Serving (shared by the pane and the full-screen view).
    @State private var matrixSelected: UUID?
    @State private var filterPosition: UUID?
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var membersByID: [UUID: TeamMember] { Dictionary(uniqueKeysWithValues: members.map { ($0.id, $0) }) }
    @State private var showingDetails = false
    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private var filtering: Bool { !search.trimmingCharacters(in: .whitespaces).isEmpty || filterPosition != nil }
    private var showMembers: Bool { !membersCollapsed || filtering }

    private var filtered: [TeamMember] {
        let q = search.lowercased().trimmingCharacters(in: .whitespaces)
        let digits = q.filter(\.isNumber)
        return members
            .filter { q.isEmpty || $0.name.lowercased().contains(q) || ($0.email ?? "").lowercased().contains(q)
                || (!digits.isEmpty && ($0.phone ?? "").filter(\.isNumber).contains(digits)) }
            .filter { filterPosition == nil || ($0.positionIds ?? []).contains(filterPosition!) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            List {
                if let note {
                    Section { Text(note).font(.footnote) }
                }
                Section {
                    if showMembers {
                        filterBar
                        if sizeClass == .regular && !filtered.isEmpty { columnHeader }
                        if filtered.isEmpty && !members.isEmpty {
                            Text("No members match your search.").font(.subheadline).foregroundStyle(.secondary)
                        }
                        ForEach(filtered) { m in
                            Button { editing = m } label: { row(m) }
                                .tint(.primary)
                                .swipeActions {
                                    Button("Remove", role: .destructive) { Task { await remove(m) } }
                                    if m.email != nil, m.joinStatus != "accepted" {
                                        Button("Invite") { Task { note = await Invites.send(members: [m.id]); await load() } }.tint(.accentColor)
                                    }
                                }
                        }
                    }
                } header: {
                    Button {
                        withAnimation(.snappy) { membersCollapsed.toggle() }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down")
                                .rotationEffect(.degrees(showMembers ? 0 : -90))
                            Text("Team Members")
                            Text("\(members.count)").foregroundStyle(.secondary)
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .trailing) {
                        HStack(spacing: 14) {
                            Button { messaging = true } label: {
                                Label("Message", systemImage: "envelope").font(.caption.weight(.semibold)).textCase(nil)
                            }
                            .disabled(members.isEmpty)
                            Button { adding = true } label: {
                                Label("Add", systemImage: "person.badge.plus").font(.caption.weight(.semibold)).textCase(nil)
                            }
                        }
                        .buttonStyle(.borderless)
                    }
                    .accessibilityHint(membersCollapsed ? "Shows the team members" : "Hides the team members")
                }
                if !members.isEmpty {
                    Section {
                        if !matrixCollapsed {
                            ScheduleMatrix(members: membersByID, positions: positions, reloadToken: reloadToken,
                                           selectedID: matrixSelected, onSelect: { matrixSelected = $0.id },
                                           showsLegend: false) { openSet = $0 }
                                .listRowInsets(EdgeInsets())
                        }
                    } header: {
                        HStack(spacing: 14) {
                            Button {
                                withAnimation(.snappy) { matrixCollapsed.toggle() }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "chevron.down").rotationEffect(.degrees(matrixCollapsed ? -90 : 0))
                                    Text("Serving")
                                    Spacer()
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(matrixCollapsed ? "Shows the serving matrix" : "Hides the serving matrix")
                            // Quiet, like the Team Members' Message and Add buttons.
                            if canEdit {
                                Button { assigning = true } label: {
                                    Label("Assign", systemImage: "person.2.badge.plus").font(.caption.weight(.semibold)).textCase(nil)
                                }
                                .buttonStyle(.borderless)
                            }
                            Button { expanded = true } label: {
                                Image(systemName: "arrow.up.left.and.arrow.down.right").font(.caption.weight(.semibold))
                            }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Expand the serving matrix to full screen")
                        }
                    } footer: {
                        if !matrixCollapsed { ScheduleMatrix.Legend() }
                    }
                }
            }
            .navigationDestination(item: $openSet) { SetDetailView(set: $0) }
            .overlay {
                if loading && members.isEmpty { ProgressView() }
                else if !loading && members.isEmpty {
                    ContentUnavailableView {
                        Label("No team members yet", systemImage: "person.3")
                    } actions: {
                        Button("Add Member") { adding = true }.buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if canEdit {
                    // Team Details is set once, so it lives behind a title-bar button.
                    ToolbarItem(placement: .primaryAction) {
                        HeaderIconButton("Team Details", systemImage: "building.2") { showingDetails = true }
                    }
                    .headerIconItem()
                }
            }
            .sheet(isPresented: $showingDetails) { TeamDetailsSheet() }
            .sheet(item: $editing) { m in
                MemberEditor(member: m, positions: $positions) { await load() }
            }
            .sheet(isPresented: $adding) {
                MemberEditor(member: nil, positions: $positions) { await load() }
            }
            .sheet(isPresented: $messaging) {
                MessageTeamView(members: members)
            }
            .sheet(isPresented: $assigning, onDismiss: { reloadToken += 1 }) {
                TeamAssignSheet(members: membersByID, positions: positions, initialSetID: matrixSelected)
            }
            .fullScreenCover(isPresented: $expanded, onDismiss: { reloadToken += 1 }) {
                NavigationStack {
                    // The matrix scrolls itself, with its header row and position names pinned.
                    ScheduleMatrix(members: membersByID, positions: positions, reloadToken: reloadToken,
                                   selectedID: matrixSelected, onSelect: { matrixSelected = $0.id },
                                   fillsSpace: true) { coverSet = $0 }
                    .navigationTitle("Serving")
                    .navigationBarTitleDisplayMode(.inline)
                    .navigationDestination(item: $coverSet) { SetDetailView(set: $0) }
                    .toolbar {
                        if canEdit {
                            ToolbarItem(placement: .topBarLeading) {
                                HeaderIconButton("Assign", systemImage: "person.2.badge.plus") { assigningFull = true }
                            }.headerIconItem()
                        }
                        ToolbarItem(placement: .confirmationAction) { HeaderTextButton("Done") { expanded = false } }.headerIconItem()
                    }
                    .sheet(isPresented: $assigningFull, onDismiss: { reloadToken += 1 }) {
                        TeamAssignSheet(members: membersByID, positions: positions, initialSetID: matrixSelected)
                    }
                }
            }
            .refreshable { await load(); reloadToken += 1 }
            .task { await load() }
        }
    }

    // MARK: Members table (like the web: Name, Positions, Email, Phone, Joined)

    private var filterBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search name, email or phone", text: $search)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                        .buttonStyle(.borderless).accessibilityLabel("Clear search")
                }
            }
            .padding(.horizontal, 8).frame(height: 34)
            .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            Menu {
                Picker("Position", selection: $filterPosition) {
                    Text("All positions").tag(UUID?.none)
                    ForEach(MemberEditor.sorted(positions)) { p in Text(p.name).tag(Optional(p.id)) }
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "line.3.horizontal.decrease.circle\(filterPosition == nil ? "" : ".fill")")
                    Text(positions.first { $0.id == filterPosition }?.name ?? "All positions").lineLimit(1)
                }
                .font(.subheadline)
                .padding(.horizontal, 10).frame(height: 34)
                .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            }
            if filterPosition != nil {
                Button("Clear") { filterPosition = nil }.font(.caption).buttonStyle(.borderless)
            }
        }
        .listRowSeparator(.hidden)
    }

    private enum Col {
        static let name: CGFloat = 150, email: CGFloat = 220, phone: CGFloat = 112, joined: CGFloat = 64
    }

    private var columnHeader: some View {
        HStack(spacing: 12) {
            Text("Name").frame(width: Col.name, alignment: .leading)
            Text("Positions").frame(maxWidth: .infinity, alignment: .leading)
            Text("Email").frame(width: Col.email, alignment: .leading)
            Text("Phone").frame(width: Col.phone, alignment: .leading)
            Text("Joined").frame(width: Col.joined)
            Color.clear.frame(width: 8)
        }
        .font(.system(size: 10, weight: .semibold)).tracking(0.8).textCase(.uppercase)
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
    }

    private func memberPositions(_ m: TeamMember) -> [Position] {
        MemberEditor.sorted(positions).filter { (m.positionIds ?? []).contains($0.id) }
    }

    @ViewBuilder
    private func row(_ m: TeamMember) -> some View {
        if sizeClass == .regular {
            HStack(spacing: 12) {
                Text(m.name).font(.subheadline.weight(.medium)).lineLimit(1)
                    .frame(width: Col.name, alignment: .leading)
                chips(m).frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if let e = m.email { Text(e).foregroundStyle(.secondary) } else { Text("No email").foregroundStyle(.orange.opacity(0.8)) }
                }
                .font(.caption).lineLimit(1).truncationMode(.middle)
                .frame(width: Col.email, alignment: .leading)
                Group {
                    if let p = m.phone, !p.isEmpty { Text(MemberEditor.formatPhone(p)).foregroundStyle(.secondary) } else { Text("No phone").foregroundStyle(.orange.opacity(0.8)) }
                }
                .font(.caption).lineLimit(1)
                .frame(width: Col.phone, alignment: .leading)
                joined(m, large: true).frame(width: Col.joined)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary).frame(width: 8)
            }
            .contentShape(Rectangle())
        } else {
            // Phone: two lines in two columns. Left: name (and joined), then email.
            // Right, in one aligned column: positions, then phone.
            HStack(alignment: .center, spacing: 8) {
                Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 2) {
                    GridRow {
                        HStack(spacing: 6) {
                            Text(m.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                            joined(m, large: false)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text(memberPositions(m).map(\.name).joined(separator: ", ").ifEmpty("—"))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            .frame(width: 112, alignment: .leading)
                    }
                    GridRow {
                        Group {
                            if let e = m.email { Text(e).foregroundStyle(.secondary).truncationMode(.middle) } else { Text("No email").foregroundStyle(.orange.opacity(0.8)) }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Group {
                            if let p = m.phone, !p.isEmpty { Text(MemberEditor.formatPhone(p)).foregroundStyle(.secondary).monospacedDigit() } else { Text("No phone").foregroundStyle(.orange.opacity(0.8)) }
                        }
                        .frame(width: 112, alignment: .leading)
                    }
                    .font(.caption).lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private func chips(_ m: TeamMember) -> some View {
        let list = memberPositions(m)
        if !list.isEmpty {
            FlowLayout(spacing: 3) {
                ForEach(list) { p in
                    Text(p.name).font(.system(size: 10))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .foregroundStyle(.secondary)
                        .overlay(Capsule().stroke(Color.secondary.opacity(0.35)))
                }
            }
        }
    }

    /// Joined / Invited / Declined / Not invited, as on the web.
    @ViewBuilder
    private func joined(_ m: TeamMember, large: Bool) -> some View {
        let size: Font = large ? .body : .caption
        switch m.joinStatus {
        case "accepted":
            Image(systemName: "checkmark.circle.fill").font(size).foregroundStyle(.green).accessibilityLabel("Joined")
        case _ where m.email == nil:
            if large { Text("—").foregroundStyle(.tertiary).accessibilityLabel("No email to invite") }
        case "invited":
            Image(systemName: "clock").font(size).foregroundStyle(.orange).accessibilityLabel("Invited, waiting")
        case "declined":
            Image(systemName: "xmark.circle").font(size).foregroundStyle(.red).accessibilityLabel("Declined")
        default:
            if large { Text("Not invited").font(.system(size: 10)).foregroundStyle(.secondary) }
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        defer { loading = false }
        async let m: [TeamMember] = supabase.from("team_members").select(TeamMember.columns).eq("church_id", value: team.id).order("name").execute().value
        async let p: [Position] = supabase.from("positions").select("id,name,category").eq("church_id", value: team.id).order("created_at").execute().value
        if let list = try? await m { members = list }
        if let list = try? await p { positions = list }
    }

    private func remove(_ m: TeamMember) async {
        do {
            try await supabase.from("team_members").delete().eq("id", value: m.id).execute()
            members.removeAll { $0.id == m.id }
        } catch {
            note = error.localizedDescription
        }
    }
}

/// Add or edit a team member, like the web Team page: name, email, phone (or fill them in from
/// Contacts), the positions they can fill (with + Add for a new one), and the invitation to join.
struct MemberEditor: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let member: TeamMember?
    @Binding var positions: [Position]
    var onSaved: () async -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var picked: Set<UUID> = []
    @State private var newPosition: String?
    @State private var inviteAfterSave = true
    @State private var saving = false
    @State private var confirmDelete = false
    @State private var note: String?
    @State private var error: String?
    @FocusState private var newPositionFocused: Bool

    private var emailValid: Bool {
        let e = email.trimmingCharacters(in: .whitespaces)
        return e.contains("@") && e.split(separator: "@").last?.contains(".") == true
    }
    /// Not joined yet and not already asked.
    private var canAskToJoin: Bool { !["accepted", "invited"].contains(member?.joinStatus ?? "") }
    private var willInvite: Bool { inviteAfterSave && canAskToJoin && emailValid }

    private var first: String { name.trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init) ?? "them" }
    private var teamName: String { session.currentTeam?.name ?? "the team" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Full name", text: $name).textContentType(.name)
                    TextField("name@example.com", text: $email)
                        .keyboardType(.emailAddress).textContentType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("555.555.5555", text: $phone)
                        .keyboardType(.phonePad).textContentType(.telephoneNumber)
                        .onChange(of: phone) { _, v in
                            let f = MemberEditor.formatPhone(v)
                            if f != v { phone = f }
                        }
                } header: {
                    HStack {
                        Text("Name, Email, Phone")
                        Spacer()
                        Button {
                            ContactPicker.present { c in
                                name = c.name; if let e = c.email { email = e }; if let p = c.phone { phone = MemberEditor.formatPhone(p) }
                            }
                        } label: {
                            Label("Import from Contacts", systemImage: "person.crop.circle.badge.plus")
                                .font(.caption.weight(.medium)).textCase(nil)
                        }
                    }
                }

                Section("Positions") {
                    FlowLayout(spacing: 6) {
                        ForEach(MemberEditor.sorted(positions)) { p in
                            let on = picked.contains(p.id)
                            Button {
                                if on { picked.remove(p.id) } else { picked.insert(p.id) }
                            } label: {
                                HStack(spacing: 4) {
                                    if on { Image(systemName: "checkmark").font(.caption2.bold()) }
                                    Text(p.name)
                                }
                                .font(.footnote.weight(.medium))
                                .padding(.horizontal, 10).frame(height: 30)
                                .foregroundStyle(on ? Theme.accentLight : .secondary)
                                .background(on ? Theme.accent.opacity(0.2) : .clear, in: Capsule())
                                .overlay(Capsule().stroke(on ? Theme.accent : Color.secondary.opacity(0.35)))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                        if let binding = Binding($newPosition) {
                            HStack(spacing: 4) {
                                TextField("New position", text: binding)
                                    .font(.footnote).frame(width: 110)
                                    .focused($newPositionFocused)
                                    .submitLabel(.done)
                                    .onSubmit { Task { await addPosition() } }
                                Button { Task { await addPosition() } } label: { Image(systemName: "checkmark") }
                                    .font(.caption.bold())
                                    .disabled(binding.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty)
                                Button { newPosition = nil } label: { Image(systemName: "xmark") }
                                    .font(.caption).foregroundStyle(.secondary)
                                    .accessibilityLabel("Cancel new position")
                            }
                            .buttonStyle(.plain)
                            .padding(.leading, 10).padding(.trailing, 6).frame(height: 30)
                            .background(Theme.accent.opacity(0.1), in: Capsule())
                            .overlay(Capsule().stroke(Theme.accent))
                        } else {
                            Button {
                                newPosition = ""
                                newPositionFocused = true
                            } label: {
                                Label("Add", systemImage: "plus")
                                    .font(.footnote.weight(.medium))
                                    .padding(.horizontal, 10).frame(height: 30)
                                    .foregroundStyle(Theme.accentLight)
                                    .overlay(Capsule().strokeBorder(Theme.accent.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3])))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section { invitation }
                if let note { Section { Text(note).font(.footnote) } }
                if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
                if member != nil {
                    Section {
                        Button("Delete Member", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(member == nil ? "Add Team Member" : "Edit Team Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { HeaderIconButton("Cancel", systemImage: "xmark") { dismiss() } }.headerIconItem()
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        HeaderTextButton(willInvite ? "Save & Invite" : member == nil ? "Save" : "Update") { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || (inviteAfterSave && canAskToJoin && !emailValid))
                    }
                }.headerIconItem()
            }
            .confirmationDialog("Delete \(member?.name ?? "this member")?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete", role: .destructive) { Task { await delete() } }
            } message: {
                Text("They'll be removed from the team and from any sets they're scheduled on.")
            }
            .onAppear {
                name = member?.name ?? ""
                email = member?.email ?? ""
                phone = MemberEditor.formatPhone(member?.phone ?? "")
                picked = Set(member?.positionIds ?? [])
                // New people: invite by default. Editing someone: only if you turn it on.
                inviteAfterSave = member == nil
            }
        }
    }

    @ViewBuilder
    private var invitation: some View {
        switch member?.joinStatus {
        case "accepted":
            Label("\(first) has joined \(teamName).", systemImage: "checkmark.circle.fill")
                .font(.footnote).foregroundStyle(.green)
        case "invited":
            HStack {
                Label("Invitation to join sent; waiting for \(first).", systemImage: "clock")
                    .font(.footnote).foregroundStyle(.orange)
                Spacer()
                Button("Send Again") {
                    guard let id = member?.id else { return }
                    Task { note = await Invites.send(members: [id]) }
                }
                .font(.footnote)
            }
        default:
            Toggle(isOn: $inviteAfterSave) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Send an invitation email to join \(teamName)\(member?.joinStatus == "declined" ? " again" : "")")
                    Text("Once they join, they get set requests and see their sets, charts and lyrics.")
                        .font(.caption).foregroundStyle(.secondary)
                    if inviteAfterSave {
                        if name.trimmingCharacters(in: .whitespaces).isEmpty || !emailValid {
                            Text("Fill in the name and email to send it.")
                                .font(.caption).foregroundStyle(.orange)
                        } else {
                            Text("Sent to \(email.trimmingCharacters(in: .whitespaces)) when you tap Save & Invite.")
                                .font(.caption).foregroundStyle(Theme.accentLight)
                        }
                    }
                }
            }
        }
    }

    /// Standard positions first, in the web's order, then the team's own.
    static func sorted(_ list: [Position]) -> [Position] {
        let order = ["singer", "keys", "acoustic", "electric", "bass", "drums", "audio", "presenter"]
        return list.enumerated().sorted { a, b in
            let ia = order.firstIndex(of: a.element.name.lowercased()) ?? 1000
            let ib = order.firstIndex(of: b.element.name.lowercased()) ?? 1000
            return (ia, a.offset) < (ib, b.offset)
        }.map(\.element)
    }

    /// 555.555.5555, like the web (US numbers; anything else is left as typed).
    static func formatPhone(_ raw: String) -> String {
        var digits = raw.filter(\.isNumber)
        if digits.count == 11, digits.hasPrefix("1") { digits.removeFirst() }
        guard digits.count <= 10, !raw.contains("+") || digits.count == 10 else { return raw }
        let d = Array(digits)
        switch d.count {
        case 0...3: return String(d)
        case 4...6: return "\(String(d[0..<3])).\(String(d[3...]))"
        default: return "\(String(d[0..<3])).\(String(d[3..<6])).\(String(d[6...]))"
        }
    }

    private func addPosition() async {
        let n = (newPosition ?? "").trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        if let existing = positions.first(where: { $0.name.caseInsensitiveCompare(n) == .orderedSame }) {
            picked.insert(existing.id); newPosition = nil; return
        }
        guard let team = session.currentTeam, let user = session.user else { return }
        do {
            let p: Position = try await supabase.from("positions")
                .insert(NewPosition(name: n, category: "Other", user_id: user.id, church_id: team.id))
                .select("id,name,category").single().execute().value
            positions.append(p)
            picked.insert(p.id)
            newPosition = nil
        } catch {
            self.error = "Couldn't add that position. \(error.localizedDescription)"
        }
    }

    private func save() async {
        guard let team = session.currentTeam, let user = session.user else { return }
        saving = true
        defer { saving = false }
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        let trimmedPhone = phone.trimmingCharacters(in: .whitespaces)
        var payload = MemberPayload(name: name.trimmingCharacters(in: .whitespaces),
                                    email: trimmedEmail.isEmpty ? nil : trimmedEmail,
                                    phone: trimmedPhone.isEmpty ? nil : trimmedPhone,
                                    position_ids: Array(picked))
        do {
            let saved: TeamMember
            if let member {
                saved = try await supabase.from("team_members").update(payload).eq("id", value: member.id)
                    .select(TeamMember.columns).single().execute().value
            } else {
                payload.user_id = user.id
                payload.church_id = team.id
                saved = try await supabase.from("team_members").insert(payload)
                    .select(TeamMember.columns).single().execute().value
            }
            if inviteAfterSave, saved.email != nil, !["accepted", "invited"].contains(saved.joinStatus ?? "") {
                let result = await Invites.send(members: [saved.id])
                note = result
            }
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let member else { return }
        do {
            try await supabase.from("team_members").delete().eq("id", value: member.id).execute()
            await onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Message Team: an in-app message (and email to people without the app) to chosen members.
struct MessageTeamView: View {
    @Environment(\.dismiss) private var dismiss
    let members: [TeamMember]
    @State private var picked: Set<UUID> = []
    @State private var subject = ""
    @State private var message = ""
    @State private var sending = false
    @State private var result: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Subject", text: $subject)
                    TextEditor(text: $message).frame(minHeight: 140)
                }
                Section {
                    Button(picked.count == members.count ? "Clear All" : "Select All") {
                        picked = picked.count == members.count ? [] : Set(members.map(\.id))
                    }
                    ForEach(members) { m in
                        Button {
                            if picked.contains(m.id) { picked.remove(m.id) } else { picked.insert(m.id) }
                        } label: {
                            HStack { Text(m.name); Spacer(); if picked.contains(m.id) { Image(systemName: "checkmark").foregroundStyle(.tint) } }
                        }
                        .tint(.primary)
                    }
                } header: { Text("To") }
                if let result { Section { Text(result).font(.footnote) } }
            }
            .navigationTitle("Message Team")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { HeaderTextButton(result == nil ? "Cancel" : "Done", prominent: result != nil) { dismiss() } }.headerIconItem()
                ToolbarItem(placement: .confirmationAction) {
                    if sending { ProgressView() } else {
                        HeaderTextButton("Send") { Task { await send() } }
                            .disabled(picked.isEmpty || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || result != nil)
                    }
                }.headerIconItem()
            }
        }
    }

    private func send() async {
        sending = true
        defer { sending = false }
        var params: JSONObject = [:]
        params["p_member_ids"] = .array(picked.map { .string($0.uuidString.lowercased()) })
        params["p_title"] = .string(subject)
        params["p_body"] = .string(message)
        params["p_set_id"] = .null
        do {
            let out: JSONObject = try await supabase.rpc("send_team_message", params: params).execute().value
            let delivered = out["delivered"]?.intValue ?? 0
            let noAccount = out["no_account"]?.arrayValue?.count ?? 0
            result = "Delivered in the app to \(delivered)." + (noAccount > 0 ? " \(noAccount) \(noAccount == 1 ? "person doesn't" : "people don't") have StaffList yet — message them from stafflist.app by email." : "")
        } catch {
            result = "Couldn't send. \(error.localizedDescription)"
        }
    }
}
