import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @State private var email = ""
    @State private var password = ""
    @State private var working = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 6) {
                    Text("StaffList")
                        .font(.system(size: 44, weight: .bold, design: .serif))
                    Text("To the Chief Musician")
                        .font(.subheadline.italic())
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 60)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(signIn)
                }
                .textFieldStyle(.roundedBorder)

                Button(action: signIn) {
                    Group {
                        if working { ProgressView() } else { Text("Sign In").bold() }
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(email.isEmpty || password.isEmpty || working)

                HStack {
                    Rectangle().frame(height: 1).foregroundStyle(.quaternary)
                    Text("or").font(.footnote).foregroundStyle(.secondary)
                    Rectangle().frame(height: 1).foregroundStyle(.quaternary)
                }

                SignInWithAppleButton(.signIn) { request in
                    session.prepareAppleRequest(request)
                } onCompletion: { result in
                    Task { await session.completeApple(result) }
                }
                .signInWithAppleButtonStyle(.white)
                .frame(height: 48)

                if let message = session.errorMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                Link("New to StaffList? Create an account at stafflist.app", destination: URL(string: "https://stafflist.app/auth?signup=1")!)
                    .font(.footnote)
            }
            .frame(maxWidth: 420)
            .padding(24)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func signIn() {
        guard !email.isEmpty, !password.isEmpty else { return }
        working = true
        Task {
            await session.signIn(email: email, password: password)
            working = false
        }
    }
}
