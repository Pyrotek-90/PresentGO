import Foundation
import Observation
import Supabase
import AuthenticationServices
import CryptoKit

/// Who is signed in and which team they're looking at. Shared with every screen through the
/// SwiftUI environment.
@MainActor
@Observable
final class SessionStore {
    enum Phase { case loading, signedOut, signedIn }

    private(set) var phase: Phase = .loading
    private(set) var user: User?
    private(set) var teams: [Team] = []
    var currentTeamID: UUID? {
        didSet { UserDefaults.standard.set(currentTeamID?.uuidString, forKey: "stafflist.team") }
    }
    var errorMessage: String?

    var currentTeam: Team? {
        teams.first { $0.id == currentTeamID } ?? teams.first { $0.canEdit } ?? teams.first
    }

    private var currentNonce: String?

    init() {
        if let saved = UserDefaults.standard.string(forKey: "stafflist.team") {
            currentTeamID = UUID(uuidString: saved)
        }
    }

    /// Follows Supabase's sign-in state for the life of the app.
    func observeAuth() async {
        for await (event, session) in supabase.auth.authStateChanges {
            switch event {
            case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                if let session {
                    let isNew = user?.id != session.user.id
                    user = session.user
                    phase = .signedIn
                    if isNew { await loadTeams() }
                } else {
                    signedOutState()
                }
            case .signedOut:
                signedOutState()
            default:
                break
            }
        }
    }

    private func signedOutState() {
        user = nil
        teams = []
        phase = .signedOut
    }

    func loadTeams() async {
        do {
            _ = try? await supabase.rpc("join_my_teams").execute()
            teams = try await supabase.rpc("my_churches").execute().value
        } catch {
            errorMessage = "Couldn't load your teams. \(error.localizedDescription)"
        }
    }

    // MARK: - Email and password

    func signIn(email: String, password: String) async {
        errorMessage = nil
        do {
            try await supabase.auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } catch {
            errorMessage = "That email and password didn't match. Try again or reset your password on stafflist.app."
        }
    }

    func signOut() async {
        try? await supabase.auth.signOut()
    }

    // MARK: - Google

    /// Signs in with Google through Supabase in Apple's secure sign-in sheet
    /// (ASWebAuthenticationSession), using the same Google setup as the web app.
    /// Supabase must list stafflist://login-callback under Auth → URL Configuration.
    func signInWithGoogle() async {
        errorMessage = nil
        do {
            try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: AppConfig.authCallbackURL,
                queryParams: [(name: "prompt", value: "select_account")],
                configure: { session in session.prefersEphemeralWebBrowserSession = false }
            )
        } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
            return
        } catch {
            errorMessage = "Google sign-in didn't finish. \(error.localizedDescription)"
        }
    }

    // MARK: - Sign in with Apple

    /// Call from SignInWithAppleButton's onRequest.
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Call from SignInWithAppleButton's onCompletion.
    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        errorMessage = nil
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            errorMessage = error.localizedDescription
        case .success(let auth):
            guard
                let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8),
                let nonce = currentNonce
            else {
                errorMessage = "Sign in with Apple didn't return a token. Try again."
                return
            }
            do {
                try await supabase.auth.signInWithIdToken(
                    credentials: .init(provider: .apple, idToken: idToken, nonce: nonce)
                )
            } catch {
                errorMessage = "Sign in with Apple failed. \(error.localizedDescription)"
            }
        }
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
