import Foundation

/// Where the app's services live. The Supabase URL and anon key are the same public values the
/// web app uses (Vercel → Settings → Environment Variables → VITE_SUPABASE_URL and
/// VITE_SUPABASE_ANON_KEY). The anon key is safe to ship in an app: the database's row-level
/// security rules decide what each signed-in person can read and change.
enum AppConfig {
    static let supabaseURL = URL(string: "https://hrdapcfcyrewafbthlxu.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyZGFwY2ZjeXJld2FmYnRobHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjA2NjYsImV4cCI6MjA4OTUzNjY2Nn0.toOv8Z8-J1A_pLdl3cqOjSYI3nK8sAg-i1zoVbwdEdU"

    /// The StaffList API shared with the web app (api/v1.js in the repo).
    static let apiBaseURL = URL(string: "https://stafflist.app/api/v1/")!

    static let supportURL = URL(string: "https://stafflist.app/support")!
    static let privacyURL = URL(string: "https://stafflist.app/privacy")!
}
