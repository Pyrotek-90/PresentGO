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

    private var filtered: [TeamMember] {
        let q = search.lowercased().trimmingCharacters(in: .whitespaces)
        return members
            .filter { q.isEmpty || $0.name.lowercased().contains(q) || ($0.email ?? "").lowercased().contains(q) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    var body: some View {
        NavigationStack {
            List {
                if let note {
                    Section { Text(note).font(.footnote) }
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
            .overlay {
                if loading && members.isEmpty { ProgressView() }
                else if !loading && members.isEmpty {
                    ContentUnavailableView {
                        Label("No team members yet", systemImage: "person.3")
                    } actions: {
                        Button("Add Person") { adding = true }.buttonStyle(.borderedProminent)
                    }
                }
            }
            .searchable(text: $search, prompt: "Name or email")
            .navigationTitle("Team")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button("Message Team", systemImage: "envelope") { messaging = true }
                        .disabled(members.isEmpty)
                    Button("Add Person", systemImage: "person.badge.plus") { adding = true }
                }
            }
            .sheet(item: $editing) { m in
                MemberEditor(member: m, positions: $positions) { await load() }
            }
            .sheet(isPresented: $adding) {
                MemberEditor(member: nil, positions: $positions) { await load() }
            }
            .sheet(isPresented: $messaging) {
                MessageTeamView(members: members)
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func row(_ m: TeamMember) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(m.name).font(.body.weight(.medium))
                let names = positions.filter { (m.positionIds ?? []).contains($0.id) }.map(\.name)
                if !names.isEmpty { Text(names.joined(separator: ", ")).font(.subheadline).foregroundStyle(.secondary) }
            }
            Spacer()
            if let label = m.joinLabel {
                Text(label).font(.caption.bold())
                    .foregroundStyle(m.joinStatus == "accepted" ? .green : .secondary)
            }
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

/// Add or edit a team member: name, email, phone and the positions they can fill.
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
    @State private var newPosition = ""
    @State private var inviteAfterSave = true
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name).textContentType(.name)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress).textContentType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Phone", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                }
                Section("Positions") {
                    ForEach(positions) { p in
                        Button {
                            if picked.contains(p.id) { picked.remove(p.id) } else { picked.insert(p.id) }
                        } label: {
                            HStack { Text(p.name); Spacer(); if picked.contains(p.id) { Image(systemName: "checkmark").foregroundStyle(.tint) } }
                        }
                        .tint(.primary)
                    }
                    HStack {
                        TextField("New position", text: $newPosition)
                        Button("Add") { Task { await addPosition() } }
                            .disabled(newPosition.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                if member?.joinStatus != "accepted" {
                    Section {
                        Toggle("Invite to join the team", isOn: $inviteAfterSave)
                    } footer: {
                        Text("Sends an email invitation so they can see the sets they're scheduled on.")
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
            }
            .navigationTitle(member == nil ? "Add Person" : "Edit Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Save") { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .onAppear {
                name = member?.name ?? ""
                email = member?.email ?? ""
                phone = member?.phone ?? ""
                picked = Set(member?.positionIds ?? [])
                inviteAfterSave = member == nil
            }
        }
    }

    private func addPosition() async {
        let n = newPosition.trimmingCharacters(in: .whitespaces)
        if let existing = positions.first(where: { $0.name.caseInsensitiveCompare(n) == .orderedSame }) {
            picked.insert(existing.id); newPosition = ""; return
        }
        guard let team = session.currentTeam, let user = session.user else { return }
        do {
            let p: Position = try await supabase.from("positions")
                .insert(NewPosition(name: n, category: "Other", user_id: user.id, church_id: team.id))
                .select("id,name,category").single().execute().value
            positions.append(p)
            picked.insert(p.id)
            newPosition = ""
        } catch {
            self.error = "Couldn't add that position. \(error.localizedDescription)"
        }
    }

    private func save() async {
        guard let team = session.currentTeam, let user = session.user else { return }
        saving = true
        defer { saving = false }
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        var payload = MemberPayload(name: name.trimmingCharacters(in: .whitespaces),
                                    email: trimmedEmail.isEmpty ? nil : trimmedEmail,
                                    phone: phone.isEmpty ? nil : phone,
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
                _ = await Invites.send(members: [saved.id])
            }
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
                ToolbarItem(placement: .cancellationAction) { Button(result == nil ? "Cancel" : "Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if sending { ProgressView() } else {
                        Button("Send") { Task { await send() } }
                            .disabled(picked.isEmpty || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || result != nil)
                    }
                }
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
