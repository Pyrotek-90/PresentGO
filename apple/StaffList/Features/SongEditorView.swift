import SwiftUI
import Supabase
import UniformTypeIdentifiers

/// Create or edit a song in the web editor's five steps (src/components/songs/SongEditor.jsx):
///   1 Lyrics  ·  2 Slides  ·  3 Arrangement  ·  4 Chords  ·  5 Details
/// Saving goes through the shared API (songs/save), which builds the slides in the song's order,
/// keeps the chord chart in step with the lyrics and keeps fields this screen doesn't show.
struct SongEditorView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let song: Song?
    var onSaved: (Song) -> Void
    var onDeleted: () -> Void

    enum Step: Int, CaseIterable {
        case lyrics = 1, slides, arrangement, chords, details
        var title: String { ["", "Lyrics", "Slides", "Arrangement", "Chords", "Details"][rawValue] }
        var next: String { ["", "Format Slides", "Arrange", "Add Chords", "Song Details", ""][rawValue] }
    }

    @State private var step: Step = .lyrics

    // Step 1
    @State private var title: String
    @State private var artist: String
    @State private var lyrics: String
    @State private var language: String
    // Step 2
    @State private var linesPerSlide: Int
    @State private var preview: [Slide] = []
    @State private var translations: [Translation]
    @State private var translationsTouched = false
    @State private var slideTranslation: String
    // Step 3
    @State private var order: [String]
    @State private var orderTouched = false
    // Step 4
    @State private var chart: String
    // Step 5
    @State private var key: String
    @State private var bpm: String
    @State private var ccli: String
    @State private var author: String
    @State private var copyright: String
    @State private var otherKeys: Set<String>
    @State private var keyNotes: [String: String]
    @State private var preferredKey: String
    @State private var themes: Set<String>
    @State private var occasions: Set<String>
    @State private var customOccasion = ""
    @State private var rotation: Bool
    @State private var youtube: String

    @State private var saving = false
    @State private var importing = false
    @State private var showImporter = false
    @State private var showLyricSearch = false
    @State private var showYouTubeSearch = false
    @State private var confirmDelete = false
    @State private var aiWorking: String?
    @State private var note: String?
    @State private var error: String?

    private static let sections = ["Intro", "Verse 1", "Verse 2", "Verse 3", "Verse 4", "Pre-Chorus", "Chorus", "Bridge", "Tag", "Interlude", "Instrumental", "Outro"]
    private static let fileTypes: [UTType] = [.pdf, .plainText, .text] +
        ["cho", "chordpro", "chopro", "crd"].compactMap { UTType(filenameExtension: $0) }
    static let occasionList = ["Christmas", "Easter", "Good Friday", "Baptism", "Wedding", "Funeral"]
    static let languages = ["English", "Hindi", "Spanish", "Portuguese", "French", "Tagalog", "Indonesian", "Swahili", "German",
                            "Tamil", "Telugu", "Malayalam", "Kannada", "Bengali", "Punjabi", "Gujarati", "Urdu", "Nepali", "Marathi"]

    init(song: Song? = nil, onSaved: @escaping (Song) -> Void = { _ in }, onDeleted: @escaping () -> Void = {}) {
        self.song = song
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        let m = song?.metadata
        _title = State(initialValue: song?.title ?? "")
        _artist = State(initialValue: song?.artist ?? "")
        _lyrics = State(initialValue: song?.rawLyrics ?? "")
        _language = State(initialValue: m?.language ?? "")
        _linesPerSlide = State(initialValue: song?.linesPerSlide ?? 2)
        _translations = State(initialValue: m?.translations ?? [])
        _slideTranslation = State(initialValue: m?.slideTranslation ?? "")
        _order = State(initialValue: slideSequence(song?.slides))
        _chart = State(initialValue: m?.chordChart ?? "")
        _key = State(initialValue: MusicKeys.normalise(m?.key))
        _bpm = State(initialValue: m?.bpm?.value ?? "")
        _ccli = State(initialValue: song?.ccliNumber ?? "")
        _author = State(initialValue: m?.author ?? "")
        _copyright = State(initialValue: m?.copyright ?? "")
        _otherKeys = State(initialValue: Set(m?.transposedKeys ?? []))
        _keyNotes = State(initialValue: m?.keyNotes ?? [:])
        _preferredKey = State(initialValue: m?.preferredKey ?? "")
        _themes = State(initialValue: Set(m?.themes ?? []))
        _occasions = State(initialValue: Set(m?.occasions ?? []))
        _rotation = State(initialValue: m?.rotation ?? false)
        _youtube = State(initialValue: m?.youtubeURL ?? "")
    }

    private var isPro: Bool { session.currentTeam?.isPaid ?? false }
    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && !lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                stepBar
                Group {
                    switch step {
                    case .lyrics: lyricsStep
                    case .slides: slidesStep
                    case .arrangement: arrangementStep
                    case .chords: chordsStep
                    case .details: detailsStep
                    }
                }
                .frame(maxHeight: .infinity)
                footer
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
            .sheet(isPresented: $showLyricSearch) {
                LyricsSearchSheet(initialQuery: title) { hit in
                    if !hit.title.isEmpty { title = hit.title }
                    if !hit.artist.isEmpty { artist = hit.artist }
                    lyrics = hit.lyrics
                    order = []; orderTouched = false
                    Task { await lookUp(silent: true) }
                }
            }
            .sheet(isPresented: $showYouTubeSearch) {
                YouTubeSearchSheet(query: [title, artist].filter { !$0.isEmpty }.joined(separator: " ")) { youtube = $0 }
            }
            .confirmationDialog("Delete \"\(title)\"?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Song", role: .destructive) { Task { await delete() } }
            } message: {
                Text("It's removed from your team's library for everyone.")
            }
            .alert("Something went wrong", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: { Text(error ?? "") }
            .interactiveDismissDisabled(saving)
        }
    }

    // MARK: - Step bar and footer

    private var stepBar: some View {
        HStack(spacing: 4) {
            ForEach(Step.allCases, id: \.self) { s in
                Button {
                    if s == .lyrics || canSave { step = s }
                } label: {
                    VStack(spacing: 4) {
                        Text("\(s.rawValue)")
                            .font(.caption.weight(.bold))
                            .frame(width: 24, height: 24)
                            .foregroundStyle(s == step ? .white : (s.rawValue < step.rawValue ? Theme.accentLight : .secondary))
                            .background(s == step ? Theme.accent : (s.rawValue < step.rawValue ? Theme.accent.opacity(0.25) : Color.secondary.opacity(0.15)), in: Circle())
                        Text(s.title).font(.caption2).foregroundStyle(s == step ? .primary : .secondary).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .disabled(s != .lyrics && !canSave)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(.bar)
    }

    private var footer: some View {
        HStack {
            if step != .lyrics {
                Button { step = Step(rawValue: step.rawValue - 1) ?? .lyrics } label: {
                    Label("Back", systemImage: "chevron.left")
                }
                .buttonStyle(.bordered)
            }
            if let note {
                Text(note).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            if step != .details {
                Button { step = Step(rawValue: step.rawValue + 1) ?? .details } label: {
                    Label(step.next, systemImage: "chevron.right").labelStyle(TrailingIcon())
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSave)
            } else {
                Button { Task { await save() } } label: {
                    Label(song == nil ? "Save Song" : "Save Changes", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSave || saving)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.bar)
    }

    // MARK: - 1 Lyrics

    private var lyricsStep: some View {
        Form {
            Section {
                TextField("Song title", text: $title).font(.title3.weight(.semibold))
                TextField("Artist", text: $artist)
            }
            Section {
                HStack(spacing: 10) {
                    Button { showLyricSearch = true } label: { Label("Search Lyrics", systemImage: "magnifyingglass") }
                        .buttonStyle(.bordered)
                    Button { showImporter = true } label: {
                        if importing { ProgressView() } else { Label("Import Chart", systemImage: "square.and.arrow.down") }
                    }
                    .buttonStyle(.bordered)
                    .disabled(importing)
                    Spacer()
                }
                if isPro {
                    HStack(spacing: 10) {
                        Button { Task { await cleanUp() } } label: { Label("Smart Cleanup", systemImage: "wand.and.stars") }
                            .disabled(lyrics.isEmpty || aiWorking != nil)
                        Button { Task { await translate() } } label: { Label("Translate", systemImage: "character.book.closed") }
                            .disabled(lyrics.isEmpty || aiWorking != nil)
                        if let aiWorking { ProgressView(); Text(aiWorking).font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                    }
                    .buttonStyle(.bordered)
                }
            }
            Section {
                TextEditor(text: $lyrics)
                    .frame(minHeight: 360)
                    .autocorrectionDisabled()
            } header: {
                HStack {
                    Text("Lyrics")
                    Spacer()
                    Menu {
                        ForEach(Self.sections, id: \.self) { s in Button(s) { insertSection(s) } }
                    } label: {
                        Label("Insert Section", systemImage: "plus").font(.caption.weight(.semibold)).textCase(nil)
                    }
                }
            } footer: {
                Text("Put each section label on its own line in brackets, e.g. [Verse 1], [Chorus]. Song lyrics are protected by copyright — check your church's license at ccli.com.")
            }
        }
    }

    private func insertSection(_ label: String) {
        let tag = "[\(label)]"
        if lyrics.isEmpty || lyrics.hasSuffix("\n\n") { lyrics += "\(tag)\n" }
        else if lyrics.hasSuffix("\n") { lyrics += "\n\(tag)\n" }
        else { lyrics += "\n\n\(tag)\n" }
    }

    // MARK: - 2 Slides

    private var slidesStep: some View {
        Form {
            Section {
                Stepper("\(linesPerSlide) line\(linesPerSlide == 1 ? "" : "s") per slide", value: $linesPerSlide, in: 1...8)
                if !translations.isEmpty {
                    Picker("Translation on slides", selection: $slideTranslation) {
                        Text("None").tag("")
                        ForEach(translations.map(\.title), id: \.self) { Text($0).tag($0) }
                    }
                }
            }
            Section("Preview") {
                if preview.isEmpty {
                    Text("Add lyrics to see the slides.").foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 200), spacing: 10)], spacing: 10) {
                        ForEach(Array(preview.enumerated()), id: \.offset) { _, s in
                            SlideView(slide: PresentSlide(type: "song", itemId: nil, itemTitle: nil, lines: s.lines, subs: nil,
                                                          label: s.label, sectionLabel: nil, title: nil, subtitle: nil, image: nil),
                                      fit: previewFit)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(alignment: .topLeading) {
                                    if let l = s.label {
                                        Text(l.uppercased()).font(.system(size: 9, weight: .semibold))
                                            .foregroundStyle(Color(white: 0.62)).padding(4)
                                            .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 3)).padding(4)
                                    }
                                }
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
            Section {
                ForEach(translations.indices, id: \.self) { i in
                    NavigationLink {
                        TranslationEditorView(translation: Binding(
                            get: { translations.indices.contains(i) ? translations[i] : Translation(title: "", text: "") },
                            set: { if translations.indices.contains(i) { translations[i] = $0; translationsTouched = true } }
                        ), onDelete: {
                            if translations.indices.contains(i) { translations.remove(at: i); translationsTouched = true }
                        })
                    } label: {
                        Text(translations[i].title.isEmpty ? "Translation" : translations[i].title)
                    }
                }
                Button("Add Translation", systemImage: "plus") {
                    translations.append(Translation(title: "English Translation", text: lyricSections(lyrics).map { "[\($0)]\n" }.joined(separator: "\n")))
                    translationsTouched = true
                }
            } header: {
                Text("Translations")
            } footer: {
                Text("Same [Section] labels and one line per lyric line, so each translation line shows under its lyric line.")
            }
        }
        .task(id: "\(lyrics.hashValue)-\(linesPerSlide)") { await loadPreview() }
    }

    private var previewFit: SlideFit {
        SlideFit(preview.map { PresentSlide(type: "song", itemId: nil, itemTitle: nil, lines: $0.lines, subs: nil,
                                           label: nil, sectionLabel: nil, title: nil, subtitle: nil, image: nil) })
    }

    private struct SlidesRequest: Encodable { let raw_lyrics: String; let lines_per_slide: Int }
    private struct SlidesReply: Decodable { let slides: [Slide] }

    private func loadPreview() async {
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled, !lyrics.isEmpty else { preview = []; return }
        if let r = try? await StaffListAPI.shared.post("songs/slides", SlidesRequest(raw_lyrics: lyrics, lines_per_slide: linesPerSlide), as: SlidesReply.self) {
            preview = r.slides
        }
    }

    // MARK: - 3 Arrangement

    private var arrangementStep: some View {
        let sections = lyricSections(lyrics)
        return Group {
            if sections.isEmpty {
                ContentUnavailableView("No sections yet", systemImage: "list.number",
                                       description: Text("Mark sections in the lyrics, e.g. [Verse 1] and [Chorus], to arrange them."))
            } else {
                ArrangementEditor(title: "Arrangement", order: Binding(
                    get: { order.isEmpty && !orderTouched ? sections : order },
                    set: { order = $0; orderTouched = true }
                ), sections: sections, onReset: { order = sections; orderTouched = true })
            }
        }
    }

    // MARK: - 4 Chords

    private var chordsStep: some View {
        Form {
            Section {
                HStack(spacing: 10) {
                    Button("Start from Lyrics", systemImage: "text.badge.plus") { Task { await chartFromLyrics(replace: true) } }
                        .disabled(lyrics.isEmpty)
                    Button("Match to Lyrics", systemImage: "arrow.triangle.2.circlepath") { Task { await chartFromLyrics(replace: false) } }
                        .disabled(lyrics.isEmpty || chart.isEmpty)
                    Spacer()
                }
                .buttonStyle(.bordered)
            } footer: {
                Text("Start from Lyrics lays out every lyric line so you can type chords above it. Match to Lyrics keeps your chords and updates the lyric lines.")
            }
            Section {
                TextEditor(text: $chart)
                    .font(.system(.callout, design: .monospaced))
                    .frame(minHeight: 420)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            } header: {
                Text("Chord Chart")
            } footer: {
                Text("Chords on the line above each lyric line, e.g.\n   G           D/F#\nAmazing grace how sweet the sound")
            }
        }
    }

    private struct ChartRequest: Encodable { let raw_lyrics: String; let chord_chart: String }
    private struct ChartReply: Decodable { let chord_chart: String }

    private func chartFromLyrics(replace: Bool) async {
        if let r = try? await StaffListAPI.shared.post("songs/chart", ChartRequest(raw_lyrics: lyrics, chord_chart: replace ? "" : chart), as: ChartReply.self) {
            chart = r.chord_chart
        }
    }

    // MARK: - 5 Details

    private var detailsStep: some View {
        Form {
            Section {
                Picker("Key", selection: $key) {
                    Text("None").tag("")
                    ForEach(key.isEmpty || MusicKeys.all.contains(key) ? MusicKeys.all : [key] + MusicKeys.all, id: \.self) {
                        Text(Song.shortKey($0)).tag($0)
                    }
                }
                TextField("Tempo (BPM)", text: $bpm).keyboardType(.numberPad)
                TextField("CCLI Song #", text: $ccli).keyboardType(.numberPad)
                TextField("Writers", text: $author)
                TextField("Copyright", text: $copyright)
                if isPro {
                    Button { Task { await lookUp(silent: false) } } label: {
                        HStack { Label("Look Up Key, Tempo & Writers", systemImage: "sparkle.magnifyingglass"); if aiWorking != nil { Spacer(); ProgressView() } }
                    }
                    .disabled(title.isEmpty || aiWorking != nil)
                }
            } header: { Text("Song") }

            if !key.isEmpty {
                Section {
                    NavigationLink {
                        KeyListPicker(original: key, selected: $otherKeys)
                    } label: {
                        LabeledContent("Other Keys", value: otherKeys.isEmpty ? "None" : otherKeys.sorted().map(Song.shortKey).joined(separator: ", "))
                    }
                    ForEach([key] + otherKeys.sorted(), id: \.self) { k in
                        LabeledContent(Song.shortKey(k)) {
                            TextField("Note, e.g. Male key", text: Binding(get: { keyNotes[k] ?? "" }, set: { keyNotes[k] = $0 }))
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    Picker("Preferred Key", selection: $preferredKey) {
                        Text("Song's key").tag("")
                        ForEach([key] + otherKeys.sorted(), id: \.self) { Text(Song.shortKey($0)).tag($0) }
                    }
                } header: { Text("Keys") } footer: { Text("Other keys show first when choosing a key for a set. Notes say who each key is for.") }
            }

            Section {
                Toggle("Add to Rotation List", isOn: $rotation)
                chips("Themes", options: songThemes, selected: $themes)
                chips("Occasion", options: Self.occasionList + occasions.filter { !Self.occasionList.contains($0) }.sorted(), selected: $occasions)
                HStack {
                    TextField("Other occasion", text: $customOccasion)
                    Button("Add") {
                        let o = customOccasion.trimmingCharacters(in: .whitespaces)
                        if !o.isEmpty { occasions.insert(o); customOccasion = "" }
                    }
                    .disabled(customOccasion.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Picker("Language", selection: $language) {
                    Text("Not set").tag("")
                    ForEach(Self.languages + (language.isEmpty || Self.languages.contains(language) ? [] : [language]), id: \.self) { Text($0).tag($0) }
                }
            } header: { Text("Song Library") } footer: { Text("Occasion songs are left out of the library's default view.") }

            Section {
                TextField("YouTube link", text: $youtube)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                HStack {
                    Button("Find on YouTube", systemImage: "magnifyingglass") { showYouTubeSearch = true }
                        .disabled(title.isEmpty)
                    Spacer()
                    if let url = URL(string: youtube), youtube.contains("youtu") {
                        Link(destination: url) { Label("Play", systemImage: "play.fill") }
                    }
                }
            } header: { Text("YouTube") }

            if song != nil {
                Section { Button("Delete Song", role: .destructive) { confirmDelete = true } }
            }
        }
    }

    private func chips(_ title: String, options: [String], selected: Binding<Set<String>>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.subheadline).foregroundStyle(.secondary)
            FlowLayout(spacing: 6) {
                ForEach(options, id: \.self) { o in
                    let on = selected.wrappedValue.contains(o)
                    Button {
                        if on { selected.wrappedValue.remove(o) } else { selected.wrappedValue.insert(o) }
                    } label: {
                        Text(o).font(.subheadline)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .foregroundStyle(on ? Theme.accentLight : .secondary)
                            .background(on ? Theme.accent.opacity(0.25) : .clear, in: Capsule())
                            .overlay(Capsule().stroke(on ? Theme.accent : Color.secondary.opacity(0.4)))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - AI

    private func lookUp(silent: Bool) async {
        guard isPro, !title.isEmpty else { return }
        aiWorking = "Looking up…"
        defer { aiWorking = nil }
        do {
            let d = try await AITools.lookUp(title: title, artist: artist)
            var filled: [String] = []
            if let k = d.key, !k.isEmpty, key.isEmpty { key = MusicKeys.normalise(k); filled.append("key") }
            if let b = d.bpm, bpm.isEmpty { bpm = String(b); filled.append("tempo") }
            if let w = d.songwriters, !w.isEmpty, author.isEmpty { author = w; filled.append("writers") }
            if !filled.isEmpty { note = "Filled in " + filled.joined(separator: ", ") + " — check them in Details." }
        } catch {
            if !silent { self.error = AITools.message(for: error) }
        }
    }

    private func cleanUp() async {
        aiWorking = "Cleaning up…"
        defer { aiWorking = nil }
        do { lyrics = try await AITools.cleanUp(lyrics) } catch { self.error = AITools.message(for: error) }
    }

    private func translate() async {
        aiWorking = "Translating…"
        defer { aiWorking = nil }
        do {
            let t = try await AITools.translate(lyrics)
            if let lang = t.language, !lang.isEmpty, language.isEmpty { language = lang }
            guard let text = t.text, !text.isEmpty else {
                note = t.language.map { "These lyrics are in \($0)." } ?? "Nothing to translate."
                return
            }
            translations.append(Translation(title: "English Translation", text: text))
            translationsTouched = true
            if slideTranslation.isEmpty { slideTranslation = "English Translation" }
            note = "Added an English translation — see Slides."
        } catch {
            self.error = AITools.message(for: error)
        }
    }

    // MARK: - Import

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
                reply = try await StaffListAPI.shared.post("songs/parse", ParseRequest(text: String(decoding: data, as: UTF8.self), filename: url.lastPathComponent), as: ImportReply.self)
            }
            guard reply.status == "ready", let s = reply.song else {
                note = reply.message ?? "Couldn't read that file."
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
            order = []; orderTouched = false
            note = "Imported \(url.lastPathComponent). " + (reply.message ?? "")
        } catch {
            note = error.localizedDescription
        }
    }

    // MARK: - Save and delete

    private func save() async {
        saving = true
        defer { saving = false }
        let request = SongSaveRequest(
            id: song?.id,
            church_id: song == nil ? session.currentTeam?.id : nil,
            title: title, artist: artist, ccli_number: ccli,
            raw_lyrics: lyrics, lines_per_slide: linesPerSlide, chord_chart: chart,
            arrangement: orderTouched ? order : nil,
            metadata: metadataPatch()
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

    private func metadataPatch() -> JSONObject {
        var m: JSONObject = [:]
        m["key"] = .string(key)
        m["bpm"] = .string(bpm)
        m["author"] = .string(author)
        m["copyright"] = .string(copyright)
        m["youtube_url"] = .string(youtube.trimmingCharacters(in: .whitespaces))
        m["themes"] = .array(themes.sorted().map { AnyJSON.string($0) })
        m["occasions"] = .array(occasions.sorted().map { AnyJSON.string($0) })
        m["rotation"] = .bool(rotation)
        if !language.isEmpty { m["language"] = .string(language) }
        let keys = key.isEmpty ? [] : otherKeys.sorted()
        m["transposed_keys"] = .array(keys.map { AnyJSON.string($0) })
        var notes: JSONObject = [:]
        for (k, v) in keyNotes where !v.trimmingCharacters(in: .whitespaces).isEmpty && (k == key || keys.contains(k)) {
            notes[k] = .string(v.trimmingCharacters(in: .whitespaces))
        }
        m["key_notes"] = .object(notes)
        m["preferred_key"] = .string(preferredKey == key || keys.contains(preferredKey) ? preferredKey : "")
        let titles = translations.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map(\.title)
        m["slide_translation"] = .string(titles.contains(slideTranslation) ? slideTranslation : "")
        if translationsTouched {
            var list: [AnyJSON] = []
            for t in translations where !t.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                var o: JSONObject = [:]
                o["title"] = .string(t.title)
                o["text"] = .string(t.text)
                list.append(.object(o))
            }
            m["translations"] = .array(list)
        }
        return m
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
}

private struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}

/// Wraps chips onto as many lines as they need.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, s.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}
