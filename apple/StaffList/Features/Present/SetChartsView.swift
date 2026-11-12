import SwiftUI

/// For the band: every song in the set as a chord chart, in order and in the set's key.
/// Swipe, or use a Bluetooth foot pedal (arrow keys / Page Up / Page Down), to turn the page.
/// Works offline from the saved copy of the set.
struct SetChartsView: View {
    let set: ServiceSet
    @Environment(\.dismiss) private var dismiss
    @State private var pages: [(song: Song, key: String?)] = []
    @State private var page = 0
    @State private var loading = true
    @State private var error: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView()
                } else if let error {
                    ContentUnavailableView("Couldn't load the charts", systemImage: "wifi.exclamationmark", description: Text(error))
                } else if pages.isEmpty {
                    ContentUnavailableView("No songs in this set", systemImage: "music.note")
                } else {
                    TabView(selection: $page) {
                        ForEach(pages.indices, id: \.self) { i in
                            SongChartView(song: pages[i].song, setKey: pages[i].key)
                                .tag(i)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                }
            }
            .navigationTitle(pages.isEmpty ? set.name : "\(page + 1) of \(pages.count) · \(set.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button("Previous Song", systemImage: "chevron.left") { turn(-1) }.disabled(page == 0)
                    Spacer()
                    Button("Next Song", systemImage: "chevron.right") { turn(1) }.disabled(page >= pages.count - 1)
                }
            }
        }
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(keys: [.rightArrow, .downArrow, .pageDown, .space]) { _ in turn(1); return .handled }
        .onKeyPress(keys: [.leftArrow, .upArrow, .pageUp]) { _ in turn(-1); return .handled }
        .task { await load() }
    }

    private func turn(_ by: Int) {
        withAnimation { page = min(max(page + by, 0), max(pages.count - 1, 0)) }
    }

    private func load() async {
        defer { loading = false; focused = true }
        do {
            let (p, _) = try await OfflineStore.presentation(for: set.id)
            let songs = Dictionary(uniqueKeysWithValues: p.songs.map { ($0.id, $0) })
            pages = p.items.compactMap { item in
                guard item.type == "song", let id = item.songId, let song = songs[id] else { return nil }
                return (song, item.key)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
