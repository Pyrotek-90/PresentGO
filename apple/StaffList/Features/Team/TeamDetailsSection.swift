import SwiftUI
import Supabase

/// Team Details at the top of the Team page, like the web (src/components/team/TeamDetails.jsx):
/// the organization, contact and welcome note every invitation email carries.
/// Collapsible; a team with no details yet opens it so they get filled in. Admins also rename
/// the team here.
struct TeamDetailsSection: View {
    @Environment(SessionStore.self) private var session
    @AppStorage("teamDetailsOpen") private var open = false
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// In the Team Details sheet: always open, no collapsible header.
    var alwaysOpen = false

    @State private var name = ""
    @State private var details: [String: String] = [:]
    @State private var saved: (name: String, details: [String: String])?
    @State private var state: SaveState = .idle
    @State private var loadedFor: UUID?

    private enum SaveState { case idle, saving, saved, failed }
    private static let fields = ["church_name", "contact_name", "contact_email", "contact_phone", "welcome"]

    private var isAdmin: Bool { session.currentTeam?.role == "admin" }
    private var dirty: Bool {
        guard let saved else { return false }
        return name != saved.name || Self.fields.contains { (details[$0] ?? "") != (saved.details[$0] ?? "") }
    }
    /// Example text only guides the first entry.
    private var hasSaved: Bool { Self.fields.contains { !(saved?.details[$0] ?? "").isEmpty } }
    private var summary: String {
        let s = [details["church_name"], details["contact_name"]].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return s.isEmpty ? "Add your organization and contact for invitation emails" : s
    }

    var body: some View {
        Section {
            if open || alwaysOpen, saved != nil {
                Label("These details go in every invitation email: the invitation to join the team, and each set request.",
                      systemImage: "info.circle")
                    .font(.caption).foregroundStyle(.secondary)
                // Organization · Team name, then the contact on one line, then the welcome note.
                rows {
                    box("Organization", text: binding("church_name"), hint: "Grace Community Church")
                    box("Team name", text: Binding(get: { name }, set: { name = $0; state = .idle }), hint: "Grace Worship Team", enabled: isAdmin)
                }
                rows {
                    box("Contact name", text: binding("contact_name"),
                        hint: session.user?.email?.split(separator: "@").first.map(String.init) ?? "")
                    box("Contact phone", text: Binding(get: { details["contact_phone"] ?? "" },
                                                       set: { details["contact_phone"] = MemberEditor.formatPhone($0); state = .idle }),
                        hint: "555.555.5555", keyboard: .phonePad)
                    box("Contact email", text: binding("contact_email"), hint: session.user?.email ?? "", keyboard: .emailAddress)
                }
                box("Welcome message", text: binding("welcome"),
                    hint: "Glad you're joining us! We prepare with StaffList: your sets, charts and lyrics will be waiting for you.",
                    multiline: true)
                HStack(spacing: 12) {
                    Button(state == .saving ? "Saving…" : "Save Details") { Task { await save() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(!dirty || state == .saving)
                    if state == .saved && !dirty { Text("Saved").font(.caption).foregroundStyle(.green) }
                    if state == .failed { Text("Couldn't save. Please try again.").font(.caption).foregroundStyle(.red) }
                }
            }
        } header: {
            if !alwaysOpen { header }
        }
        .task(id: session.currentTeam?.id) { await load() }
    }

    private var header: some View {
            Button {
                withAnimation(.snappy) { open.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.down").rotationEffect(.degrees(open ? 0 : -90))
                    Text("Team Details")
                    Text(summary).textCase(nil).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(open ? "Hides the team details" : "Shows the team details")
    }

    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { details[key] ?? "" }, set: { details[key] = $0; state = .idle })
    }

    /// Side by side on the iPad, stacked on the iPhone.
    @ViewBuilder
    private func rows<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        if sizeClass == .regular {
            HStack(alignment: .top, spacing: 10) { content() }
        } else {
            VStack(spacing: 10) { content() }
        }
    }

    /// A small labeled text box, like the web form's inputs.
    private func box(_ label: String, text: Binding<String>, hint: String,
                     keyboard: UIKeyboardType = .default, enabled: Bool = true, multiline: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Group {
                if multiline {
                    TextField(label, text: text, prompt: hasSaved ? nil : Text(hint), axis: .vertical).lineLimit(2...6)
                } else {
                    TextField(label, text: text, prompt: hasSaved || hint.isEmpty ? nil : Text(hint))
                }
            }
            .font(.subheadline)
            .keyboardType(keyboard)
            .textInputAutocapitalization(keyboard == .emailAddress ? .never : .sentences)
            .autocorrectionDisabled(keyboard != .default)
            .disabled(!enabled)
            .foregroundStyle(enabled ? .primary : .secondary)
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private struct Row: Decodable { let name: String; let details: [String: String]? }

    private func load() async {
        guard let team = session.currentTeam, loadedFor != team.id else { return }
        guard let row: Row = try? await supabase.from("churches").select("name, details").eq("id", value: team.id).single().execute().value else { return }
        var d: [String: String] = [:]
        for k in Self.fields { d[k] = row.details?[k] ?? "" }
        name = row.name
        details = d
        saved = (row.name, d)
        loadedFor = team.id
        state = .idle
        // A brand-new team opens its details so they get filled in.
        if !Self.fields.contains(where: { !(d[$0] ?? "").isEmpty }) { open = true }
    }

    private func save() async {
        guard let team = session.currentTeam, let current = saved else { return }
        state = .saving
        var d: JSONObject = [:]
        for k in Self.fields { d[k] = .string((details[k] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)) }
        var params: JSONObject = [:]
        params["p_church"] = .string(team.id.uuidString.lowercased())
        params["p_name"] = .string(name.trimmingCharacters(in: .whitespaces))
        params["p_details"] = .object(d)
        do {
            try await supabase.rpc("save_team_details", params: params).execute()
            let newName = isAdmin ? name.trimmingCharacters(in: .whitespaces) : current.name
            saved = (newName, details)
            name = newName
            state = .saved
            if newName != team.name { await session.loadTeams() }
        } catch {
            state = .failed
        }
    }
}

/// Team Details from the Team page's title-bar button.
struct TeamDetailsSheet: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form { TeamDetailsSection(alwaysOpen: true) }
                .navigationTitle("Team Details")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
