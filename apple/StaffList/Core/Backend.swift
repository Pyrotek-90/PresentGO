import Foundation
import Supabase

/// The one Supabase client for the app: sign-in, and plain reads/writes of songs, sets and team
/// data (protected by the database's row-level security, exactly like the web app).
let supabase = SupabaseClient(
    supabaseURL: AppConfig.supabaseURL,
    supabaseKey: AppConfig.supabaseAnonKey
)

/// The StaffList API (/api/v1) for the heavy lifting the web app also uses: reading charts,
/// building slides, transposing, AI tools, invites and exports.
struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

actor StaffListAPI {
    static let shared = StaffListAPI()

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        return URLSession(configuration: config)
    }()

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    /// POST JSON to a route such as "songs/transpose" and decode the reply.
    func post<Body: Encodable, Reply: Decodable>(_ route: String, _ body: Body, as: Reply.Type = Reply.self) async throws -> Reply {
        var request = try await makeRequest(route)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await send(request)
    }

    /// Upload a file (for example a PDF chord chart) as the request body.
    func upload<Reply: Decodable>(_ route: String, data: Data, query: [String: String] = [:], as: Reply.Type = Reply.self) async throws -> Reply {
        var request = try await makeRequest(route, query: query)
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        return try await send(request)
    }

    private func makeRequest(_ route: String, query: [String: String] = [:]) async throws -> URLRequest {
        var components = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent(route), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        // The current access token; supabase-swift refreshes it when needed.
        let token = try await supabase.auth.session.accessToken
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func send<Reply: Decodable>(_ request: URLRequest) async throws -> Reply {
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? decoder.decode([String: String].self, from: data))?["error"] ?? "Something went wrong. Try again."
            throw APIError(status: status, message: message)
        }
        return try decoder.decode(Reply.self, from: data)
    }
}
