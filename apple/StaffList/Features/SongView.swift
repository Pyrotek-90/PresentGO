import SwiftUI

/// One song, with Edit for Admins and Leaders. Reloads the chart after a save.
struct SongView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var song: Song
    let setKey: String?
    @State private var editing = false

    init(song: Song, setKey: String? = nil) {
        _song = State(initialValue: song)
        self.setKey = setKey
    }

    var body: some View {
        SongViewer(entries: [SongViewer.Entry(song: song, key: setKey)], allowKeyChange: setKey == nil)
            .id(song.updatedAt ?? song.title)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if session.currentTeam?.canEdit ?? false {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Edit") { editing = true }
                    }
                }
            }
            .sheet(isPresented: $editing) {
                SongEditorView(song: song, onSaved: { song = $0 }, onDeleted: { dismiss() })
            }
    }
}
