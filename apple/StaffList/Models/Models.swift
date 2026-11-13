import Foundation
import Supabase

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

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lines = (try? c.decodeIfPresent([String].self, forKey: .lines)) ?? []
        label = try? c.decodeIfPresent(String.self, forKey: .label)
    }
}

struct Translation: Codable, Hashable, Sendable {
    var title: String
    var text: String

    init(title: String, text: String) { self.title = title; self.text = text }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "Translation"
        text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? ""
    }
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
    var themes: [String]?
    var slideTranslation: String?
    var occasions: [String]?
    var rotation: Bool?
    var keyNotes: [String: String]?

    enum CodingKeys: String, CodingKey {
        case key, bpm, author, copyright, translations, language, themes, occasions, rotation
        case keyNotes = "key_notes"
        case slideTranslation = "slide_translation"
        case originalKey = "original_key"
        case chordChart = "chord_chart"
        case preferredKey = "preferred_key"
        case transposedKeys = "transposed_keys"
        case youtubeURL = "youtube_url"
    }

    /// Reads each field on its own, so one unexpected value never hides the whole song.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        key = try? c.decodeIfPresent(String.self, forKey: .key)
        originalKey = try? c.decodeIfPresent(String.self, forKey: .originalKey)
        chordChart = try? c.decodeIfPresent(String.self, forKey: .chordChart)
        bpm = try? c.decodeIfPresent(FlexibleString.self, forKey: .bpm)
        author = try? c.decodeIfPresent(String.self, forKey: .author)
        copyright = try? c.decodeIfPresent(String.self, forKey: .copyright)
        preferredKey = try? c.decodeIfPresent(String.self, forKey: .preferredKey)
        transposedKeys = try? c.decodeIfPresent([String].self, forKey: .transposedKeys)
        translations = try? c.decodeIfPresent([Translation].self, forKey: .translations)
        language = try? c.decodeIfPresent(String.self, forKey: .language)
        youtubeURL = try? c.decodeIfPresent(String.self, forKey: .youtubeURL)
        slideTranslation = try? c.decodeIfPresent(String.self, forKey: .slideTranslation)
        occasions = try? c.decodeIfPresent([String].self, forKey: .occasions)
        rotation = try? c.decodeIfPresent(Bool.self, forKey: .rotation)
        keyNotes = try? c.decodeIfPresent([String: String].self, forKey: .keyNotes)
        if let list = try? c.decodeIfPresent([String].self, forKey: .themes) {
            themes = list
        } else if let text = try? c.decodeIfPresent(String.self, forKey: .themes) {
            themes = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
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
    var updatedAt: String?

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
    var durationMin: Int?
    var venueName: String?
    var locationAddress: String?
    var locationDetails: String?
    var extraTimes: [ExtraTime]?
    var seriesId: UUID?
    var recurrence: RepeatRule?

    enum CodingKeys: String, CodingKey {
        case id, name, recurrence
        case serviceDate = "service_date"
        case serviceTime = "service_time"
        case churchId = "church_id"
        case durationMin = "duration_min"
        case venueName = "venue_name"
        case locationAddress = "location_address"
        case locationDetails = "location_details"
        case extraTimes = "extra_times"
        case seriesId = "series_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        name = (try? c.decode(String.self, forKey: .name)) ?? "Set"
        serviceDate = try? c.decodeIfPresent(String.self, forKey: .serviceDate)
        serviceTime = try? c.decodeIfPresent(String.self, forKey: .serviceTime)
        churchId = try? c.decodeIfPresent(UUID.self, forKey: .churchId)
        durationMin = try? c.decodeIfPresent(Int.self, forKey: .durationMin)
        venueName = try? c.decodeIfPresent(String.self, forKey: .venueName)
        locationAddress = try? c.decodeIfPresent(String.self, forKey: .locationAddress)
        locationDetails = try? c.decodeIfPresent(String.self, forKey: .locationDetails)
        extraTimes = try? c.decodeIfPresent([ExtraTime].self, forKey: .extraTimes)
        seriesId = try? c.decodeIfPresent(UUID.self, forKey: .seriesId)
        recurrence = try? c.decodeIfPresent(RepeatRule.self, forKey: .recurrence)
    }

    /// Every column, so sets keep working whichever optional columns the database has.
    static let columns = "*"

    var venueText: String? {
        let parts = [venueName, locationAddress].compactMap { $0 }.filter { !$0.isEmpty }
        guard !parts.isEmpty else { return nil }
        let room = (locationDetails ?? "").isEmpty ? "" : " · \(locationDetails!)"
        return parts.joined(separator: ", ") + room
    }

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

/// One entry in a set. `content` is kept as raw JSON so edits never drop fields the web app
/// stores there (arrangements, notes, media).
struct SetItem: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var type: String
    var position: Int
    var content: JSONObject

    static let columns = "id,type,position,content"

    var songId: UUID? { content["song_id"]?.stringValue.flatMap(UUID.init(uuidString:)) }
    /// This set's order of the song's sections, if it differs from the song's own.
    var arrangement: [String]? {
        guard let list = content["arrangement"]?.arrayValue, !list.isEmpty else { return nil }
        return list.compactMap(\.stringValue)
    }

    /// The key chosen for this song in this set ("A Major"), if any.
    var key: String? { content["key"]?.stringValue.flatMap { $0.isEmpty ? nil : $0 } }

    var displayTitle: String {
        if let t = content["song_title"]?.stringValue, !t.isEmpty { return t }
        if let t = content["title"]?.stringValue, !t.isEmpty { return t }
        switch type {
        case "blank": return "Blank slide"
        case "note": return "Worship Leader Note"
        case "media": return "Media"
        default: return type.capitalized
        }
    }

    var systemImage: String {
        switch type {
        case "song": return "music.note"
        case "welcome": return "star"
        case "announcement": return "megaphone"
        case "blank": return "square"
        case "note": return "square.and.pencil"
        case "media": return "folder"
        default: return "square"
        }
    }
}

struct NewSetItem: Encodable {
    let set_id: UUID
    let type: String
    let content: JSONObject
    let position: Int
}

/// Rehearsal, practice, run-thru, soundcheck… (sets.extra_times, src/lib/setTimes.js).
struct ExtraTime: Codable, Hashable, Sendable, Identifiable {
    var id = UUID()
    var label: String
    var date: String
    var time: String?
    var minutes: Int?

    enum CodingKeys: String, CodingKey { case label, date, time, minutes }

    init(label: String, date: String, time: String?, minutes: Int?) {
        self.label = label; self.date = date; self.time = time; self.minutes = minutes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        label = (try? c.decode(String.self, forKey: .label)) ?? "Rehearsal"
        date = (try? c.decode(String.self, forKey: .date)) ?? ""
        time = try? c.decodeIfPresent(String.self, forKey: .time)
        minutes = (try? c.decodeIfPresent(Int.self, forKey: .minutes)) ?? nil
    }

    static let names = ["Rehearsal", "Practice", "Run-Thru", "Soundcheck"]
}

/// A repeating set's rule (src/lib/recurrence.js): weekly, every 2 weeks or monthly (same
/// weekday of the month), for a number of sets or until a date.
struct RepeatRule: Codable, Hashable, Sendable {
    var freq: String
    var count: Int?
    var until: String?
    /// Monthly only: "weekday" (with `week` 0–3 = 1st–4th, 4 = last) or "date" (same date each month).
    var by: String?
    var week: Int?
}

/// Body for /api/v1/sets/save (api/_handlers/set-save.js).
struct SetSaveRequest: Encodable {
    var id: UUID?
    var church_id: UUID?
    var name: String
    var date: String
    var time: String?
    var duration: Int
    var venue: String
    var address: String
    var room: String
    var times: [ExtraTime]
    var `repeat`: RepeatRule?
    var copy_program: Bool
    var scope: String
    var time_zone: String
}

struct SetSaveReply: Decodable {
    let set: ServiceSet
    let message: String?
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

// MARK: - Saving and importing songs (api/_handlers/song-save.js, songs.js, import-pdf.js)

struct SongSaveRequest: Encodable {
    var id: UUID?
    var church_id: UUID?
    var title: String
    var artist: String
    var ccli_number: String
    var raw_lyrics: String
    var lines_per_slide: Int
    var chord_chart: String
    var arrangement: [String]?
    var metadata: JSONObject
}

struct SongSaveReply: Decodable { let song: Song }

struct ParseRequest: Encodable {
    let text: String
    let filename: String
}

struct ImportReply: Decodable {
    let status: String
    let message: String?
    let song: ImportedSong?

    struct ImportedSong: Decodable {
        let title: String?
        let artist: String?
        let author: String?
        let ccli_number: String?
        let key: String?
        let bpm: FlexibleString?
        let copyright: String?
        let raw_lyrics: String?
        let chord_chart: String?
    }
}

// MARK: - Keys

enum MusicKeys {
    static let major = ["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"].map { "\($0) Major" }
    static let minor = ["C", "C#", "D", "E♭", "E", "F", "F#", "G", "G#", "A", "B♭", "B"].map { "\($0) Minor" }
    static let all = major + minor

    /// "g", "Bb", "F#m", "E minor" → "G Major", "B♭ Major", "F# Minor", "E Minor" (the web app's format).
    static func normalise(_ raw: String?) -> String {
        guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return "" }
        let pattern = #/^([A-Ga-g])([#b♭]?)\s*(m(?!aj)|min(?:or)?|maj(?:or)?)?/#.ignoresCase()
        guard let m = raw.firstMatch(of: pattern) else { return raw }
        let root = m.1.uppercased()
        let acc = m.2 == "b" || m.2 == "♭" ? "♭" : String(m.2)
        let mode = (m.3.map { $0.lowercased().hasPrefix("m") && !$0.lowercased().hasPrefix("maj") } ?? false) ? "Minor" : "Major"
        return "\(root)\(acc) \(mode)"
    }

    /// Keys in the same mode as `key`, for choosing a set key.
    static func options(like key: String?) -> [String] {
        (key ?? "").contains("Minor") ? minor : major
    }
}

extension Notification.Name {
    static let songsChanged = Notification.Name("StaffListSongsChanged")
    static let setsChanged = Notification.Name("StaffListSetsChanged")
}

// MARK: - Presenting (api/_handlers/set-slides.js)

struct PresentSlide: Codable, Hashable, Sendable {
    let type: String
    let itemId: String?
    let itemTitle: String?
    let lines: [String]
    let subs: [String?]?
    let label: String?
    let sectionLabel: String?
    let title: String?
    let subtitle: String?
    let image: String?
}

struct SetPresentation: Codable, Sendable {
    let set: ServiceSet
    let items: [SetItem]
    let songs: [Song]
    let slides: [PresentSlide]
}

struct SetIDRequest: Encodable { let set_id: UUID }
