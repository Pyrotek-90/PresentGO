import SwiftUI
import Supabase
import UniformTypeIdentifiers

/// Create or edit a song. Saving goes through the StaffList API (songs/save), which builds the
/// slides, keeps the chord chart in step with the lyrics and keeps fields this screen doesn't
/// show — exactly like the web app's editor.
struct SongEditorView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let song: Song?
    var onSaved: (Song) -> Void
    var onDeleted: () -> Void

    @State private var title: String
    @State private var artist: String
    @State private var key: String
    @State private var bpm: String
    @State private var ccli: String
    @State private var author: String
    @State private var copyright: String
    @State private var lyrics: String
    @State private var chart: String
    @State private var linesPerSlide: Int

    @State private var saving = false
    @State private var importing = false
    @State private var showImporter = false
    @State private var confirmDelete = false
    @State private var importNote: String?
    @State private var error: String?

    private static let sections = ["Intro", "Verse 1", "Verse 2", "Verse 3", "Pre-Chorus", "Chorus", "Bridge", "Tag", "Interlude", "Outro"]
    private static let fileTypes: [UTType] = [.pdf, .plainText, .text] +
        ["cho", "chordpro", "chopro", "crd"].compactMap { UTType(filenameExtension: $0) }

    init(song: Song? = nil, onSaved: @escaping (Song) -> Void = { _ in }, onDeleted: @escaping () -> Void = {}) {
        self.song = song
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        let m = song?.metadata
        _title = State(initialValue: song?.title ?? "")
        _artist = State(initialValue: song?.artist ?? "")
        _key = State(initialValue: MusicKeys.normalise(m?.key))
        _bpm = State(initialValue: m?.bpm?.value ?? "")
        _ccli = State(initialValue: song?.ccliNumber ?? "")
        _author = State(initialValue: m?.author ?? "")
        _copyright = State(initialValue: m?.copyright ?? "")
        _lyrics = State(initialValue: song?.rawLyrics ?? "")
        _chart = State(initialValue: m?.chordChart ?? "")
        _linesPerSlide = State(initialValue: song?.linesPerSlide ?? 2)
    }

    private var keyOptions: [String] {
        key.isEmpty || MusicKeys.all.contains(key) ? MusicKeys.all : [key] + MusicKeys.all
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && !lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if song == nil {
                    Section {
                        Button {
                            showImporter = true
                        } label: {
                            HStack {
                                Label("Import a Chart File", systemImage: "square.and.arrow.down")
                                if importing { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(importing)
                    } footer: {
                        Text(importNote ?? "ChordPro (.cho, .chordpro), text or text-based PDF charts from SongSelect, PraiseCharts and similar.")
                    }
                }

                Section("Details") {
                    TextField("Title", text: $title)
                    TextField("Artist", text: $artist)
                    Picker("Key", selection: $key) {
                        Text("None").tag("")
                        ForEach(keyOptions, id: \.self) { Text(Song.shortKey($0)).tag($0) }
                    }
                    TextField("Tempo (BPM)", text: $bpm).keyboardType(.numberPad)
                    TextField("CCLI Song #", text: $ccli).keyboardType(.numberPad)
                    TextField("Writers", text: $author)
                    TextField("Copyright", text: $copyright)
                }

                Section {
                    TextEditor(text: $lyrics)
                        .frame(minHeight: 280)
                        .autocorrectionDisabled()
                } header: {
                    HStack {
                        Text("Lyrics")
                        Spacer()
                        Menu {
                            ForEach(Self.sections, id: \.self) { s in
                                Button(s) { insertSection(s) }
                            }
                        } label: {
                            Label("Insert Section", systemImage: "plus")
                                .font(.caption.weight(.semibold))
                                .textCase(nil)
                        }
                    }
                } footer: {
                    Text("Put each section label on its own line in brackets, e.g. [Verse 1], [Chorus].")
                }

                Section {
                    TextEditor(text: $chart)
                        .font(.system(.callout, design: .monospaced))
                        .frame(minHeight: 240)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Chord Chart")
                } footer: {
                    Text("Chords on the line above each lyric line. When you save, the chart's lyric lines are matched to the lyrics above.")
                }

                Section("Slides") {
                    Stepper("\(linesPerSlide) line\(linesPerSlide == 1 ? "" : "s") per slide", value: $linesPerSlide, in: 1...8)
                }

                if song != nil {
                    Section {
                        Button("Delete Song", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(song == nil ? "New Song" : "Edit Song")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button("Save") { Task { await save() } }.disabled(!canSave)
                    }
                }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: Self.fileTypes) { result in
                Task { await importFile(result) }
            }
            .confirmationDialog("Delete \"\(title)\"?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Song", role: .destructive) { Task { await delete() } }
            } message: {
                Text("It's removed from your team's library for everyone.")
            }
            .alert("Couldn't save", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: { Text(error ?? "") }
            .interactiveDismissDisabled(saving)
        }
    }

    private func insertSection(_ label: String) {
        let tag = "[\(label)]"
        if lyrics.isEmpty || lyrics.hasSuffix("\n\n") { lyrics += "\(tag)\n" }
        else if lyrics.hasSuffix("\n") { lyrics += "\n\(tag)\n" }
        else { lyrics += "\n\n\(tag)\n" }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let request = SongSaveRequest(
            id: song?.id,
            church_id: song == nil ? session.currentTeam?.id : nil,
            title: title, artist: artist, ccli_number: ccli,
            raw_lyrics: lyrics, lines_per_slide: linesPerSlide, chord_chart: chart,
            metadata: ["key": key, "bpm": bpm, "author": author, "copyright": copyright]
        )
        do {
            let reply = try await StaffListAPI.shared.post("songs/save", request, as: SongSaveReply.self)
            onSaved(reply.song)
            NotificationCenter.default.post(name: .songsChanged, object: nil)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let song else { return }
        do {
            try await supabase.from("songs").delete().eq("id", value: song.id).execute()
            NotificationCenter.default.post(name: .songsChanged, object: nil)
            dismiss()
            onDeleted()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func importFile(_ result: Result<URL, Error>) async {
        guard case .success(let url) = result else { return }
        importing = true
        defer { importing = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let reply: ImportReply
            if url.pathExtension.lowercased() == "pdf" {
                reply = try await StaffListAPI.shared.upload("songs/import-pdf", data: data, query: ["filename": url.lastPathComponent], as: ImportReply.self)
            } else {
                let text = String(decoding: data, as: UTF8.self)
                reply = try await StaffListAPI.shared.post("songs/parse", ParseRequest(text: text, filename: url.lastPathComponent), as: ImportReply.self)
            }
            guard reply.status == "ready", let s = reply.song else {
                importNote = reply.message ?? "Couldn't read that file."
                return
            }
            if let v = s.title, !v.isEmpty { title = v }
            if let v = s.artist, !v.isEmpty { artist = v }
            if let v = s.key, !v.isEmpty { key = MusicKeys.normalise(v) }
            if let v = s.bpm?.value, !v.isEmpty { bpm = v }
            if let v = s.ccli_number, !v.isEmpty { ccli = v }
            if let v = s.author, !v.isEmpty { author = v }
            if let v = s.copyright, !v.isEmpty { copyright = v }
            lyrics = s.raw_lyrics ?? ""
            chart = s.chord_chart ?? ""
            importNote = "Imported \(url.lastPathComponent). " + (reply.message ?? "Check the details, then Save.")
        } catch {
            importNote = error.localizedDescription
        }
    }
}
