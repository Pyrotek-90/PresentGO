import SwiftUI
import UniformTypeIdentifiers

/// Import many chord charts at once (ChordPro, text or text-based PDFs — e.g. a folder of
/// SongSelect or PraiseCharts downloads). The API reads each file and saves it as a song;
/// songs already in the library (same title) are skipped.
struct BulkImportView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let existingTitles: Set<String>

    @State private var showPicker = true
    @State private var rows: [Row] = []
    @State private var running = false

    struct Row: Identifiable {
        let id = UUID()
        let name: String
        var status: Status
        enum Status { case waiting, working, saved(String), skipped(String), failed(String) }
    }

    private static let types: [UTType] = [.pdf, .plainText, .text] +
        ["cho", "chordpro", "chopro", "crd"].compactMap { UTType(filenameExtension: $0) }

    var body: some View {
        NavigationStack {
            List(rows) { row in
                HStack(spacing: 12) {
                    icon(row.status)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).lineLimit(1)
                        if let note = note(row.status) { Text(note).font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            .overlay {
                if rows.isEmpty {
                    ContentUnavailableView {
                        Label("Import Charts", systemImage: "square.and.arrow.down.on.square")
                    } description: {
                        Text("Choose ChordPro, text or PDF chord charts — as many as you like.")
                    } actions: {
                        Button("Choose Files") { showPicker = true }.buttonStyle(.borderedProminent)
                    }
                }
            }
            .navigationTitle("Import Charts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.disabled(running)
                }
            }
            .fileImporter(isPresented: $showPicker, allowedContentTypes: Self.types, allowsMultipleSelection: true) { result in
                if case .success(let urls) = result { Task { await run(urls) } }
            }
            .interactiveDismissDisabled(running)
        }
    }

    @ViewBuilder private func icon(_ s: Row.Status) -> some View {
        switch s {
        case .waiting: Image(systemName: "clock").foregroundStyle(.secondary)
        case .working: ProgressView()
        case .saved: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .skipped: Image(systemName: "arrow.uturn.right.circle").foregroundStyle(.secondary)
        case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        }
    }

    private func note(_ s: Row.Status) -> String? {
        switch s {
        case .saved(let t), .skipped(let t), .failed(let t): return t
        default: return nil
        }
    }

    private func run(_ urls: [URL]) async {
        running = true
        defer { running = false; NotificationCenter.default.post(name: .songsChanged, object: nil) }
        rows = urls.map { Row(name: $0.lastPathComponent, status: .waiting) }
        var titles = Set(existingTitles.map { $0.lowercased() })
        for (i, url) in urls.enumerated() {
            rows[i].status = .working
            rows[i].status = await importOne(url, titles: &titles)
        }
    }

    private func importOne(_ url: URL, titles: inout Set<String>) async -> Row.Status {
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        guard let team = session.currentTeam, let data = try? Data(contentsOf: url) else { return .failed("Couldn't open the file.") }
        do {
            let reply: ImportReply
            if url.pathExtension.lowercased() == "pdf" {
                reply = try await StaffListAPI.shared.upload("songs/import-pdf", data: data, query: ["filename": url.lastPathComponent], as: ImportReply.self)
            } else {
                reply = try await StaffListAPI.shared.post("songs/parse", ParseRequest(text: String(decoding: data, as: UTF8.self), filename: url.lastPathComponent), as: ImportReply.self)
            }
            guard reply.status == "ready", let s = reply.song, let title = s.title, !title.isEmpty else {
                return .failed(reply.message ?? "Couldn't read this file.")
            }
            if titles.contains(title.lowercased()) { return .skipped("\(title) is already in the library.") }
            var meta: JSONObject = [:]
            meta["key"] = .string(s.key ?? "")
            meta["bpm"] = .string(s.bpm?.value ?? "")
            meta["author"] = .string(s.author ?? "")
            meta["copyright"] = .string(s.copyright ?? "")
            meta["import_source"] = .string(url.pathExtension.lowercased() == "pdf" ? "pdf" : "chordpro")
            meta["import_file"] = .string(url.lastPathComponent)
            let request = SongSaveRequest(id: nil, church_id: team.id, title: title, artist: s.artist ?? "",
                                          ccli_number: s.ccli_number ?? "", raw_lyrics: s.raw_lyrics ?? "",
                                          lines_per_slide: 2, chord_chart: s.chord_chart ?? "", arrangement: nil, metadata: meta)
            _ = try await StaffListAPI.shared.post("songs/save", request, as: SongSaveReply.self)
            titles.insert(title.lowercased())
            return .saved(title + ((reply.message ?? "").isEmpty ? "" : " — \(reply.message!)"))
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
