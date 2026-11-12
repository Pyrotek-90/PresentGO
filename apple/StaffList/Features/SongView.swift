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
        SongChartView(song: song, setKey: setKey)
            .id(song.updatedAt ?? song.title)
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

/// A song's chord chart or lyrics, with transposition done by the StaffList API so the iPad
/// and the web app always agree.
struct SongChartView: View {
    let song: Song
    var setKey: String? = nil   // key chosen for this song in a set

    @AppStorage("songTextSize") private var textSize: Double = 18
    @State private var mode: Mode = .chart
    @State private var keys: [String] = []
    @State private var activeKey: String?
    @State private var chart: String
    @State private var transposing = false
    @State private var error: String?

    enum Mode: String, CaseIterable { case chart = "Chords", lyrics = "Lyrics" }

    init(song: Song, setKey: String? = nil) {
        self.song = song
        self.setKey = setKey
        _chart = State(initialValue: song.chordChart ?? "")
        _mode = State(initialValue: song.hasChart ? .chart : .lyrics)
    }

    var body: some View {
        ScrollView([.vertical]) {
            VStack(alignment: .leading, spacing: 16) {
                header
                if mode == .chart && song.hasChart {
                    ChartText(text: chart, size: textSize)
                } else {
                    LyricsText(text: song.rawLyrics ?? "", size: textSize)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(song.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .task { await loadKeys() }
        .alert("Couldn't change key", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: { Text(error ?? "") }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(song.title).font(.title2.bold())
            HStack(spacing: 8) {
                if let artist = song.artist, !artist.isEmpty { Text(artist) }
                if let key = activeKey ?? song.key { Text("Key \(Song.shortKey(key))") }
                if let bpm = song.metadata?.bpm?.value, !bpm.isEmpty { Text("\(bpm) BPM") }
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            if song.hasChart {
                Picker("View", selection: $mode) {
                    ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
                }
                .pickerStyle(.segmented)
                .frame(width: 180)
            }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if song.hasChart, song.key != nil, !keys.isEmpty {
                Menu {
                    Picker("Key", selection: Binding(get: { activeKey ?? song.key ?? "" }, set: { k in
                        Task { await transpose(to: k) }
                    })) {
                        ForEach([song.key!] + keys, id: \.self) { Text(Song.shortKey($0)).tag($0) }
                    }
                } label: {
                    if transposing { ProgressView() } else { Label("Key", systemImage: "tuningfork") }
                }
            }
            Menu {
                Button("Larger", systemImage: "textformat.size.larger") { textSize = min(textSize + 2, 40) }
                Button("Smaller", systemImage: "textformat.size.smaller") { textSize = max(textSize - 2, 12) }
            } label: {
                Label("Text Size", systemImage: "textformat.size")
            }
        }
    }

    private func loadKeys() async {
        guard let key = song.key, song.hasChart else { return }
        if let reply = try? await StaffListAPI.shared.post("songs/keys", KeysRequest(key: key), as: KeysReply.self) {
            keys = reply.keys
        }
        let start = setKey ?? song.metadata?.preferredKey
        if let start, start != key { await transpose(to: start) }
    }

    private func transpose(to key: String) async {
        guard let from = song.key, let original = song.chordChart else { return }
        if key == from { chart = original; activeKey = from; return }
        transposing = true
        defer { transposing = false }
        do {
            let reply = try await StaffListAPI.shared.post(
                "songs/transpose", TransposeRequest(chord_chart: original, from_key: from, to_key: key), as: TransposeReply.self)
            chart = reply.chord_chart
            activeKey = reply.key
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// A chords-over-lyrics chart: monospaced so chords stay above the right syllable, chord lines
/// tinted, section labels bold. Long lines scroll sideways rather than wrapping.
struct ChartText: View {
    let text: String
    let size: Double

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                    row(line)
                }
            }
            .font(.system(size: size, design: .monospaced))
            .textSelection(.enabled)
        }
    }

    @ViewBuilder private func row(_ line: String) -> some View {
        if line.hasPrefix("[") && line.hasSuffix("]") {
            Text(line.dropFirst().dropLast())
                .font(.system(size: size * 0.85, weight: .bold))
                .foregroundStyle(.secondary)
                .padding(.top, 10)
        } else if ChartText.isChordLine(line) {
            Text(line).bold().foregroundStyle(Color.staffTeal)
        } else {
            Text(line.isEmpty ? " " : line)
        }
    }

    /// Mirrors isChordLine in src/lib/chords.js closely enough for display.
    static func isChordLine(_ line: String) -> Bool {
        let tokens = line.split(whereSeparator: \.isWhitespace)
        guard !tokens.isEmpty else { return false }
        let chord = #/^\(?[A-G][#b♭]?(m|maj|min|dim|aug|sus|add|M)?\d*(sus\d*|add\d+|maj\d*|[#b]\d+)*(\/[A-G][#b♭]?)?\)?$/#
        let bar = #/^(\|{1,2}:?|:?\|{1,2}|\/+|%|x\d+|\d+x)$/#
        return tokens.allSatisfy { t in
            let s = String(t)
            return s.wholeMatch(of: chord) != nil || s.wholeMatch(of: bar) != nil
        }
    }
}

struct LyricsText: View {
    let text: String
    let size: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                if line.hasPrefix("[") && line.hasSuffix("]") {
                    Text(line.dropFirst().dropLast())
                        .font(.system(size: size * 0.85, weight: .bold))
                        .foregroundStyle(.secondary)
                        .padding(.top, 10)
                } else {
                    Text(line.isEmpty ? " " : line).font(.system(size: size))
                }
            }
        }
        .textSelection(.enabled)
    }
}
