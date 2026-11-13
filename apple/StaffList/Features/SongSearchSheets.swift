import SwiftUI

/// Find lyrics to start a song from (LRCLIB, then lyrics.ovh — through the API, like the web).
/// Crowd-sourced and unlicensed: a quick draft that the church checks against its CCLI license.
struct LyricsSearchSheet: View {
    @Environment(\.dismiss) private var dismiss
    var initialQuery: String
    var onPick: (Hit) -> Void

    struct Hit: Decodable, Hashable {
        let title: String
        let artist: String
        let album: String
        let lyrics: String
    }
    private struct Reply: Decodable { let results: [Hit] }
    private struct Request: Encodable { let q: String }

    @State private var query = ""
    @State private var results: [Hit] = []
    @State private var searching = false
    @State private var message: String?
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Song title or artist", text: $query)
                            .focused($focused)
                            .submitLabel(.search)
                            .onSubmit { Task { await search() } }
                        Button { Task { await search() } } label: {
                            if searching { ProgressView() } else { Image(systemName: "magnifyingglass") }
                        }
                        .disabled(query.trimmingCharacters(in: .whitespaces).isEmpty || searching)
                    }
                } footer: {
                    Text(message ?? "Lyrics from public sources may have mistakes. Song lyrics are protected by copyright — verify your church's license at ccli.com.")
                }
                Section {
                    ForEach(results, id: \.self) { r in
                        Button {
                            guard !r.lyrics.isEmpty else { return }
                            onPick(r)
                            dismiss()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.title).font(.body.weight(.medium))
                                    Text([r.artist, r.album].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(r.lyrics.isEmpty ? "No lyrics" : "Select")
                                    .font(.caption).foregroundStyle(r.lyrics.isEmpty ? .red : .accentColor)
                            }
                        }
                        .tint(.primary)
                    }
                }
            }
            .navigationTitle("Search Lyrics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                query = initialQuery
                focused = true
                if !initialQuery.isEmpty { Task { await search() } }
            }
        }
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        searching = true
        defer { searching = false }
        do {
            results = try await StaffListAPI.shared.post("songs/search-lyrics", Request(q: q), as: Reply.self).results
            message = results.isEmpty ? "No matches. Try the title with the artist, or paste the lyrics." : nil
        } catch {
            message = error.localizedDescription
        }
    }
}

/// Find a YouTube video for the song (the API's youtube-search).
struct YouTubeSearchSheet: View {
    @Environment(\.dismiss) private var dismiss
    let query: String
    var onPick: (String) -> Void

    struct Video: Decodable, Hashable {
        let id: String
        let title: String?
        let channel: String?
        let thumbnail: String?
    }
    private struct Reply: Decodable { let results: [Video] }
    private struct Request: Encodable { let q: String }

    @State private var results: [Video] = []
    @State private var loading = true
    @State private var message: String?

    var body: some View {
        NavigationStack {
            List(results, id: \.self) { v in
                Button {
                    onPick("https://www.youtube.com/watch?v=\(v.id)")
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        AsyncImage(url: URL(string: v.thumbnail ?? "")) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.2) }
                            .frame(width: 96, height: 54).clipShape(RoundedRectangle(cornerRadius: 6))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(v.title ?? "Video").font(.subheadline.weight(.medium)).lineLimit(2)
                            if let c = v.channel { Text(c).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
                .tint(.primary)
            }
            .overlay {
                if loading { ProgressView() }
                else if let message { ContentUnavailableView("No videos", systemImage: "play.rectangle", description: Text(message)) }
            }
            .navigationTitle("Find on YouTube")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task {
                defer { loading = false }
                do {
                    results = try await StaffListAPI.shared.post("youtube-search", Request(q: query), as: Reply.self).results
                    if results.isEmpty { message = "Nothing found. Paste a YouTube link instead." }
                } catch let e as APIError where e.status == 501 {
                    message = "YouTube search isn't set up. Paste a YouTube link instead."
                } catch {
                    message = error.localizedDescription
                }
            }
        }
    }
}
