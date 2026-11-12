import SwiftUI
import PhotosUI
import PDFKit
import UniformTypeIdentifiers
import Supabase

/// A file in the team's Content Library (media_items): an image, or a presentation (a PDF or
/// slide deck saved as one image per page).
struct MediaItem: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var type: String
    var url: String?
    var storagePath: String?
    var fileSize: Int?
    var metadata: JSONObject?

    enum CodingKeys: String, CodingKey {
        case id, name, type, url, metadata
        case storagePath = "storage_path"
        case fileSize = "file_size"
    }

    static let columns = "id,name,type,url,storage_path,file_size,metadata"

    /// Every page as { url, storage_path }.
    var pages: [(url: String, path: String)] {
        if let images = metadata?["images"]?.arrayValue, !images.isEmpty {
            return images.compactMap { v in
                guard let o = v.objectValue, let u = o["url"]?.stringValue else { return nil }
                return (u, o["storage_path"]?.stringValue ?? "")
            }
        }
        if let url { return [(url, storagePath ?? "")] }
        return []
    }

    /// The set item content the web app uses for library files (lib/contentLibrary.js).
    var setItemContent: JSONObject {
        var c: JSONObject = [:]
        c["media_id"] = .string(id.uuidString.lowercased())
        c["media_name"] = .string(name)
        c["media_category"] = .string(type == "presentation" ? "presentation" : "image")
        c["images"] = .array(pages.map { p in
            var o: JSONObject = [:]
            o["url"] = .string(p.url)
            o["storage_path"] = .string(p.path)
            return .object(o)
        })
        return c
    }
}

private struct NewMediaItem: Encodable {
    let user_id: UUID
    let church_id: UUID
    let name: String
    let type: String
    let storage_path: String
    let url: String
    let file_size: Int
    let mime_type: String
    let metadata: JSONObject
}

/// The team's Content Library. Add photos or PDFs (each PDF page becomes a slide image), delete
/// files, and — when `onPick` is set — choose one to add to a set.
struct MediaLibraryView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onPick: ((MediaItem) -> Void)? = nil

    @State private var items: [MediaItem] = []
    @State private var loading = true
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var showPDFImporter = false
    @State private var progress: String?
    @State private var error: String?

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private let columns = [GridItem(.adaptive(minimum: 170), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let progress {
                    ProgressView(progress).padding()
                }
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(items) { item in tile(item) }
                }
                .padding()
            }
            .overlay {
                if loading && items.isEmpty { ProgressView() }
                else if !loading && items.isEmpty {
                    ContentUnavailableView("No media yet", systemImage: "photo.on.rectangle",
                                           description: Text("Add photos, or PDFs exported from PowerPoint or Keynote."))
                }
            }
            .navigationTitle(onPick == nil ? "Media" : "Add Media")
            .toolbar {
                if onPick != nil {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
                if canEdit {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            PhotosPicker(selection: $photoSelection, maxSelectionCount: 20, matching: .images) {
                                Label("Photos", systemImage: "photo")
                            }
                            Button("PDF (slides)", systemImage: "doc.richtext") { showPDFImporter = true }
                        } label: {
                            Label("Add", systemImage: "plus")
                        }
                        .disabled(progress != nil)
                    }
                }
            }
            .onChange(of: photoSelection) { _, picked in
                guard !picked.isEmpty else { return }
                Task { await addPhotos(picked); photoSelection = [] }
            }
            .fileImporter(isPresented: $showPDFImporter, allowedContentTypes: [.pdf], allowsMultipleSelection: true) { result in
                if case .success(let urls) = result { Task { await addPDFs(urls) } }
            }
            .alert("Couldn't add media", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: { Text(error ?? "") }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func tile(_ item: MediaItem) -> some View {
        Button {
            if let onPick { onPick(item); dismiss() }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                AsyncImage(url: URL(string: item.pages.first?.url ?? "")) { phase in
                    if let img = phase.image { img.resizable().scaledToFill() } else { Color.black.overlay(ProgressView()) }
                }
                .frame(height: 100)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(item.name).font(.subheadline).lineLimit(1)
                Text(item.pages.count > 1 ? "\(item.pages.count) slides" : "Image").font(.caption).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
        .contextMenu {
            if canEdit {
                Button("Delete", systemImage: "trash", role: .destructive) { Task { await delete(item) } }
            }
        }
    }

    // MARK: Loading, adding, deleting

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        defer { loading = false }
        items = (try? await supabase.from("media_items").select(MediaItem.columns)
            .eq("church_id", value: team.id)
            .in("type", values: ["image", "presentation"])
            .order("created_at", ascending: false)
            .execute().value) ?? items
    }

    private func addPhotos(_ picked: [PhotosPickerItem]) async {
        var n = 0
        for item in picked {
            n += 1
            progress = "Adding photo \(n) of \(picked.count)…"
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data), let jpeg = Self.jpeg(image) else { continue }
            await save(name: "Photo \(Date.now.formatted(date: .abbreviated, time: .shortened))", pages: [jpeg], source: "Photos")
        }
        progress = nil
        await load()
    }

    private func addPDFs(_ urls: [URL]) async {
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard let doc = PDFDocument(url: url) else { error = "Couldn't open \(url.lastPathComponent)."; continue }
            var pages: [Data] = []
            for i in 0..<min(doc.pageCount, 80) {
                progress = "Reading \(url.lastPathComponent): page \(i + 1) of \(doc.pageCount)…"
                guard let page = doc.page(at: i) else { continue }
                let box = page.bounds(for: .mediaBox)
                let scale = 1920 / max(box.width, 1)
                let image = page.thumbnail(of: CGSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
                if let jpeg = Self.jpeg(image) { pages.append(jpeg) }
            }
            await save(name: url.deletingPathExtension().lastPathComponent, pages: pages, source: url.lastPathComponent)
        }
        progress = nil
        await load()
    }

    private func save(name: String, pages: [Data], source: String) async {
        guard !pages.isEmpty, let team = session.currentTeam, let user = session.user else { return }
        let adding = pages.reduce(0) { $0 + $1.count }
        let used = items.reduce(0) { $0 + ($1.fileSize ?? 0) }
        let limit = Self.storageLimit(team.plan)
        if used + adding > limit {
            error = "Your Content Library is full (\(Self.mb(used)) of \(Self.mb(limit))). Delete files to make room, or upgrade your plan."
            return
        }
        let folder = UUID().uuidString.lowercased()
        var uploaded: [(url: String, path: String)] = []
        do {
            for (i, data) in pages.enumerated() {
                progress = "Uploading \(name): \(i + 1) of \(pages.count)…"
                let path = "\(user.id.uuidString.lowercased())/content/\(folder)/\(String(format: "%03d", i + 1)).jpg"
                try await supabase.storage.from("media").upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
                let url = try supabase.storage.from("media").getPublicURL(path: path)
                uploaded.append((url.absoluteString, path))
            }
            var meta: JSONObject = ["source": .string(source)]
            if uploaded.count > 1 {
                meta["pages"] = .integer(uploaded.count)
                meta["images"] = .array(uploaded.map { p in .object(["url": .string(p.url), "storage_path": .string(p.path)]) })
            }
            let row = NewMediaItem(user_id: user.id, church_id: team.id, name: name,
                                   type: uploaded.count > 1 ? "presentation" : "image",
                                   storage_path: uploaded[0].path, url: uploaded[0].url,
                                   file_size: adding, mime_type: "image/jpeg", metadata: meta)
            try await supabase.from("media_items").insert(row).execute()
        } catch {
            if !uploaded.isEmpty { _ = try? await supabase.storage.from("media").remove(paths: uploaded.map(\.path)) }
            self.error = error.localizedDescription
        }
    }

    private func delete(_ item: MediaItem) async {
        let paths = Array(Set(item.pages.map(\.path) + [item.storagePath ?? ""]).filter { !$0.isEmpty })
        do {
            if !paths.isEmpty { _ = try await supabase.storage.from("media").remove(paths: paths) }
            try await supabase.from("media_items").delete().eq("id", value: item.id).execute()
            items.removeAll { $0.id == item.id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Helpers

    /// JPEG at most 1920 px wide — the size the web app saves slides at.
    static func jpeg(_ image: UIImage) -> Data? {
        let scale = min(1, 1920 / max(image.size.width, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
    }

    static func storageLimit(_ plan: String?) -> Int {
        switch plan {
        case "ultimate": return 5_000 * 1_048_576
        case "pro": return 1_024 * 1_048_576
        case "solo": return 500 * 1_048_576
        default: return 100 * 1_048_576
        }
    }

    static func mb(_ bytes: Int) -> String { ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file) }
}
