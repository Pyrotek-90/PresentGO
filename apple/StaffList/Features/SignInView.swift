import SwiftUI
import AuthenticationServices

/// Sign-in, laid out like the web's (src/pages/Auth.jsx): the wordmark, a card with Sign In /
/// Create Account tabs, Continue with Google and Apple, then email and password, and the footer.
struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @State private var tab = Tab.signIn
    @State private var email = ""
    @State private var password = ""
    @State private var working = false
    @State private var confirmSent = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }
    private enum Tab { case signIn, register }

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // The StaffList wordmark: the crest as the S, "taffList", "To the Chief Musician".
                Image("Wordmark")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 84)
                    .foregroundStyle(Color(white: 0.96))
                    .accessibilityLabel("StaffList, To the Chief Musician")
                    .padding(.top, 48)

                card

                VStack(spacing: 8) {
                    Text(tab == .signIn ? "StaffList · Chord Charts, Set Lists & Presentation"
                                        : "By creating an account, you agree to the Terms of Use and Privacy Policy.")
                        .multilineTextAlignment(.center)
                    HStack(spacing: 16) {
                        Link("Privacy Policy", destination: URL(string: "https://stafflist.app/privacy")!)
                        Link("Terms of Use", destination: URL(string: "https://stafflist.app/terms")!)
                        Link("Support", destination: URL(string: "https://stafflist.app/support")!)
                    }
                    .tint(Theme.muted)
                }
                .font(.caption)
                .foregroundStyle(Theme.muted)
            }
            .frame(maxWidth: 400)
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .frame(maxWidth: .infinity)
        }
        .background(Color(white: 0.07).ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .preferredColorScheme(.dark)
    }

    private var card: some View {
        VStack(spacing: 18) {
            tabs

            Button {
                Task { await session.signInWithGoogle() }
            } label: {
                HStack(spacing: 10) {
                    GoogleMark()
                    Text("Continue with Google").font(.system(size: 16, weight: .medium))
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .foregroundStyle(Color(white: 0.12))
                .background(.white, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            SignInWithAppleButton(.continue) { request in
                session.prepareAppleRequest(request)
            } onCompletion: { result in
                Task { await session.completeApple(result) }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 44)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))

            HStack(spacing: 12) {
                Rectangle().fill(Theme.border).frame(height: 1)
                Text("or use email").font(.caption).foregroundStyle(Theme.muted).fixedSize()
                Rectangle().fill(Theme.border).frame(height: 1)
            }

            if confirmSent {
                VStack(spacing: 6) {
                    Text("Check your email!").font(.body.weight(.medium)).foregroundStyle(.green)
                    Text("We sent a confirmation link to **\(email)**. Click it to activate your account.")
                        .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .padding(.vertical, 12)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    field("Email") {
                        TextField("", text: $email, prompt: Text("you@example.com").foregroundColor(Color(white: 0.4)))
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focus, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focus = .password }
                    } focused: { focus == .email }
                    field("Password") {
                        SecureField("", text: $password, prompt: Text("••••••••").foregroundColor(Color(white: 0.4)))
                            .textContentType(tab == .signIn ? .password : .newPassword)
                            .focused($focus, equals: .password)
                            .submitLabel(.go)
                            .onSubmit(submit)
                    } focused: { focus == .password }

                    if let message = session.errorMessage {
                        Text(message).font(.footnote).foregroundStyle(.red)
                    }

                    Button(action: submit) {
                        Text(working ? "Please wait…" : tab == .signIn ? "Sign In" : "Create Account")
                            .font(.system(size: 16, weight: .medium))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(.white)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .disabled(working || email.isEmpty || password.count < 6)
                    .opacity(working || email.isEmpty || password.count < 6 ? 0.6 : 1)
                }
            }
        }
        .padding(16)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border))
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            ForEach([(Tab.signIn, "Sign In"), (Tab.register, "Create Account")], id: \.1) { t, label in
                Button {
                    tab = t
                    confirmSent = false
                    session.errorMessage = nil
                } label: {
                    Text(label).font(.subheadline)
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .foregroundStyle(tab == t ? .white : Theme.muted)
                        .background(tab == t ? Theme.accent : Theme.panel)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == t ? .isSelected : [])
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
    }

    /// A labeled input like the web's: dark box, border turning teal while typing.
    private func field<F: View>(_ label: String, @ViewBuilder _ input: () -> F, focused: () -> Bool) -> some View {
        let on = focused()
        return VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.subheadline).foregroundStyle(Theme.muted)
            input()
                .font(.body)
                .padding(.horizontal, 12).frame(height: 44)
                .background(Color(white: 0.08), in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? Theme.accent : Theme.border, lineWidth: on ? 2 : 1))
        }
    }

    private func submit() {
        guard !email.isEmpty, password.count >= 6, !working else { return }
        working = true
        Task {
            if tab == .signIn {
                await session.signIn(email: email, password: password)
            } else {
                confirmSent = await session.signUp(email: email, password: password)
            }
            working = false
        }
    }
}

/// Google's "G", drawn with its four brand colors (no image asset needed).
private struct GoogleMark: View {
    var body: some View {
        ZStack {
            Circle().trim(from: 0.0, to: 0.25).stroke(Color(red: 0.92, green: 0.26, blue: 0.21), lineWidth: 3.5)
                .rotationEffect(.degrees(-135))
            Circle().trim(from: 0.25, to: 0.5).stroke(Color(red: 0.98, green: 0.74, blue: 0.02), lineWidth: 3.5)
                .rotationEffect(.degrees(-135))
            Circle().trim(from: 0.5, to: 0.75).stroke(Color(red: 0.20, green: 0.66, blue: 0.33), lineWidth: 3.5)
                .rotationEffect(.degrees(-135))
            Circle().trim(from: 0.75, to: 0.93).stroke(Color(red: 0.26, green: 0.52, blue: 0.96), lineWidth: 3.5)
                .rotationEffect(.degrees(-135))
            Rectangle().fill(Color(red: 0.26, green: 0.52, blue: 0.96)).frame(width: 9, height: 3.5).offset(x: 4.5)
        }
        .frame(width: 18, height: 18)
    }
}
