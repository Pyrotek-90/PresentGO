import SwiftUI
import Supabase

struct SettingsView: View {
    @Environment(SessionStore.self) private var session
    @AppStorage("appearance") private var appearance = "dark"
    @AppStorage("viewerMode") private var viewerMode = "lyrics"
    @State private var exporting = false
    @State private var exportURL: URL?
    @State private var note: String?
    @AppStorage("libraryLanguage") private var libraryLanguage = "English"
    @State private var languages: [String] = []
    @State private var languageState: String?
    @State private var confirmSignOut = false
    @AppStorage(OfflineStore.enabledKey) private var offlineEnabled = true
    @State private var offlineSaving = false
    @State private var showPlans = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? ""
        let b = info?["CFBundleVersion"] as? String ?? ""
        return b.isEmpty ? v : "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            Form {
                // MARK: Appearance
                Section("Appearance") {
                    Picker(selection: $appearance) {
                        Text("Dark").tag("dark")
                        Text("Light").tag("light")
                        Text("System").tag("system")
                    } label: {
                        Label("Theme", systemImage: appearance == "light" ? "sun.max" : "moon")
                    }
                }

                // MARK: Preferences
                Section {
                    Toggle(isOn: Binding(get: { offlineEnabled }, set: { setOffline($0) })) {
                        PrefLabel(icon: "arrow.down.circle") {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Offline Copies")
                                Text(offlineNote).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Toggle(isOn: Binding(get: { viewerMode == "chords" }, set: { viewerMode = $0 ? "chords" : "lyrics" })) {
                        PrefLabel(icon: "music.note") {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Open songs in Chord Chart")
                                Text("Otherwise the Song Viewer opens in Lyrics.").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    // The answer sits at the trailing edge, in the same column as the toggles.
                    HStack(spacing: 8) {
                        PrefLabel(icon: "character.bubble") {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Song Library language")
                                Text(languageState ?? "Songs in other languages are hidden from the main list.")
                                    .font(.caption).foregroundStyle(languageState == "Couldn't save. Try again." ? .red : .secondary)
                            }
                        }
                        Spacer(minLength: 4)
                        Menu {
                            Picker("Song Library language", selection: Binding(get: { libraryLanguage }, set: { l in Task { await saveLanguage(l) } })) {
                                ForEach(languageOptions, id: \.self) { Text($0).tag($0) }
                            }
                        } label: {
                            HStack(spacing: 3) {
                                Text(libraryLanguage)
                                Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
                            }
                            .foregroundStyle(.secondary)
                        }
                        .fixedSize()
                    }
                    CalendarSyncRows()
                    if !session.teams.isEmpty {
                        // Each team with its color right here; tap to change colors or switch teams.
                        NavigationLink { MyTeamsView() } label: {
                            HStack(alignment: .firstTextBaseline) {
                                PrefLabel(icon: "person.3") { Text("My Teams") }
                                Spacer(minLength: 12)
                                VStack(alignment: .trailing, spacing: 4) {
                                    ForEach(session.teams) { t in
                                        HStack(spacing: 6) {
                                            Text(t.name).lineLimit(1)
                                                .foregroundStyle(t.id == session.currentTeam?.id ? .primary : .secondary)
                                            Circle().fill(session.teamColor(t.id)).frame(width: 12, height: 12)
                                        }
                                        .font(.subheadline)
                                    }
                                }
                            }
                        }
                        .accessibilityLabel("My Teams: " + session.teams.map(\.name).joined(separator: ", "))
                        .accessibilityHint("Change team colors or switch teams")
                    }
                } header: {
                    Text("Preferences")
                }

                // MARK: Library (Admins and Leaders)
                if session.currentTeam?.canEdit ?? false {
                    Section("Library") {
                        NavigationLink { CcliReportView() } label: { Label("CCLI Report", systemImage: "doc.text.magnifyingglass") }
                        Button {
                            Task { await exportSongbook() }
                        } label: {
                            HStack {
                                Label("Export Song Library (PDF)", systemImage: "square.and.arrow.up")
                                if exporting { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(exporting)
                        if let exportURL {
                            ShareLink("Share Songbook PDF", item: exportURL)
                        }
                        if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
                    }
                }

                // MARK: Licensing & Copyright
                Section("Licensing & Copyright") {
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Song lyrics are protected by copyright regardless of the context in which they are used. Displaying lyrics publicly — in a church service, event, or otherwise — requires a valid license.")
                                .foregroundStyle(.secondary)
                            licenseLine("Personal / private use", "Generally permitted without a license.")
                            licenseLine("Churches", "Verify coverage via [CCLI](https://ccli.com). CCLI API integration is a planned premium feature.")
                            licenseLine("Other public or commercial use", "A performance license is required — ASCAP, BMI, or SESAC depending on your region.")
                            licenseLine("Public domain songs", "No license required. Generally applies to works published before 1928.")
                        }
                        .font(.footnote)
                        .padding(.vertical, 4)
                    } label: {
                        Label("Copyright Notice", systemImage: "checkmark.shield")
                    }
                }

                // MARK: Account
                Section("Account") {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Signed in as").font(.caption).foregroundStyle(.secondary)
                            Text(session.user?.email ?? "").lineLimit(1).truncationMode(.middle)
                        }
                        Spacer(minLength: 8)
                        Button("Sign Out") { confirmSignOut = true }
                            .buttonStyle(.bordered).controlSize(.small)
                    }
                    if let team = session.currentTeam {
                        Button { showPlans = true } label: {
                            HStack {
                                Text("Plan").foregroundStyle(.primary)
                                Spacer()
                                Text(planName(team.plan)).foregroundStyle(Theme.accentLight)
                                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                            }
                        }
                    }
                    NavigationLink { DeleteAccountView() } label: { Text("Delete Account").foregroundStyle(.red) }
                }

                // MARK: Footer — links and version on a line or two
                Section {
                } footer: {
                    VStack(spacing: 6) {
                        Text("[Help & Support](https://stafflist.app/support)  ·  [Privacy Policy](https://stafflist.app/privacy)  ·  [Terms of Use](https://stafflist.app/terms)")
                        Text("StaffList \(version)").foregroundStyle(.secondary)
                    }
                    .font(.footnote)
                    .tint(Theme.accentLight)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("Sign out of StaffList?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
            }
            .task { await loadLanguages() }
            .sheet(isPresented: $showPlans) { PlanMatrixView(current: session.currentTeam?.plan ?? "free") }
        }
    }

    // MARK: Offline Copies

    private var offlineNote: String {
        guard offlineEnabled else { return "Turn on to keep the Song Library and upcoming sets on this device." }
        if offlineSaving { return "Saving the Song Library and upcoming sets…" }
        var note = "The Song Library and the upcoming sets are saved for offline mode."
        if let team = session.currentTeam, let date = OfflineStore.savedAt(OfflineStore.songsKey(team.id)) {
            note += " Saved " + date.formatted(.relative(presentation: .named)) + "."
        }
        return note
    }

    private func setOffline(_ on: Bool) {
        offlineEnabled = on
        if on {
            guard let team = session.currentTeam else { return }
            offlineSaving = true
            Task {
                await OfflineStore.saveAll(team: team.id)
                offlineSaving = false
            }
        } else {
            // Off: nothing is kept on the device.
            OfflineStore.clear()
        }
    }

    private func planName(_ plan: String?) -> String {
        switch plan ?? "free" {
        case "pro": return "Pro"
        case "ultimate": return "Ultimate"
        case "solo": return "Solo"
        default: return (plan ?? "Free").capitalized
        }
    }

    private func licenseLine(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("•").foregroundStyle(Theme.accentLight)
            Text(.init("**\(title)** — \(detail)")).foregroundStyle(.secondary)
        }
    }

    // MARK: Song Library language (saved to the account, so the web uses it too)

    private var languageOptions: [String] { Array(Set(languages + [libraryLanguage])).sorted() }

    private struct LangRow: Decodable { let language: String? }

    private func loadLanguages() async {
        if let saved = session.user?.userMetadata["library_language"]?.stringValue, !saved.isEmpty { libraryLanguage = saved }
        guard let team = session.currentTeam else { return }
        if let rows: [LangRow] = try? await supabase.from("songs").select("language:metadata->>language")
            .eq("church_id", value: team.id).execute().value {
            languages = Array(Set(rows.map { $0.language ?? "" }.filter { !$0.isEmpty } + ["English"]))
        }
    }

    private func saveLanguage(_ l: String) async {
        let before = libraryLanguage
        libraryLanguage = l
        languageState = "Saving…"
        do {
            try await supabase.auth.update(user: UserAttributes(data: ["library_language": .string(l)]))
            languageState = "Saved."
            NotificationCenter.default.post(name: .songsChanged, object: nil)
        } catch {
            libraryLanguage = before
            languageState = "Couldn't save. Try again."
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

/// Every team I'm on, my role, and the color its sets show in on the Sets page (only I see my
/// colors; saved to my account, so the web uses them too). Tap a team to make it the current one.
struct MyTeamsView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        List {
            Section {
                ForEach(session.teams) { t in
                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            session.currentTeamID = t.id
                        } label: {
                            HStack(spacing: 12) {
                                Circle().fill(session.teamColor(t.id)).frame(width: 14, height: 14)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(t.name).foregroundStyle(.primary)
                                    Text(t.role == "admin" ? "Admin" : t.canEdit ? "Leader" : "Member")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if t.id == session.currentTeam?.id {
                                    Text("Showing").font(.caption.weight(.semibold)).foregroundStyle(Theme.accentLight)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        swatches(t)
                    }
                    .padding(.vertical, 4)
                }
            } footer: {
                Text("Sets from each team show in its color on the Sets calendar and in Upcoming. Tap a color to change it; only you see your colors. Tap a team to manage its sets.")
            }
        }
        .navigationTitle("My Teams")
        .squaredBackButton()
    }

    private func swatches(_ t: Team) -> some View {
        let current = session.teamColorHex[t.id]?.lowercased()
        return HStack(spacing: 10) {
            ForEach(SessionStore.teamColors, id: \.self) { hex in
                Button {
                    Task { await session.setTeamColor(t.id, hex) }
                } label: {
                    Circle().fill(Color(hex: hex) ?? .gray)
                        .frame(width: 26, height: 26)
                        .overlay {
                            if current == hex { Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.black.opacity(0.7)) }
                        }
                        .overlay(Circle().stroke(Color.white.opacity(current == hex ? 0.8 : 0.15), lineWidth: current == hex ? 2 : 1))
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Color \(SessionStore.teamColors.firstIndex(of: hex).map { $0 + 1 } ?? 0) for \(t.name)")
                .accessibilityAddTraits(current == hex ? .isSelected : [])
            }
        }
        .padding(.leading, 26)
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

/// Calendar sync, like the web (src/components/settings/CalendarSync.jsx): a switch, and when it's
/// on the private subscription link with Copy, Add to Apple Calendar, Add to Google Calendar and
/// Reset Link, plus one calendar per team when there's more than one. Shown inline in Settings.
struct CalendarSyncRows: View {
    @Environment(SessionStore.self) private var session
    @State private var token: String?
    @State private var loading = true
    @State private var busy = false
    @State private var error: String?
    @State private var copied = false
    @State private var confirmReset = false

    private struct Row: Codable { let token: String }

    private var pro: Bool { session.currentTeam?.isPaid ?? false }
    private var httpsLink: String { token.map { "https://stafflist.app/api/calendar/\($0).ics" } ?? "" }
    private func webcal(_ https: String) -> URL? { URL(string: https.replacingOccurrences(of: "https://", with: "webcal://")) }
    private func google(_ https: String) -> URL? {
        let cid = (webcal(https)?.absoluteString ?? "").addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
        return URL(string: "https://calendar.google.com/calendar/r?cid=\(cid)")
    }

    var body: some View {
        Toggle(isOn: Binding(get: { token != nil }, set: { on in Task { await set(on) } })) {
            PrefLabel(icon: "calendar.badge.plus") {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Calendar Sync")
                    Text(pro || token != nil
                         ? "Show your sets (name, date, time, location) in Apple or Google Calendar."
                         : "Show your sets in Apple or Google Calendar. Part of Pro.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .disabled(loading || busy || (!pro && token == nil))
        .task { await load() }

        if let error { Text(error).font(.caption).foregroundStyle(.red) }

        if token != nil && !pro {
            Text("Calendar sync is part of Pro. Your calendar stops updating while your team isn't on Pro.")
                .font(.caption).foregroundStyle(.orange)
        }
        if token != nil && pro {
            VStack(alignment: .leading, spacing: 10) {
                Text("Your private subscription link").font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Text(httpsLink)
                        .font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                        .textSelection(.enabled)
                        .padding(.horizontal, 8).padding(.vertical, 6)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
                    Button {
                        UIPasteboard.general.string = httpsLink
                        copied = true
                        Task { try? await Task.sleep(for: .seconds(1.8)); copied = false }
                    } label: {
                        Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc").font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.bordered).controlSize(.small)
                }
                HStack(spacing: 8) {
                    if let url = webcal(httpsLink) {
                        Link(destination: url) { Label("Add to Apple Calendar", systemImage: "calendar") }
                            .buttonStyle(.borderedProminent).controlSize(.small)
                    }
                    if let url = google(httpsLink) {
                        Link(destination: url) { Label("Google Calendar", systemImage: "arrow.up.right.square") }
                            .buttonStyle(.bordered).controlSize(.small)
                    }
                    Spacer(minLength: 0)
                    Button { confirmReset = true } label: { Label("Reset Link", systemImage: "arrow.clockwise").font(.caption) }
                        .buttonStyle(.borderless).foregroundStyle(.secondary)
                }
                .font(.caption.weight(.semibold))
                if session.teams.count > 1 {
                    Text("Or one calendar per team, so each shows in its own color:").font(.caption).foregroundStyle(.secondary)
                    ForEach(session.teams) { t in
                        let link = "\(httpsLink)?team=\(t.id.uuidString.lowercased())"
                        HStack(spacing: 10) {
                            Circle().fill(session.teamColor(t.id)).frame(width: 10, height: 10)
                            Text(t.name).font(.subheadline.weight(.medium)).lineLimit(1)
                            Spacer()
                            if let url = webcal(link) { Link("Apple", destination: url) }
                            if let url = google(link) { Link("Google", destination: url) }
                        }
                        .font(.caption)
                        .buttonStyle(.borderless)
                    }
                }
            }
            .padding(.vertical, 4)
            .confirmationDialog("Reset the calendar link?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Reset Link", role: .destructive) { Task { await reset() } }
            } message: {
                Text("The old link stops working. Calendars subscribed with it need the new link.")
            }
        }
    }

    private func load() async {
        defer { loading = false }
        guard let user = session.user else { return }
        let rows: [Row] = (try? await supabase.from("calendar_tokens").select("token").eq("user_id", value: user.id).execute().value) ?? []
        token = rows.first?.token
    }

    private func set(_ on: Bool) async {
        guard let user = session.user else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            if on {
                let row: Row = try await supabase.from("calendar_tokens").insert(["user_id": user.id.uuidString.lowercased()])
                    .select("token").single().execute().value
                token = row.token
            } else {
                try await supabase.from("calendar_tokens").delete().eq("user_id", value: user.id).execute()
                token = nil
            }
        } catch {
            self.error = on ? "Couldn't turn on calendar sync." : "Couldn't turn off calendar sync."
        }
    }

    private func reset() async {
        guard let user = session.user else { return }
        busy = true
        defer { busy = false }
        let fresh = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "").lowercased()
        do {
            let row: Row = try await supabase.from("calendar_tokens").update(["token": fresh])
                .eq("user_id", value: user.id).select("token").single().execute().value
            token = row.token
        } catch {
            self.error = "Couldn't reset the link."
        }
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


/// A Preferences row's title and description. iPad: with its icon. iPhone: no icon, so the
/// description has the full width and fits in two lines.
struct PrefLabel<Content: View>: View {
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        if UIDevice.current.userInterfaceIdiom == .phone {
            content.lineLimit(2)
        } else {
            Label { content } icon: { Image(systemName: icon) }
        }
    }
}
