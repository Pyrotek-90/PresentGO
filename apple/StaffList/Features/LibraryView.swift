import SwiftUI
import Supabase

/// The team's song library: search by title, artist or CCLI number.
struct LibraryView: View {
    @Environment(SessionStore.self) private var session
    @State private var songs: [Song] = []
    @State private var search = ""
    @State private var loading = true
    @State private var error: String?

    private var filtered: [Song] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return songs }
        return songs.filter {
            $0.title.lowercased().contains(q)
                || ($0.artist ?? "").lowercased().contains(q)
                || ($0.ccliNumber ?? "") == q
        }
    }

    var body: some View {
        NavigationStack {
            List(filtered) { song in
                NavigationLink(value: song) {
                    SongRow(song: song)
                }
            }
            .listStyle(.plain)
            .overlay { overlay }
            .navigationTitle("Songs")
            .navigationDestination(for: Song.self) { SongView(song: $0) }
            .searchable(text: $search, prompt: "Title, artist or CCLI #")
            .refreshable { await load() }
            .task { await load() }
        }
    }

    @ViewBuilder private var overlay: some View {
        if loading && songs.isEmpty {
            ProgressView()
        } else if let error {
            ContentUnavailableView("Couldn't load songs", systemImage: "wifi.exclamationmark", description: Text(error))
        } else if songs.isEmpty {
            ContentUnavailableView("No songs yet", systemImage: "music.note",
                                   description: Text("Import your charts at stafflist.app → Import Songs."))
        } else if filtered.isEmpty {
            ContentUnavailableView.search(text: search)
        }
    }

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        loading = true
        defer { loading = false }
        do {
            songs = try await supabase.from("songs")
                .select(Song.columns)
                .eq("church_id", value: team.id)
                .order("title")
                .limit(5000)
                .execute()
                .value
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SongRow: View {
    let song: Song

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(song.title).font(.body.weight(.medium))
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let key = song.shortKey {
                Text(key)
                    .font(.caption.monospaced().bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.tint.opacity(0.2), in: Capsule())
            }
        }
        .padding(.vertical, 2)
    }
}
