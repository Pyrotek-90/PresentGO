import SwiftUI

struct SettingsView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        NavigationStack {
            Form {
                if session.teams.count > 1 {
                    Section("Team") {
                        Picker("Current team", selection: Binding(
                            get: { session.currentTeam?.id },
                            set: { session.currentTeamID = $0 }
                        )) {
                            ForEach(session.teams) { Text($0.name).tag(Optional($0.id)) }
                        }
                    }
                } else if let team = session.currentTeam {
                    Section("Team") {
                        LabeledContent("Team", value: team.name)
                        LabeledContent("Plan", value: (team.plan ?? "free").capitalized)
                    }
                }

                Section("Account") {
                    if let email = session.user?.email { LabeledContent("Signed in as", value: email) }
                    Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
                }

                Section {
                    Link("Help & Support", destination: AppConfig.supportURL)
                    Link("Privacy Policy", destination: AppConfig.privacyURL)
                    Link("Manage account and delete account on stafflist.app", destination: URL(string: "https://stafflist.app/settings")!)
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "")
                }
            }
            .navigationTitle("Settings")
        }
    }
}
