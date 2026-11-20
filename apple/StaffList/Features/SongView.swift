import SwiftUI

/// One song, with Edit for Admins and Leaders. Reloads the chart after a save.
struct SongView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var song: Song
    let setKey: String?
    @State private var editing = false
    @Environment(ChromeState.self) private var chrome: ChromeState?

    init(song: Song, setKey: String? = nil) {
        _song = State(initialValue: song)
        self.setKey = setKey
    }

    var body: some View {
        SongViewer(entries: [SongViewer.Entry(song: song, key: setKey)], allowKeyChange: setKey == nil, headerInNavBar: true)
            .id(song.updatedAt ?? song.title)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if session.currentTeam?.canEdit ?? false {
                    ToolbarItem(placement: .topBarTrailing) {
                        HeaderIconButton("Edit", systemImage: "pencil") { editing = true }
                    }
                    .headerIconItem()
                }
            }
            // Full screen for the song, like the set's Song Viewer: no page bar.
            .toolbar(.hidden, for: .tabBar)
            .squaredBackButton()
            .onAppear { chrome?.hidePageBar = true }
            .onDisappear { chrome?.hidePageBar = false }
            .sheet(isPresented: $editing) {
                SongEditorView(song: song, onSaved: { song = $0 }, onDeleted: { dismiss() })
            }
    }
}
