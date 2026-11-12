import Foundation

// Records as they are stored in Supabase (see supabase/schema.sql and supabase/migrations).

struct Team: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let name: String
    let plan: String?
    let role: String?
    let color: String?
    let editor: Bool?
    let workspaces: [Workspace]?

    struct Workspace: Codable, Identifiable, Hashable, Sendable {
        let id: UUID
        let name: String
        let lead: Bool?
    }

    var canEdit: Bool { editor ?? false }
    var isPaid: Bool { ["pro", "ultimate"].contains(plan ?? "") }
    var canPresent: Bool { ["solo", "pro", "ultimate"].contains(plan ?? "") }
}

struct Slide: Codable, Hashable, Sendable {
    let lines: [String]
    let label: String?
}

struct Translation: Codable, Hashable, Sendable {
    let title: String
    let text: String
}

struct SongMetadata: Codable, Hashable, Sendable {
    var key: String?
    var originalKey: String?
    var chordChart: String?
    var bpm: FlexibleString?
    var author: String?
    var copyright: String?
    var preferredKey: String?
    var transposedKeys: [String]?
    var translations: [Translation]?
    var language: String?
    var youtubeURL: String?

    enum CodingKeys: String, CodingKey {
        case key, bpm, author, copyright, translations, language
        case originalKey = "original_key"
        case chordChart = "chord_chart"
        case preferredKey = "preferred_key"
        case transposedKeys = "transposed_keys"
        case youtubeURL = "youtube_url"
    }
}

struct Song: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var artist: String?
    var ccliNumber: String?
    var rawLyrics: String?
    var slides: [Slide]?
    var linesPerSlide: Int?
    var metadata: SongMetadata?
    var updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, title, artist, slides, metadata
        case ccliNumber = "ccli_number"
        case rawLyrics = "raw_lyrics"
        case linesPerSlide = "lines_per_slide"
        case updatedAt = "updated_at"
    }

    static let columns = "id,title,artist,ccli_number,raw_lyrics,slides,lines_per_slide,metadata,updated_at"

    var key: String? { metadata?.key }
    var chordChart: String? { metadata?.chordChart }
    var hasChart: Bool { !(chordChart ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    /// "G Major" → "G", "F# Minor" → "F#m" (as on the web app's song list).
    var shortKey: String? { metadata?.key.map(Song.shortKey) }

    static func shortKey(_ key: String) -> String {
        let parts = key.split(separator: " ")
        guard let note = parts.first else { return key }
        return parts.count > 1 && parts[1].lowercased() == "minor" ? "\(note)m" : String(note)
    }
}

struct ServiceSet: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var serviceDate: String?   // "2026-11-15"
    var serviceTime: String?   // "10:30:00"
    var churchId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, name
        case serviceDate = "service_date"
        case serviceTime = "service_time"
        case churchId = "church_id"
    }

    static let columns = "id,name,service_date,service_time,church_id"

    var date: Date? {
        guard let serviceDate else { return nil }
        return ServiceSet.dayFormatter.date(from: serviceDate)
    }

    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

struct SetItem: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    let type: String
    let position: Int
    let content: Content

    struct Content: Codable, Hashable, Sendable {
        var songId: UUID?
        var songTitle: String?
        var songArtist: String?
        var key: String?
        var title: String?

        enum CodingKeys: String, CodingKey {
            case key, title
            case songId = "song_id"
            case songTitle = "song_title"
            case songArtist = "song_artist"
        }
    }

    static let columns = "id,type,position,content"

    var displayTitle: String {
        content.songTitle ?? content.title ?? type.capitalized
    }
}

/// Some older rows store numbers (bpm) as numbers, newer ones as text. Accept both.
struct FlexibleString: Codable, Hashable, Sendable, CustomStringConvertible {
    let value: String
    var description: String { value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let i = try? c.decode(Int.self) { value = String(i) }
        else if let d = try? c.decode(Double.self) { value = String(Int(d)) }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(value)
    }
}

// MARK: - API replies (api/_handlers/songs.js)

struct TransposeRequest: Encodable {
    let chord_chart: String
    let from_key: String
    let to_key: String
}

struct TransposeReply: Decodable {
    let chord_chart: String
    let key: String
}

struct KeysRequest: Encodable { let key: String }
struct KeysReply: Decodable { let keys: [String] }
