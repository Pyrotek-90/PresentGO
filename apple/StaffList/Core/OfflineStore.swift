import Foundation
import Supabase

/// Copies of what the app last loaded, kept on the iPad so Sunday works without internet:
/// the team's songs and sets, and each upcoming set's presentation (slides, items and songs).
/// Plain JSON files in Application Support — small, and easy to throw away.
/// Settings → Offline Copies turns it off (and clears what's saved); it's on by default.
enum OfflineStore {
    static let enabledKey = "offlineEnabled"
    static var enabled: Bool { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }

    private static let folder: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("Offline", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    private static func file(_ name: String) -> URL { folder.appendingPathComponent(name + ".json") }

    static func save<T: Encodable>(_ value: T, as name: String) {
        guard enabled, let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: file(name), options: .atomic)
    }

    static func load<T: Decodable>(_ type: T.Type, from name: String) -> T? {
        guard enabled, let data = try? Data(contentsOf: file(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func savedAt(_ name: String) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: file(name).path))?[.modificationDate] as? Date
    }

    static func clear() {
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    static func songsKey(_ team: UUID) -> String { "songs-\(team.uuidString)" }
    static func setsKey(_ team: UUID) -> String { "sets-\(team.uuidString)" }
    static func presentationKey(_ set: UUID) -> String { "present-\(set.uuidString)" }

    /// Loads a set's presentation from the API (and saves it), or the saved copy when offline.
    static func presentation(for setID: UUID) async throws -> (SetPresentation, offline: Bool) {
        do {
            let fresh = try await StaffListAPI.shared.post("sets/slides", SetIDRequest(set_id: setID), as: SetPresentation.self)
            save(fresh, as: presentationKey(setID))
            return (fresh, false)
        } catch {
            if let saved = load(SetPresentation.self, from: presentationKey(setID)) { return (saved, true) }
            throw error
        }
    }

    /// Saves the upcoming sets (slides, songs and charts) for offline use, quietly in the background.
    static func prefetch(_ sets: [ServiceSet], limit: Int = 12) async {
        guard enabled else { return }
        for set in sets.prefix(limit) {
            _ = try? await presentation(for: set.id)
        }
    }

    /// Saves the whole Song Library, so it's there offline even if the Songs tab wasn't opened.
    static func saveLibrary(team: UUID) async {
        guard enabled else { return }
        if let songs: [Song] = try? await supabase.from("songs").select(Song.columns)
            .eq("church_id", value: team).order("title").limit(5000).execute().value {
            save(songs, as: songsKey(team))
        }
    }

    /// Everything offline mode keeps: the library and the upcoming sets.
    static func saveAll(team: UUID) async {
        guard enabled else { return }
        await saveLibrary(team: team)
        let today = ServiceSet.dayFormatter.string(from: .now)
        if let sets: [ServiceSet] = try? await supabase.from("sets").select(ServiceSet.columns)
            .eq("church_id", value: team).gte("service_date", value: today)
            .order("service_date").limit(12).execute().value {
            await prefetch(sets)
        }
    }
}
