import SwiftUI
import UIKit

// MARK: - Layout

/// One song laid out into pages, like the web Song Viewer (src/components/songs/SongViewer.jsx):
/// the largest text that fits the song on one page (one column, or two on a wide screen), and when
/// it can't, pages at a comfortable size. Sections move to the next column or page whole.
struct SongLayout {
    enum Kind { case header, chords, lyric }
    struct Line: Hashable { let kind: Kind; let text: String }
    /// Lines kept together on a page: a section header, or a chord line with its lyric.
    struct Unit { let lines: [Line] }
    struct Section { let units: [Unit] }
    struct Column { var lines: [Line] = []; var gaps: Set<Int> = [] }   // gaps: line indexes with space above

    let fontSize: CGFloat
    let columns: Int
    let pages: [[Column]]
    let chart: Bool

    var lineHeight: CGFloat { fontSize * 1.32 }
    var gap: CGFloat { fontSize * 0.8 }

    static func sections(chart text: String) -> [Section] {
        var out: [Section] = []
        var units: [Unit] = []
        let lines = text.components(separatedBy: "\n")
        var i = 0
        func flush() { if !units.isEmpty { out.append(Section(units: units)); units = [] } }
        while i < lines.count {
            let line = lines[i]
            let t = line.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("[") && t.hasSuffix("]") && t.count > 2 {
                flush()
                units.append(Unit(lines: [Line(kind: .header, text: String(t.dropFirst().dropLast()))]))
            } else if t.isEmpty {
                // Blank lines just separate sections.
                if units.contains(where: { $0.lines.contains { $0.kind != .header } }) { flush() }
            } else if Chords.isChordLine(line) {
                let next = i + 1 < lines.count ? lines[i + 1] : ""
                let nt = next.trimmingCharacters(in: .whitespaces)
                if !nt.isEmpty, !Chords.isChordLine(next), !nt.hasPrefix("[") {
                    units.append(Unit(lines: [Line(kind: .chords, text: line), Line(kind: .lyric, text: next)]))
                    i += 1
                } else {
                    units.append(Unit(lines: [Line(kind: .chords, text: line)]))
                }
            } else {
                units.append(Unit(lines: [Line(kind: .lyric, text: line)]))
            }
            i += 1
        }
        flush()
        return out
    }

    static func sections(lyrics raw: String, slides: [Slide]) -> [Section] {
        var out: [Section] = []
        var units: [Unit] = []
        func flush() { if units.contains(where: { $0.lines.first?.kind == .lyric }) { out.append(Section(units: units)) }; units = [] }
        for line in raw.components(separatedBy: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("[") && t.hasSuffix("]") && t.count > 2 {
                flush()
                units.append(Unit(lines: [Line(kind: .header, text: String(t.dropFirst().dropLast()))]))
            } else if !t.isEmpty {
                units.append(Unit(lines: [Line(kind: .lyric, text: line)]))
            }
        }
        flush()
        if out.isEmpty {
            // No lyrics text: use the slides.
            for s in slides {
                if s.label != nil || out.isEmpty { flush() }
                if let l = s.label, !l.isEmpty { units.append(Unit(lines: [Line(kind: .header, text: l)])) }
                units += s.lines.map { Unit(lines: [Line(kind: .lyric, text: $0)]) }
            }
            flush()
        }
        return out
    }

    // Font measuring at 100pt; widths scale with the size.
    private static func font(_ kind: Kind, chart: Bool, size: CGFloat = 100) -> UIFont {
        switch kind {
        case .header: return .systemFont(ofSize: size * 0.72, weight: .bold)
        case .chords, .lyric: return chart ? .monospacedSystemFont(ofSize: size, weight: .semibold) : .systemFont(ofSize: size, weight: .semibold)
        }
    }

    static func make(sections: [Section], chart: Bool, size: CGSize, manualSize: CGFloat?, columnsPref: Int?) -> SongLayout {
        let wide = size.width >= 640
        let padX: CGFloat = wide ? 20 : 14
        let colGap: CGFloat = wide ? 40 : 28
        let width = max(size.width - padX * 2, 100)
        let height = max(size.height - 24, 100)

        // Each line's width at 100pt, plus its indent.
        var widest100: CGFloat = 0
        for s in sections { for u in s.units { for l in u.lines {
            let attrs: [NSAttributedString.Key: Any] = [.font: font(l.kind, chart: chart)]
            let w = l.kind == .header
                ? (l.text.uppercased() as NSString).size(withAttributes: attrs).width * 1.12   // letter spacing
                : (l.text as NSString).size(withAttributes: attrs).width + 50                   // 0.5em indent
            widest100 = max(widest100, w)
        } } }
        func colWidth(_ cols: Int) -> CGFloat { (width - CGFloat(cols - 1) * colGap) / CGFloat(cols) }
        func fitsWidth(_ f: CGFloat, _ cols: Int) -> Bool { widest100 * f / 100 <= colWidth(cols) }
        func widestFit(_ cols: Int) -> CGFloat { floor(colWidth(cols) / widest100 * 100) }

        let maxSize: CGFloat = 32
        let comfort: CGFloat = wide ? (chart ? 18 : 22) : (chart ? 15 : 16)
        let floorTwo: CGFloat = 15
        let minReadable: CGFloat = wide ? 12 : 11

        func onePage(_ f: CGFloat, _ cols: Int) -> Bool {
            fitsWidth(f, cols) && pack(sections, f, height).count <= cols
        }
        var f: CGFloat
        var cols: Int
        if let manual = manualSize {
            f = manual
            if let p = columnsPref { cols = p == 2 && wide ? 2 : 1 } else { cols = onePage(f, 1) || !wide ? 1 : 2 }
        } else if let p = columnsPref {
            cols = p == 2 && wide ? 2 : 1
            f = stride(from: maxSize, through: comfort, by: -1).first { onePage($0, cols) } ?? min(comfort, max(minReadable, widestFit(cols)))
        } else if let one = stride(from: maxSize, through: comfort, by: -1).first(where: { onePage($0, 1) }) {
            f = one; cols = 1
        } else if wide, let two = stride(from: maxSize, through: min(comfort, floorTwo), by: -1).first(where: { onePage($0, 2) }) {
            f = two; cols = 2
        } else if wide, widestFit(2) >= floorTwo {
            cols = 2; f = min(comfort, widestFit(2))
        } else {
            cols = 1; f = min(comfort, max(minReadable, widestFit(1)))
        }
        if manualSize == nil { f = max(minReadable, min(f, widestFit(cols))) }

        let columns = pack(sections, f, height)
        let pages = stride(from: 0, to: max(columns.count, 1), by: cols).map { Array(columns[$0..<min($0 + cols, columns.count)]) }
        return SongLayout(fontSize: f, columns: cols, pages: pages.isEmpty ? [[]] : pages, chart: chart)
    }

    /// Fills columns of the given height: a section goes whole into the next column when it doesn't
    /// fit; one taller than a column is split between units (never between a chord and its lyric).
    private static func pack(_ sections: [Section], _ f: CGFloat, _ height: CGFloat) -> [Column] {
        let lineH = f * 1.32, gap = f * 0.8
        var cols: [Column] = []
        var cur = Column()
        var h: CGFloat = 0
        func newColumn() { if !cur.lines.isEmpty { cols.append(cur) }; cur = Column(); h = 0 }
        for s in sections {
            let secH = CGFloat(s.units.reduce(0) { $0 + $1.lines.count }) * lineH
            let above = cur.lines.isEmpty ? 0 : gap
            if h + above + secH > height && secH <= height { newColumn() }
            var first = true
            for u in s.units {
                let uh = CGFloat(u.lines.count) * lineH
                let lead = first && !cur.lines.isEmpty ? gap : 0
                if h + lead + uh > height && !cur.lines.isEmpty { newColumn() }
                if first && !cur.lines.isEmpty { cur.gaps.insert(cur.lines.count); h += gap }
                cur.lines += u.lines
                h += uh
                first = false
            }
        }
        newColumn()
        return cols
    }
}

// MARK: - Viewer

/// The Song Viewer: a set's songs (or one song) as pages to turn, like the web. Tap the right of
/// the page or swipe left for the next page (and on into the next song); tap the left or swipe right
/// to go back. Arrow keys, Page Up / Down and Space work for a Bluetooth foot pedal.
/// Bottom left: the song and page; bottom right: the song's structure.
struct SongViewer: View {
    struct Entry: Identifiable {
        let id = UUID()
        let song: Song
        var key: String?
        var arrangement: [String]? = nil
    }

    let entries: [Entry]
    var startIndex = 0
    var onClose: (() -> Void)? = nil

    @AppStorage("viewerMode") private var modeRaw = "lyrics"
    @AppStorage("viewerSizeChords") private var sizeChords: Double = 0   // 0 = fit automatically
    @AppStorage("viewerSizeLyrics") private var sizeLyrics: Double = 0
    @AppStorage("viewerColumns") private var columnsPref = 0              // 0 = auto
    @State private var index = 0
    @State private var page = 0
    @State private var keys: [Int: String] = [:]
    @State private var area: CGSize = .zero
    @FocusState private var focused: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass

    private var entry: Entry { entries[min(index, entries.count - 1)] }
    private var song: Song { entry.song }
    private var chartMode: Bool { modeRaw == "chords" && song.hasChart }
    private var manualSize: CGFloat? {
        let v = modeRaw == "chords" ? sizeChords : sizeLyrics
        return v > 0 ? v : nil
    }

    // Keys: the song's original, its saved keys and the set's key first; then every other key.
    private func original(_ s: Song) -> String? { s.metadata?.originalKey ?? s.metadata?.key }
    private func savedKeys(_ i: Int) -> [String] {
        let s = entries[i].song
        var out: [String] = []
        for k in [original(s)] + (s.metadata?.transposedKeys ?? []).map(Optional.some) + [entries[i].key] {
            if let k, !k.isEmpty, Chords.parseKey(k) != nil, !out.contains(where: { Chords.sameKey($0, k) }) { out.append(k) }
        }
        return out
    }
    private func activeKey(_ i: Int) -> String? {
        if let k = keys[i] { return k }
        let s = entries[i].song
        if let k = entries[i].key, Chords.parseKey(k) != nil { return k }
        if let p = s.metadata?.preferredKey, savedKeys(i).contains(where: { Chords.sameKey($0, p) }) { return p }
        return original(s)
    }

    private func layout(_ i: Int) -> SongLayout {
        let s = entries[i].song
        let chart = modeRaw == "chords" && s.hasChart
        let sections = chart
            ? SongLayout.sections(chart: Chords.transpose(s.chordChart ?? "", from: original(s), to: activeKey(i)))
            : SongLayout.sections(lyrics: s.rawLyrics ?? "", slides: s.slides ?? [])
        return SongLayout.make(sections: sections, chart: chart, size: area,
                               manualSize: manualSize, columnsPref: columnsPref == 0 ? nil : columnsPref)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            GeometryReader { geo in
                let current = layout(index)
                pageView(current)
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
                    .contentShape(Rectangle())
                    .onTapGesture { loc in loc.x < geo.size.width / 3 ? back() : forward() }
                    .gesture(DragGesture(minimumDistance: 30).onEnded { v in
                        guard abs(v.translation.width) > 50, abs(v.translation.width) > abs(v.translation.height) else { return }
                        v.translation.width < 0 ? forward() : back()
                    })
                    .onAppear { area = geo.size }
                    .onChange(of: geo.size) { _, s in area = s; page = 0 }
            }
            Divider().overlay(Theme.border)
            footer
        }
        .background(Color.black)
        .foregroundStyle(Color(white: 0.96))
        .preferredColorScheme(.dark)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(keys: [.rightArrow, .downArrow, .pageDown, .space]) { _ in forward(); return .handled }
        .onKeyPress(keys: [.leftArrow, .upArrow, .pageUp]) { _ in back(); return .handled }
        .onKeyPress(.escape) { onClose?(); return .handled }
        .onAppear { index = min(startIndex, max(entries.count - 1, 0)); focused = true }
        .onChange(of: modeRaw) { page = 0 }
        .onChange(of: sizeChords) { page = 0 }
        .onChange(of: sizeLyrics) { page = 0 }
        .onChange(of: columnsPref) { page = 0 }
    }

    // MARK: Turning pages

    private func forward() {
        let count = layout(index).pages.count
        if page < count - 1 { withAnimation(.easeOut(duration: 0.15)) { page += 1 } }
        else if index < entries.count - 1 { index += 1; page = 0 }
    }

    private func back() {
        if page > 0 { withAnimation(.easeOut(duration: 0.15)) { page -= 1 } }
        else if index > 0 {
            index -= 1
            page = layout(index).pages.count - 1   // land on the previous song's last page
        }
    }

    private func jump(to i: Int) { index = i; page = 0 }

    // MARK: Header — title, artist, key, BPM and controls on one line

    private var header: some View {
        HStack(spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(song.title).font(.headline).lineLimit(1).layoutPriority(1)
                if let artist = song.artist, !artist.isEmpty {
                    Text(artist).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            // Key and BPM are shown, not changed here (a set's key is chosen on the set).
            // Each label is the same size as its value.
            if chartMode, let k = activeKey(index) { fact("Key", Song.shortKey(k), accent: true) }
            if let bpm = song.metadata?.bpm?.value, !bpm.isEmpty { fact("BPM", bpm) }
            sizeMenu
            if let onClose {
                Button(action: onClose) { Image(systemName: "xmark").font(.body.weight(.semibold)) }
                    .buttonStyle(.plain).foregroundStyle(Theme.muted)
                    .frame(width: 32, height: 32).contentShape(Rectangle())
                    .accessibilityLabel("Close")
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Theme.panel)
    }

    private func fact(_ label: String, _ value: String, accent: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).foregroundStyle(Theme.muted).fontWeight(.medium)
            Text(value).fontWeight(.bold).foregroundStyle(accent ? Theme.accentLight : .primary)
        }
        .font(.subheadline)
        .accessibilityElement(children: .combine)
    }

    private var keyMenu: some View {
        let current = activeKey(index)
        let saved = savedKeys(index)
        let others = Chords.keyOptions(original(song)).filter { k in !saved.contains { Chords.sameKey($0, k) } }
        return Menu {
            Section("Song keys") {
                ForEach(saved, id: \.self) { k in keyButton(k, current: current) }
            }
            Section("All keys") {
                ForEach(others, id: \.self) { k in keyButton(k, current: current) }
            }
        } label: {
            HStack(spacing: 4) {
                Text("KEY").font(.system(size: 9, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
                Text(current.map(Song.shortKey) ?? "").font(.subheadline.bold())
                    .padding(.horizontal, 8).frame(minWidth: 34, minHeight: 28)
                    .foregroundStyle(Theme.accentLight)
                    .background(Theme.accent.opacity(0.25), in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.accent))
            }
        }
        .accessibilityLabel("Key, \(current ?? "")")
    }

    private func keyButton(_ k: String, current: String?) -> some View {
        Button {
            keys[index] = k
            page = 0
        } label: {
            if Chords.sameKey(k, current) { Label(k, systemImage: "checkmark") } else { Text(k) }
        }
    }

    private var modeToggle: some View {
        HStack(spacing: 0) {
            ForEach([("lyrics", "music.mic", "Lyrics"), ("chords", "music.note", "Chord Chart")], id: \.0) { id, icon, label in
                Button { modeRaw = id } label: {
                    Image(systemName: icon).font(.subheadline)
                        .frame(width: 36, height: 28)
                        .foregroundStyle(modeRaw == id ? Theme.accentLight : Theme.muted)
                        .background(modeRaw == id ? Theme.accent.opacity(0.25) : Color.clear)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(modeRaw == id ? .isSelected : [])
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.border))
    }

    private var sizeMenu: some View {
        Menu {
            Section("Text Size · \(manualSize == nil ? "Auto, " : "")\(Int(layout(index).fontSize)) pt") {
                Button("Larger", systemImage: "plus") { setSize(+2) }
                Button("Smaller", systemImage: "minus") { setSize(-2) }
                Button("Fit Automatically", systemImage: manualSize == nil ? "checkmark" : "arrow.up.left.and.arrow.down.right") { setSize(nil) }
            }
            if sizeClass == .regular {
                Picker("Columns", selection: $columnsPref) {
                    Text("Columns: Auto").tag(0)
                    Text("One Column").tag(1)
                    Text("Two Columns").tag(2)
                }
            }
        } label: {
            Text(manualSize.map { "\(Int($0))" } ?? "Aa").font(.caption.weight(.semibold))
                .frame(minWidth: 34, minHeight: 28)
                .foregroundStyle(Theme.accentLight)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.border))
        }
        .accessibilityLabel("Text size and columns")
    }

    private func setSize(_ delta: Double?) {
        let current = Double(layout(index).fontSize)
        let value = delta.map { min(60, max(10, (manualSize.map(Double.init) ?? current) + $0)) } ?? 0
        if modeRaw == "chords" { sizeChords = value } else { sizeLyrics = value }
    }

    // MARK: Page

    @ViewBuilder
    private func pageView(_ l: SongLayout) -> some View {
        let p = min(page, l.pages.count - 1)
        if l.pages.first?.isEmpty ?? true {
            VStack(spacing: 8) {
                Image(systemName: "music.note").font(.largeTitle)
                Text(chartMode ? "No chord chart for this song yet." : "No lyrics for this song yet.").font(.subheadline)
            }
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            HStack(alignment: .top, spacing: area.width >= 640 ? 40 : 28) {
                ForEach(Array(l.pages[p].enumerated()), id: \.offset) { _, col in
                    column(col, l).frame(maxWidth: .infinity, alignment: .topLeading)
                }
                if l.pages[p].count < l.columns {
                    ForEach(0..<(l.columns - l.pages[p].count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity) }
                }
            }
            .padding(.horizontal, area.width >= 640 ? 20 : 14)
            .padding(.vertical, 12)
            .id("\(index)-\(p)")
            .transition(.opacity)
        }
    }

    private func column(_ col: SongLayout.Column, _ l: SongLayout) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(col.lines.enumerated()), id: \.offset) { i, line in
                if col.gaps.contains(i) { Color.clear.frame(height: l.gap) }
                lineView(line, l)
                    .frame(height: l.lineHeight, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func lineView(_ line: SongLayout.Line, _ l: SongLayout) -> some View {
        let f = l.fontSize
        switch line.kind {
        case .header:
            Text(line.text.uppercased())
                .font(.system(size: f * 0.72, weight: .bold)).tracking(f * 0.07)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        case .chords:
            Text(line.text)
                .font(.system(size: f, weight: .semibold, design: .monospaced))
                .foregroundStyle(Theme.accentLight)
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(.leading, f * 0.5)
        case .lyric:
            Text(line.text)
                .font(l.chart ? .system(size: f, weight: .semibold, design: .monospaced) : .system(size: f, weight: .semibold))
                .lineLimit(1).minimumScaleFactor(0.6)
                .padding(.leading, f * 0.5)
        }
    }

    // MARK: Footer — song and page on the left, structure on the right

    private var arrangement: [String] {
        let labels = entry.arrangement ?? (song.slides ?? []).compactMap(\.label).filter { !$0.isEmpty }
        return labels.map(SongViewer.abbreviate)
    }

    private var footer: some View {
        let count = layout(index).pages.count
        return HStack(spacing: 10) {
            if entries.count > 1 {
                HStack(spacing: 2) {
                    Button { if index > 0 { jump(to: index - 1) } } label: { Image(systemName: "chevron.left") }
                        .disabled(index == 0).accessibilityLabel("Previous song")
                    Menu {
                        ForEach(entries.indices, id: \.self) { i in
                            Button {
                                jump(to: i)
                            } label: {
                                let t = "\(i + 1). \(entries[i].song.title)" + (activeKey(i).map { " · \(Song.shortKey($0))" } ?? "")
                                if i == index { Label(t, systemImage: "checkmark") } else { Text(t) }
                            }
                        }
                    } label: {
                        Label("\(index + 1) of \(entries.count)", systemImage: "list.bullet")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color(white: 0.96))
                    }
                    .accessibilityLabel("Song \(index + 1) of \(entries.count). Jump to a song")
                    Button { if index < entries.count - 1 { jump(to: index + 1) } } label: { Image(systemName: "chevron.right") }
                        .disabled(index >= entries.count - 1).accessibilityLabel("Next song")
                }
                .buttonStyle(.plain)
                .font(.caption)
            }
            if count > 1 {
                HStack(spacing: 4) {
                    ForEach(0..<count, id: \.self) { i in
                        Circle().fill(i == min(page, count - 1) ? Theme.accentLight : Theme.border).frame(width: 6, height: 6)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Page \(min(page, count - 1) + 1) of \(count)")
                Text("\(min(page, count - 1) + 1) / \(count)").font(.caption2).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            if !arrangement.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(Array(arrangement.enumerated()), id: \.offset) { _, a in
                            Text(a).font(.caption.weight(.semibold))
                                .padding(.horizontal, 6).frame(height: 20)
                                .foregroundStyle(Theme.accentLight)
                                .background(Theme.accent.opacity(0.2), in: RoundedRectangle(cornerRadius: 4))
                        }
                    }
                }
                .frame(maxWidth: sizeClass == .regular ? 520 : 200)
                .fixedSize(horizontal: true, vertical: false)
                .accessibilityLabel("Song structure: \(arrangement.joined(separator: ", "))")
            }
        }
        .padding(.horizontal, 12).frame(height: 34)
        .foregroundStyle(Theme.muted)
        .background(Theme.panel)
    }

    /// "Verse 1" → V1, "Chorus" → C, "Pre-Chorus 2" → PC2 (abbreviateLabel on the web).
    static func abbreviate(_ label: String) -> String {
        let abbrev = ["verse": "V", "chorus": "C", "pre-chorus": "PC", "prechorus": "PC", "pre chorus": "PC", "bridge": "B",
                      "intro": "I", "outro": "O", "tag": "T", "interlude": "Int", "instrumental": "Inst", "refrain": "R",
                      "ending": "E", "turnaround": "TA", "vamp": "Vamp", "coda": "Coda"]
        let t = label.trimmingCharacters(in: .whitespaces)
        var base = t, num = ""
        if let m = t.wholeMatch(of: #/^(.*?)\s*(\d+)?$/#) {
            base = String(m.1)
            num = m.2.map(String.init) ?? ""
        }
        base = base.trimmingCharacters(in: .whitespaces).lowercased()
        if let a = abbrev[base] { return a + num }
        let words = base.split(whereSeparator: { $0 == " " || $0 == "-" })
        let short = words.count > 1 ? words.compactMap(\.first).map(String.init).joined() : String(base.prefix(3))
        return short.uppercased() + num
    }
}
