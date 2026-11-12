import SwiftUI
import Supabase

/// Upcoming sets for the current team. Members only see sets they're scheduled on — the
/// database enforces that, so the app simply asks for the team's sets.
struct SetsView: View {
    @Environment(SessionStore.self) private var session
    @State private var sets: [ServiceSet] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List(sets) { set in
                NavigationLink(value: set) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(set.name).font(.body.weight(.medium))
                        if let date = set.date {
                            Text(date, format: .dateTime.weekday(.wide).month(.wide).day())
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .overlay {
                if loading && sets.isEmpty { ProgressView() }
                else if let error { ContentUnavailableView("Couldn't load sets", systemImage: "wifi.exclamationmark", description: Text(error)) }
                else if sets.isEmpty { ContentUnavailableView("No upcoming sets", systemImage: "calendar") }
            }
            .navigationTitle(session.currentTeam?.name ?? "Sets")
            .navigationDestination(for: ServiceSet.self) { SetDetailView(set: $0) }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        loading = true
        defer { loading = false }
        let today = ServiceSet.dayFormatter.string(from: .now)
        do {
            sets = try await supabase.from("sets")
                .select(ServiceSet.columns)
                .eq("church_id", value: team.id)
                .gte("service_date", value: today)
                .order("service_date")
                .limit(100)
                .execute()
                .value
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SetDetailView: View {
    let set: ServiceSet
    @State private var items: [SetItem] = []
    @State private var songs: [UUID: Song] = [:]
    @State private var loading = true

    var body: some View {
        List(items) { item in
            if let id = item.content.songId, let song = songs[id] {
                NavigationLink {
                    SongView(song: song, setKey: item.content.key)
                } label: {
                    HStack {
                        SongRow(song: song)
                        if let key = item.content.key { Text(Song.shortKey(key)).font(.caption.bold()).foregroundStyle(.tint) }
                    }
                }
            } else {
                Text(item.displayTitle).foregroundStyle(.secondary)
            }
        }
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .navigationTitle(set.name)
        .task { await load() }
    }

    private func load() async {
        defer { loading = false }
        do {
            items = try await supabase.from("set_items")
                .select(SetItem.columns)
                .eq("set_id", value: set.id)
                .order("position")
                .execute()
                .value
            let ids = items.compactMap(\.content.songId).map(\.uuidString)
            guard !ids.isEmpty else { return }
            let found: [Song] = try await supabase.from("songs")
                .select(Song.columns)
                .in("id", values: ids)
                .execute()
                .value
            songs = Dictionary(uniqueKeysWithValues: found.map { ($0.id, $0) })
        } catch {
            // Leave whatever loaded; pull to refresh retries.
        }
    }
}
