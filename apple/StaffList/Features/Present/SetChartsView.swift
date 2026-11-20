import SwiftUI

/// Song Viewer for a set: every song as a chord chart (or lyrics), in order and in the set's key,
/// turned page by page. Works offline from the saved copy of the set.
struct SetChartsView: View {
    let set: ServiceSet
    @Environment(\.dismiss) private var dismiss
    @State private var entries: [SongViewer.Entry] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                closable { ContentUnavailableView("Couldn't load the charts", systemImage: "wifi.exclamationmark", description: Text(error)) }
            } else if entries.isEmpty {
                closable { ContentUnavailableView("No songs in this set", systemImage: "music.note") }
            } else {
                SongViewer(entries: entries, onClose: { dismiss() })
            }
        }
        .background(Color.black)
        .preferredColorScheme(.dark)
        .task { await load() }
    }

    private func closable<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content().overlay(alignment: .topTrailing) {
            HeaderTextButton("Done") { dismiss() }.padding()
        }
    }

    private func load() async {
        defer { loading = false }
        do {
            let (p, _) = try await OfflineStore.presentation(for: set.id)
            let songs = Dictionary(uniqueKeysWithValues: p.songs.map { ($0.id, $0) })
            entries = p.items.sorted { $0.position < $1.position }.compactMap { item in
                guard item.type == "song", let id = item.songId, let song = songs[id] else { return nil }
                return SongViewer.Entry(song: song, key: item.key, arrangement: item.arrangement)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
