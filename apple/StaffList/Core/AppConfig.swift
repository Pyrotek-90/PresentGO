import Foundation

/// Where the app's services live. The Supabase URL and anon key are the same public values the
/// web app uses (Vercel → Settings → Environment Variables → VITE_SUPABASE_URL and
/// VITE_SUPABASE_ANON_KEY). The anon key is safe to ship in an app: the database's row-level
/// security rules decide what each signed-in person can read and change.
enum AppConfig {
    static let supabaseURL = URL(string: "https://YOUR-PROJECT.supabase.co")!
    static let supabaseAnonKey = "YOUR-SUPABASE-ANON-KEY"

    /// The StaffList API shared with the web app (api/v1.js in the repo).
    static let apiBaseURL = URL(string: "https://stafflist.app/api/v1/")!

    static let supportURL = URL(string: "https://stafflist.app/support")!
    static let privacyURL = URL(string: "https://stafflist.app/privacy")!
}
