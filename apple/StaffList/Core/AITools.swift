import Foundation

/// The Pro AI tools, all run by the StaffList API (the same endpoints the web app uses).
enum AITools {
    struct DetailsRequest: Encodable { let title: String; let artist: String }
    struct DetailsReply: Decodable { let bpm: Int?; let key: String?; let songwriters: String? }

    struct LyricsRequest: Encodable { let lyrics: String }
    struct CleanupReply: Decodable { let cleaned: String }
    struct TranslateReply: Decodable { let language: String?; let text: String? }

    struct NoteRequest: Encodable { let title: String; let artist: String; let lyrics: String }
    struct NoteReply: Decodable {
        let summary: String
        let reflection: String
        let verses: [Verse]
        struct Verse: Codable { let reference: String; let text: String }
    }

    /// Key, tempo and writers for a song (song-details).
    static func lookUp(title: String, artist: String) async throws -> DetailsReply {
        try await StaffListAPI.shared.post("song-details", DetailsRequest(title: title, artist: artist), as: DetailsReply.self)
    }

    /// Smart Cleanup: tidy pasted lyrics into sections (cleanup-lyrics).
    static func cleanUp(_ lyrics: String) async throws -> String {
        try await StaffListAPI.shared.post("cleanup-lyrics", LyricsRequest(lyrics: lyrics), as: CleanupReply.self).cleaned
    }

    /// Line-by-line English translation (translate-lyrics).
    static func translate(_ lyrics: String) async throws -> TranslateReply {
        try await StaffListAPI.shared.post("translate-lyrics", LyricsRequest(lyrics: lyrics), as: TranslateReply.self)
    }

    /// A Worship Leader Note for a song (worship-note).
    static func worshipNote(title: String, artist: String, lyrics: String) async throws -> NoteReply {
        try await StaffListAPI.shared.post("worship-note", NoteRequest(title: title, artist: artist, lyrics: lyrics), as: NoteReply.self)
    }

    static let upgradeMessage = "This is part of Pro. Upgrade your team at stafflist.app → Settings → Subscription Plans."

    static func message(for error: Error) -> String {
        if let e = error as? APIError, e.status == 402 || e.status == 403 { return upgradeMessage }
        return error.localizedDescription
    }
}
