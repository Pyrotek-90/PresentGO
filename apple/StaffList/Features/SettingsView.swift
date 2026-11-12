import SwiftUI
import Supabase

struct SettingsView: View {
    @Environment(SessionStore.self) private var session
    @State private var exporting = false
    @State private var exportURL: URL?
    @State private var note: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Team") {
                    if session.teams.count > 1 {
                        Picker("Current team", selection: Binding(
                            get: { session.currentTeam?.id },
                            set: { session.currentTeamID = $0 }
                        )) {
                            ForEach(session.teams) { Text($0.name).tag(Optional($0.id)) }
                        }
                    } else if let team = session.currentTeam {
                        LabeledContent("Team", value: team.name)
                    }
                    if let team = session.currentTeam {
                        LabeledContent("Plan", value: (team.plan ?? "free").capitalized)
                        LabeledContent("Your role", value: (team.role ?? "member").capitalized)
                        if team.role == "admin" {
                            NavigationLink("Team Details") { TeamDetailsView(team: team) }
                        }
                    }
                }

                Section {
                    NavigationLink("Calendar Subscription") { CalendarSyncView() }
                    NavigationLink("Offline Copies") { OfflineSettingsView() }
                } header: {
                    Text("Sync")
                }

                if session.currentTeam?.canEdit ?? false {
                    Section {
                        NavigationLink("CCLI Report") { CcliReportView() }
                        Button {
                            Task { await exportSongbook() }
                        } label: {
                            HStack {
                                Text("Export Song Library (PDF)")
                                if exporting { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(exporting)
                        if let exportURL {
                            ShareLink("Share Songbook PDF", item: exportURL)
                        }
                        if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                    } header: {
                        Text("Reports")
                    }
                }

                Section("Account") {
                    if let email = session.user?.email { LabeledContent("Signed in as", value: email) }
                    Button("Sign Out") { Task { await session.signOut() } }
                    NavigationLink("Delete Account") { DeleteAccountView() }
                        .foregroundStyle(.red)
                }

                Section {
                    Link("Help & Support", destination: AppConfig.supportURL)
                    Link("Privacy Policy", destination: AppConfig.privacyURL)
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func exportSongbook() async {
        guard let team = session.currentTeam else { return }
        exporting = true
        note = nil
        defer { exporting = false }
        do {
            let data = try await StaffListAPI.shared.postData("export-songbook", ["church_id": team.id.uuidString.lowercased()])
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(team.name) Songbook.pdf")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            note = AITools.message(for: error)
        }
    }
}

// MARK: - Team details (Admins)

struct TeamDetailsView: View {
    let team: Team
    @Environment(SessionStore.self) private var session
    @State private var name = ""
    @State private var details: [String: String] = [:]
    @State private var saved = false
    @State private var error: String?

    private let fields: [(key: String, label: String)] = [
        ("church_name", "Church or organization"), ("location", "Location"),
        ("contact_name", "Contact name"), ("contact_email", "Contact email"),
        ("contact_phone", "Contact phone"), ("welcome", "Welcome message"),
    ]

    var body: some View {
        Form {
            Section("Team name") { TextField("Team name", text: $name) }
            Section {
                ForEach(fields, id: \.key) { f in
                    TextField(f.label, text: Binding(get: { details[f.key] ?? "" }, set: { details[f.key] = $0 }), axis: .vertical)
                }
            } footer: {
                Text("Shown in the invitations people receive.")
            }
            if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
        }
        .navigationTitle("Team Details")
        .toolbar {
            Button(saved ? "Saved" : "Save") { Task { await save() } }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .task { await load() }
    }

    private struct Row: Decodable { let name: String; let details: [String: String]? }

    private func load() async {
        name = team.name
        if let row: Row = try? await supabase.from("churches").select("name, details").eq("id", value: team.id).single().execute().value {
            name = row.name
            details = row.details ?? [:]
        }
    }

    private func save() async {
        var d: JSONObject = [:]
        for (k, v) in details { d[k] = .string(v) }
        var params: JSONObject = [:]
        params["p_church"] = .string(team.id.uuidString.lowercased())
        params["p_name"] = .string(name.trimmingCharacters(in: .whitespaces))
        params["p_details"] = .object(d)
        do {
            try await supabase.rpc("save_team_details", params: params).execute()
            saved = true
            await session.loadTeams()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Calendar subscription

struct CalendarSyncView: View {
    @Environment(SessionStore.self) private var session
    @State private var token: String?
    @State private var loading = true
    @State private var error: String?

    private struct Row: Codable { let token: String }

    private var httpsURL: URL? { token.flatMap { URL(string: "https://stafflist.app/api/calendar/\($0).ics") } }
    private var webcalURL: URL? { token.flatMap { URL(string: "webcal://stafflist.app/api/calendar/\($0).ics") } }

    var body: some View {
        Form {
            Section {
                if loading { ProgressView() }
                else if let webcalURL, let httpsURL {
                    Link(destination: webcalURL) { Label("Add to Calendar", systemImage: "calendar.badge.plus") }
                    ShareLink(item: httpsURL) { Label("Share Link", systemImage: "square.and.arrow.up") }
                    Button("Turn Off", role: .destructive) { Task { await turnOff() } }
                } else {
                    Button("Turn On Calendar Subscription") { Task { await turnOn() } }
                }
            } footer: {
                Text("Your sets — and the ones you're scheduled on — appear in Calendar on your iPhone, iPad or Mac and stay up to date.")
            }
            if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
        }
        .navigationTitle("Calendar Subscription")
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        guard let user = session.user else { return }
        let rows: [Row] = (try? await supabase.from("calendar_tokens").select("token").eq("user_id", value: user.id).execute().value) ?? []
        token = rows.first?.token
    }

    private func turnOn() async {
        guard let user = session.user else { return }
        do {
            let row: Row = try await supabase.from("calendar_tokens").insert(["user_id": user.id.uuidString.lowercased()]).select("token").single().execute().value
            token = row.token
        } catch { self.error = error.localizedDescription }
    }

    private func turnOff() async {
        guard let user = session.user else { return }
        do {
            try await supabase.from("calendar_tokens").delete().eq("user_id", value: user.id).execute()
            token = nil
        } catch { self.error = error.localizedDescription }
    }
}

// MARK: - Offline copies

struct OfflineSettingsView: View {
    @Environment(SessionStore.self) private var session
    @State private var cleared = false

    var body: some View {
        Form {
            Section {
                if let team = session.currentTeam {
                    LabeledContent("Song library", value: savedText(OfflineStore.songsKey(team.id)))
                    LabeledContent("Sets", value: savedText(OfflineStore.setsKey(team.id)))
                }
            } footer: {
                Text("Your library and the next few upcoming sets (slides and charts) are saved on this device whenever you open them, so Present and Charts work without internet.")
            }
            Section {
                Button(cleared ? "Cleared" : "Clear Offline Copies", role: .destructive) {
                    OfflineStore.clear()
                    cleared = true
                }
            }
        }
        .navigationTitle("Offline Copies")
    }

    private func savedText(_ key: String) -> String {
        guard let date = OfflineStore.savedAt(key) else { return "Not saved yet" }
        return "Saved " + date.formatted(.relative(presentation: .named))
    }
}

// MARK: - CCLI report

struct CcliReportView: View {
    @Environment(SessionStore.self) private var session
    @AppStorage("ccliChurchName") private var church = ""
    @AppStorage("ccliLicenseNumber") private var license = ""
    @State private var from = Calendar.current.date(byAdding: .month, value: -6, to: .now) ?? .now
    @State private var to = Date.now
    @State private var report: Report?
    @State private var loading = false
    @State private var error: String?

    struct Report: Decodable {
        let rows: [Row]
        let sets: Int
        let total_uses: Int
        let csv: String
        struct Row: Decodable, Hashable {
            let title: String
            let ccli: String
            let writers: String
            let public_domain: Bool
            let missing: Bool
            let uses: Int
            let dates: [String]
        }
    }

    private struct Request: Encodable { let church_id: String; let from: String; let to: String; let church: String; let license: String }

    var body: some View {
        Form {
            Section {
                TextField("Church name", text: $church)
                TextField("CCLI License #", text: $license).keyboardType(.numberPad)
                DatePicker("From", selection: $from, displayedComponents: .date)
                DatePicker("To", selection: $to, displayedComponents: .date)
            }
            if loading { ProgressView() }
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            if let report { results(report) }
        }
        .navigationTitle("CCLI Report")
        .task(id: "\(from)\(to)") { await load() }
    }

    @ViewBuilder private func results(_ report: Report) -> some View {
        Section {
            ForEach(report.rows, id: \.self) { r in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.title).font(.body.weight(.medium))
                        Text(r.public_domain ? "Public domain" : r.ccli.isEmpty ? "Missing CCLI #" : "CCLI #\(r.ccli)")
                            .font(.caption)
                            .foregroundStyle(r.ccli.isEmpty && !r.public_domain ? Color.orange : Color.secondary)
                    }
                    Spacer()
                    Text("\(r.uses)×").monospacedDigit().bold()
                }
            }
        } header: {
            Text("\(report.rows.count) songs · \(report.total_uses) uses in \(report.sets) sets")
        }
        Section {
            if let file = csvFile(report.csv) {
                ShareLink("Share CSV", item: file)
            }
            Button("Copy CCLI Numbers") {
                UIPasteboard.general.string = report.rows.filter { !$0.ccli.isEmpty }.map { "\($0.ccli)\t\($0.uses)\t\($0.title)" }.joined(separator: "\n")
            }
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { return }
        loading = true
        defer { loading = false }
        let f = ServiceSet.dayFormatter
        do {
            report = try await StaffListAPI.shared.post("reports/ccli",
                Request(church_id: team.id.uuidString.lowercased(), from: f.string(from: from), to: f.string(from: to), church: church, license: license),
                as: Report.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func csvFile(_ csv: String) -> URL? {
        let f = ServiceSet.dayFormatter
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("CCLI-report-\(f.string(from: from))-to-\(f.string(from: to)).csv")
        return (try? csv.write(to: url, atomically: true, encoding: .utf8)) != nil ? url : nil
    }
}

// MARK: - Delete account (required by the App Store for apps with sign-up)

struct DeleteAccountView: View {
    @Environment(SessionStore.self) private var session
    @State private var preview: Preview?
    @State private var word = ""
    @State private var deleting = false
    @State private var error: String?

    struct Preview: Decodable {
        let teams: [TeamAction]?
        let files: [String]?
        struct TeamAction: Decodable, Hashable {
            let name: String?
            let action: String?
            let heir: String?
        }
    }

    var body: some View {
        Form {
            Section {
                Text("This permanently deletes your StaffList account and sign-in.")
            }
            if let teams = preview?.teams, !teams.isEmpty {
                Section("What happens to your teams") {
                    ForEach(teams, id: \.self) { t in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.name ?? "Team").font(.body.weight(.medium))
                            Text(describe(t)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section {
                TextField("Type DELETE to confirm", text: $word)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                Button(role: .destructive) {
                    Task { await delete() }
                } label: {
                    HStack { Text("Delete My Account"); if deleting { Spacer(); ProgressView() } }
                }
                .disabled(word.trimmingCharacters(in: .whitespaces).uppercased() != "DELETE" || deleting || preview == nil)
            }
            if let error { Section { Text(error).foregroundStyle(.red).font(.footnote) } }
        }
        .navigationTitle("Delete Account")
        .task {
            do { preview = try await supabase.rpc("account_deletion_preview").execute().value }
            catch { self.error = "Couldn't check your teams. \(error.localizedDescription)" }
        }
    }

    private func describe(_ t: Preview.TeamAction) -> String {
        switch t.action {
        case "delete": return "Only you are on this team, so it's deleted with its songs, sets, files and roster."
        case "handover": return "\(t.heir ?? "Another admin") becomes the Admin. What you added stays with the team."
        default: return "You leave this team. What you added stays with the team."
        }
    }

    private func delete() async {
        deleting = true
        defer { deleting = false }
        let files = preview?.files ?? []
        var i = 0
        while i < files.count {
            _ = try? await supabase.storage.from("media").remove(paths: Array(files[i..<min(i + 100, files.count)]))
            i += 100
        }
        do {
            try await supabase.rpc("delete_my_account", params: ["p_confirm": AnyJSON.string("DELETE")]).execute()
            OfflineStore.clear()
            await session.signOut()
        } catch {
            self.error = "Your account couldn't be deleted. Please try again, or contact us from Help & Support."
        }
    }
}
