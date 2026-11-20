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
    var folderId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, name, type, url, metadata
        case storagePath = "storage_path"
        case fileSize = "file_size"
        case folderId = "folder_id"
    }

    static let columns = "id,name,type,url,storage_path,file_size,metadata,folder_id"

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
    let folder_id: UUID?
}

/// A folder in the Content Library (media_folders); folders can be nested.
struct MediaFolder: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var parentId: UUID?
    enum CodingKeys: String, CodingKey { case id, name; case parentId = "parent_id" }
}

private struct NewMediaFolder: Encodable {
    let user_id: UUID
    let church_id: UUID
    let name: String
    let parent_id: UUID?
}

/// The team's Content Library, like the web's (src/pages/ContentLibrary.jsx): folders (nested),
/// files as a grid of previews or a list, search across everything, and how much space is used.
/// Add photos or files (PDFs become one slide per page; images one slide). Tap a file to rename,
/// move or delete it — or, when `onPick` is set, to choose it for a set.
struct MediaLibraryView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    var onPick: ((MediaItem) -> Void)? = nil

    @State private var items: [MediaItem] = []
    @State private var folders: [MediaFolder] = []
    @State private var folderID: UUID?
    @State private var search = ""
    @State private var searchShown = false
    @AppStorage("mediaView") private var viewMode = "grid"
    @State private var loading = true
    @State private var photoSelection: [PhotosPickerItem] = []
    @State private var showPhotos = false
    @State private var showFiles = false
    @State private var progress: String?
    @State private var error: String?
    @State private var opened: MediaItem?
    @State private var newFolder = false
    @State private var folderName = ""
    @State private var renamingFolder: MediaFolder?
    @State private var deletingFolder: MediaFolder?

    private var canEdit: Bool { session.currentTeam?.canEdit ?? false }
    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    private var query: String { search.trimmingCharacters(in: .whitespaces).lowercased() }
    private var shownFolders: [MediaFolder] {
        guard query.isEmpty else { return folders.filter { $0.name.lowercased().contains(query) } }
        return folders.filter { $0.parentId == folderID }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    private var shownItems: [MediaItem] {
        guard query.isEmpty else { return items.filter { $0.name.lowercased().contains(query) } }
        return items.filter { $0.folderId == folderID }
    }
    private var path: [MediaFolder] {
        var out: [MediaFolder] = []
        var id = folderID
        while let i = id, let f = folders.first(where: { $0.id == i }) { out.insert(f, at: 0); id = f.parentId }
        return out
    }
    private var used: Int { items.reduce(0) { $0 + ($1.fileSize ?? 0) } }
    private var limit: Int { Self.storageLimit(session.currentTeam?.plan) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if query.isEmpty { breadcrumbs }
                    if let progress { ProgressView(progress).frame(maxWidth: .infinity) }
                    if viewMode == "grid" { grid } else { list }
                    // Storage, file and folder counts at the end, after the folders and files.
                    usage.padding(.top, 12)
                }
                .padding()
            }
            .overlay {
                if loading && items.isEmpty && folders.isEmpty { ProgressView() }
                else if !loading && shownItems.isEmpty && shownFolders.isEmpty {
                    if !query.isEmpty { ContentUnavailableView.search(text: search) }
                    else {
                        ContentUnavailableView(folderID == nil ? "No media yet" : "This folder is empty", systemImage: "photo.on.rectangle",
                                               description: Text("Add photos, or PDFs exported from PowerPoint or Keynote."))
                    }
                }
            }
            .navigationTitle(onPick == nil ? "Media" : "Add Media")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, isPresented: $searchShown, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search files and folders")
            .toolbar { toolbar }
            .photosPicker(isPresented: $showPhotos, selection: $photoSelection, maxSelectionCount: 20, matching: .images)
            .onChange(of: photoSelection) { _, picked in
                guard !picked.isEmpty else { return }
                Task { await addPhotos(picked); photoSelection = [] }
            }
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image], allowsMultipleSelection: true) { result in
                if case .success(let urls) = result { Task { await addFiles(urls) } }
            }
            .sheet(item: $opened) { item in
                MediaFileSheet(item: item, folders: folders, canEdit: canEdit) { updated in
                    if let i = items.firstIndex(where: { $0.id == updated.id }) { items[i] = updated }
                } onDelete: {
                    Task { await delete(item) }
                }
            }
            .alert("New Folder", isPresented: $newFolder) {
                TextField("Name", text: $folderName)
                Button("Cancel", role: .cancel) {}
                Button("Create") { Task { await createFolder() } }
            }
            .alert("Rename Folder", isPresented: Binding(get: { renamingFolder != nil }, set: { if !$0 { renamingFolder = nil } })) {
                TextField("Name", text: $folderName)
                Button("Cancel", role: .cancel) {}
                Button("Save") { Task { await renameFolder() } }
            }
            .confirmationDialog("Delete \(deletingFolder?.name ?? "folder")?", isPresented: Binding(get: { deletingFolder != nil }, set: { if !$0 { deletingFolder = nil } }), titleVisibility: .visible) {
                Button("Delete Folder", role: .destructive) { Task { await deleteFolder() } }
            } message: {
                Text("Its files and folders move up one level; nothing is deleted.")
            }
            .alert("Something went wrong", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: { Text(error ?? "") }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if onPick != nil {
            ToolbarItem(placement: .cancellationAction) { HeaderIconButton("Cancel", systemImage: "xmark") { dismiss() } }.headerIconItem()
        }
        ToolbarItem(placement: .primaryAction) {
            HeaderIconButton("Search", systemImage: "magnifyingglass") { searchShown = true }
        }
        .headerIconItem()
        ToolbarItem(placement: .primaryAction) {
            Button { viewMode = viewMode == "grid" ? "list" : "grid" } label: {
                HeaderIconLabel(systemImage: viewMode == "grid" ? "list.bullet" : "square.grid.2x2")
            }
            .buttonStyle(.plain)
            .accessibilityLabel(viewMode == "grid" ? "Show as a list" : "Show previews")
        }
        .headerIconItem()
        if canEdit {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Photos", systemImage: "photo.on.rectangle") { showPhotos = true }
                    Button("Files (PDF or image)", systemImage: "folder") { showFiles = true }
                    Divider()
                    Button("New Folder", systemImage: "folder.badge.plus") { folderName = ""; newFolder = true }
                } label: {
                    HeaderIconLabel(systemImage: "plus")
                }
                .headerMenuStyle()
                .accessibilityLabel("Add")
                .disabled(progress != nil)
            }
            .headerIconItem()
        }
    }

    // MARK: Header rows

    /// "123 MB of 1 GB · 42 files · 6 folders" with a bar.
    private var usage: some View {
        VStack(alignment: .leading, spacing: 4) {
            ProgressView(value: Double(min(used, limit)), total: Double(max(limit, 1)))
                .tint(Double(used) > Double(limit) * 0.9 ? .orange : Theme.accentLight)
            Text("\(Self.mb(used)) of \(Self.mb(limit)) · \(items.count) file\(items.count == 1 ? "" : "s") · \(folders.count) folder\(folders.count == 1 ? "" : "s")")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var breadcrumbs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                Button("Library") { folderID = nil }
                    .fontWeight(folderID == nil ? .semibold : .regular)
                    .foregroundStyle(folderID == nil ? Color.primary : Theme.accentLight)
                ForEach(path) { f in
                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.secondary)
                    Button(f.name) { folderID = f.id }
                        .fontWeight(f.id == folderID ? .semibold : .regular)
                        .foregroundStyle(f.id == folderID ? Color.primary : Theme.accentLight)
                }
            }
            .font(.subheadline)
            .buttonStyle(.plain)
        }
    }

    // MARK: Grid and list

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(shownFolders) { f in
                Button { open(f) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Image(systemName: "folder.fill").font(.system(size: 40)).foregroundStyle(Theme.accentLight)
                            .frame(maxWidth: .infinity, minHeight: 90)
                            .background(Color.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                        Text(f.name).font(.subheadline).lineLimit(1)
                        Text(folderSummary(f)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
                .contextMenu { folderMenu(f) }
            }
            ForEach(shownItems) { item in
                Button { tap(item) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        thumb(item).frame(height: 90).frame(maxWidth: .infinity)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        Text(item.name).font(.subheadline).lineLimit(1)
                        Text(fileSummary(item)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var list: some View {
        LazyVStack(spacing: 0) {
            ForEach(shownFolders) { f in
                Button { open(f) } label: {
                    row(icon: AnyView(Image(systemName: "folder.fill").font(.title3).foregroundStyle(Theme.accentLight)),
                        title: f.name, detail: folderSummary(f), chevron: true)
                }
                .buttonStyle(.plain)
                .contextMenu { folderMenu(f) }
                Divider()
            }
            ForEach(shownItems) { item in
                Button { tap(item) } label: {
                    row(icon: AnyView(thumb(item).frame(width: 64, height: 36).clipShape(RoundedRectangle(cornerRadius: 4))),
                        title: item.name, detail: fileSummary(item), chevron: onPick == nil)
                }
                .buttonStyle(.plain)
                Divider()
            }
        }
    }

    private func row(icon: AnyView, title: String, detail: String, chevron: Bool) -> some View {
        HStack(spacing: 12) {
            icon.frame(width: 64)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if chevron { Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary) }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }

    private func thumb(_ item: MediaItem) -> some View {
        AsyncImage(url: URL(string: item.pages.first?.url ?? "")) { phase in
            if let img = phase.image { img.resizable().scaledToFill() } else { Color.black.overlay(ProgressView()) }
        }
    }

    @ViewBuilder private func folderMenu(_ f: MediaFolder) -> some View {
        if canEdit {
            Button("Rename", systemImage: "pencil") { folderName = f.name; renamingFolder = f }
            Button("Delete Folder", systemImage: "trash", role: .destructive) { deletingFolder = f }
        }
    }

    private func folderSummary(_ f: MediaFolder) -> String {
        let n = items.filter { $0.folderId == f.id }.count
        let sub = folders.filter { $0.parentId == f.id }.count
        return [n > 0 ? "\(n) file\(n == 1 ? "" : "s")" : nil, sub > 0 ? "\(sub) folder\(sub == 1 ? "" : "s")" : nil]
            .compactMap { $0 }.joined(separator: " · ").ifEmpty("Empty")
    }

    private func fileSummary(_ item: MediaItem) -> String {
        var parts = [item.pages.count > 1 ? "PDF · \(item.pages.count) slides" : "Image"]
        if let s = item.fileSize, s > 0 { parts.append(Self.mb(s)) }
        if !query.isEmpty, let fid = item.folderId, let f = folders.first(where: { $0.id == fid }) { parts.append(f.name) }
        return parts.joined(separator: " · ")
    }

    private func open(_ f: MediaFolder) { search = ""; folderID = f.id }

    private func tap(_ item: MediaItem) {
        if let onPick { onPick(item); dismiss() } else { opened = item }
    }

    // MARK: Loading, adding, deleting

    private func load() async {
        guard let team = session.currentTeam else { loading = false; return }
        defer { loading = false }
        async let i: [MediaItem] = supabase.from("media_items").select(MediaItem.columns)
            .eq("church_id", value: team.id)
            .in("type", values: ["image", "presentation"])
            .order("created_at", ascending: false)
            .execute().value
        async let f: [MediaFolder] = supabase.from("media_folders").select("id,name,parent_id")
            .eq("church_id", value: team.id).order("name").execute().value
        if let list = try? await i { items = list }
        if let list = try? await f { folders = list }
        if let id = folderID, !folders.contains(where: { $0.id == id }) { folderID = nil }
    }

    private func createFolder() async {
        guard let team = session.currentTeam, let user = session.user else { return }
        let name = folderName.trimmingCharacters(in: .whitespaces)
        do {
            let f: MediaFolder = try await supabase.from("media_folders")
                .insert(NewMediaFolder(user_id: user.id, church_id: team.id, name: name.isEmpty ? "New Folder" : name, parent_id: folderID))
                .select("id,name,parent_id").single().execute().value
            folders.append(f)
        } catch { self.error = error.localizedDescription }
    }

    private func renameFolder() async {
        guard let f = renamingFolder else { return }
        let name = folderName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            try await supabase.from("media_folders").update(["name": name]).eq("id", value: f.id).execute()
            if let i = folders.firstIndex(where: { $0.id == f.id }) { folders[i].name = name }
        } catch { self.error = error.localizedDescription }
        renamingFolder = nil
    }

    /// Like the web: the folder's files and folders move up one level, then the folder goes.
    private func deleteFolder() async {
        guard let f = deletingFolder else { return }
        do {
            let parent: AnyJSON = f.parentId.map { .string($0.uuidString.lowercased()) } ?? .null
            try await supabase.from("media_items").update(["folder_id": parent]).eq("folder_id", value: f.id).execute()
            try await supabase.from("media_folders").update(["parent_id": parent]).eq("parent_id", value: f.id).execute()
            try await supabase.from("media_folders").delete().eq("id", value: f.id).execute()
            if folderID == f.id { folderID = f.parentId }
            await load()
        } catch { self.error = error.localizedDescription }
        deletingFolder = nil
    }

    private func addPhotos(_ picked: [PhotosPickerItem]) async {
        var n = 0
        for item in picked {
            n += 1
            progress = "Adding photo \(n) of \(picked.count)…"
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data), let jpeg = Self.jpeg(image) else {
                error = "Couldn't read photo \(n). If it's in iCloud, open it in Photos once so it downloads, then try again."
                continue
            }
            await save(name: "Photo \(Date.now.formatted(date: .abbreviated, time: .shortened))", pages: [jpeg], source: "Photos")
        }
        progress = nil
        await load()
    }

    /// PDFs (each page a slide) and image files.
    private func addFiles(_ urls: [URL]) async {
        for url in urls {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let name = url.deletingPathExtension().lastPathComponent
            if url.pathExtension.lowercased() == "pdf" {
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
                await save(name: name, pages: pages, source: url.lastPathComponent)
            } else if let data = try? Data(contentsOf: url), let image = UIImage(data: data), let jpeg = Self.jpeg(image) {
                progress = "Adding \(url.lastPathComponent)…"
                await save(name: name, pages: [jpeg], source: url.lastPathComponent)
            } else {
                error = "Couldn't read \(url.lastPathComponent)."
            }
        }
        progress = nil
        await load()
    }

    private func save(name: String, pages: [Data], source: String) async {
        guard !pages.isEmpty, let team = session.currentTeam, let user = session.user else { return }
        let adding = pages.reduce(0) { $0 + $1.count }
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
                                   file_size: adding, mime_type: "image/jpeg", metadata: meta, folder_id: folderID)
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

/// One file: preview its slides, rename it, move it to a folder, or delete it.
struct MediaFileSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var item: MediaItem
    let folders: [MediaFolder]
    let canEdit: Bool
    var onChange: (MediaItem) -> Void
    var onDelete: () -> Void

    @State private var name = ""
    @State private var folder: UUID?
    @State private var confirmDelete = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name).disabled(!canEdit)
                    if !folders.isEmpty {
                        Picker("Folder", selection: $folder) {
                            Text("Library (top level)").tag(UUID?.none)
                            ForEach(folders.sorted { pathName($0) < pathName($1) }) { f in Text(pathName(f)).tag(Optional(f.id)) }
                        }
                        .disabled(!canEdit)
                    }
                } footer: {
                    Text([item.pages.count > 1 ? "PDF · \(item.pages.count) slides" : "Image",
                          item.fileSize.map { MediaLibraryView.mb($0) }].compactMap { $0 }.joined(separator: " · "))
                }
                Section("Preview") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                        ForEach(Array(item.pages.enumerated()), id: \.offset) { i, p in
                            AsyncImage(url: URL(string: p.url)) { img in img.resizable().scaledToFit() } placeholder: { Color.black.overlay(ProgressView()) }
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .background(Color.black)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .overlay(alignment: .bottomLeading) {
                                    Text("\(i + 1)").font(.caption2).foregroundStyle(.white.opacity(0.75)).padding(4)
                                }
                        }
                    }
                    .padding(.vertical, 4)
                }
                if let error { Section { Text(error).font(.footnote).foregroundStyle(.red) } }
                if canEdit {
                    Section { Button("Delete File", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(item.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { HeaderIconButton("Cancel", systemImage: "xmark") { dismiss() } }.headerIconItem()
                if canEdit {
                    ToolbarItem(placement: .confirmationAction) {
                        if saving { ProgressView() } else {
                            HeaderTextButton("Save") { Task { await save() } }
                                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || (name == item.name && folder == item.folderId))
                        }
                    }.headerIconItem()
                }
            }
            .confirmationDialog("Delete \(item.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete File", role: .destructive) { onDelete(); dismiss() }
            } message: {
                Text("It's removed from the library. Sets that already use it keep their own copy of the slides.")
            }
            .onAppear { name = item.name; folder = item.folderId }
        }
    }

    private func pathName(_ f: MediaFolder) -> String {
        var parts = [f.name]
        var parent = f.parentId
        while let p = parent, let pf = folders.first(where: { $0.id == p }) { parts.insert(pf.name, at: 0); parent = pf.parentId }
        return parts.joined(separator: " › ")
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let n = name.trimmingCharacters(in: .whitespaces)
        do {
            var patch: JSONObject = ["name": .string(n)]
            patch["folder_id"] = folder.map { .string($0.uuidString.lowercased()) } ?? .null
            try await supabase.from("media_items").update(patch).eq("id", value: item.id).execute()
            item.name = n
            item.folderId = folder
            onChange(item)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
