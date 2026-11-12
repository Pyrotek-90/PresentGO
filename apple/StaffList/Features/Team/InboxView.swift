import SwiftUI
import Supabase

/// Notifications: requests to serve (Accept / Decline), answers, reminders and team messages,
/// plus invitations to join a team. Same data as the bell on the web.
struct InboxView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var items: [AppNotification] = []
    @State private var invites: [TeamInvite] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if !invites.isEmpty {
                    Section("Team Invitations") {
                        ForEach(invites, id: \.memberId) { invite in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Join \(invite.team)").font(.headline)
                                if let who = invite.inviter { Text("Invited by \(who)").font(.subheadline).foregroundStyle(.secondary) }
                                HStack {
                                    Button("Join") { Task { await respondTeam(invite, "accepted") } }.buttonStyle(.borderedProminent)
                                    Button("No Thanks") { Task { await respondTeam(invite, "declined") } }.buttonStyle(.bordered)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                Section {
                    ForEach(items) { n in row(n) }
                }
            }
            .overlay {
                if loading && items.isEmpty { ProgressView() }
                else if !loading && items.isEmpty && invites.isEmpty {
                    ContentUnavailableView("You're all caught up", systemImage: "bell")
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .alert("Couldn't save your answer", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: { Text(error ?? "") }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func row(_ n: AppNotification) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                if n.readAt == nil { Circle().fill(.tint).frame(width: 8, height: 8) }
                Text(n.title).font(.body.weight(n.readAt == nil ? .semibold : .regular))
            }
            if let body = n.body, !body.isEmpty { Text(body).font(.subheadline).foregroundStyle(.secondary) }
            if n.kind == "serving_request", let a = n.assignmentId {
                switch n.assignmentStatus {
                case "accepted": Label("You accepted", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.subheadline)
                case "declined": Label("You declined", systemImage: "xmark.circle.fill").foregroundStyle(.red).font(.subheadline)
                default:
                    HStack {
                        Button("Accept") { Task { await respond(a, "accepted") } }.buttonStyle(.borderedProminent)
                        Button("Decline") { Task { await respond(a, "declined") } }.buttonStyle(.bordered)
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        defer { loading = false }
        _ = try? await supabase.rpc("deliver_waiting_requests").execute()
        _ = try? await supabase.rpc("generate_reminders", params: ["p_today": AnyJSON.string(ServiceSet.dayFormatter.string(from: .now))]).execute()
        if let list: [AppNotification] = try? await supabase.rpc("my_notifications", params: ["p_limit": AnyJSON.integer(40)]).execute().value {
            items = list
            let unread = list.filter { $0.readAt == nil && $0.kind != "serving_request" }.map { $0.id.uuidString.lowercased() }
            if !unread.isEmpty {
                let patch: JSONObject = ["read_at": .string(ISO8601DateFormatter().string(from: .now))]
                _ = try? await supabase.from("notifications").update(patch).in("id", values: unread).execute()
            }
        }
        invites = (try? await supabase.rpc("my_team_invites").execute().value) ?? []
    }

    private func respond(_ assignment: UUID, _ answer: String) async {
        do {
            let params: JSONObject = ["p_assignment": .string(assignment.uuidString.lowercased()), "p_response": .string(answer)]
            try await supabase.rpc("respond_assignment", params: params).execute()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func respondTeam(_ invite: TeamInvite, _ answer: String) async {
        do {
            let params: JSONObject = ["p_member": .string(invite.memberId.uuidString.lowercased()), "p_response": .string(answer)]
            try await supabase.rpc("respond_team_member", params: params).execute()
            await session.loadTeams()
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
