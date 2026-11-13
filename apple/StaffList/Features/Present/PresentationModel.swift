import Foundation
import Observation
import Supabase

/// The presentation that is running: its slides, the current slide and whether the screen is
/// blanked. One at a time, shared by the presenter screen on the iPad and the TV window.
///
/// It also keeps the web app in step through the same Supabase Realtime channel the web
/// Controller and Present screen use (`presentgo-<set id>`):
///   control: { type: GOTO | NEXT | PREV | BLANK | SYNC, index?, blank?, id }
///   status:  { type: HELLO | STATUS, current?, blank?, total?, id }
@MainActor
@Observable
final class PresentationModel {
    static let shared = PresentationModel()

    private(set) var setID: UUID?
    private(set) var title = ""
    private(set) var slides: [PresentSlide] = []
    private(set) var index = 0
    private(set) var blank = false
    private(set) var offline = false
    private(set) var connected = false
    /// True while a presentation is open (the TV shows slides only then; otherwise it mirrors).
    private(set) var active = false

    private var channel: RealtimeChannelV2?
    private var listeners: [Task<Void, Never>] = []
    private var seen: [String] = []

    var current: PresentSlide? { slides.indices.contains(index) ? slides[index] : nil }
    var next: PresentSlide? { slides.indices.contains(index + 1) ? slides[index + 1] : nil }

    /// One run-order entry: a set item and the slides it produced.
    struct Group: Identifiable, Hashable {
        let id: String          // item id
        let title: String
        let type: String
        let range: Range<Int>
        var firstIndex: Int { range.lowerBound }
    }

    private(set) var groups: [Group] = []
    private var fits: [String: SlideFit] = [:]
    /// Loop: cycle the current item's slides every `loopSeconds` (paused while blanked).
    var looping = false { didSet { restartLoop() } }
    static let loopSeconds: Double = 6
    private var loopTask: Task<Void, Never>?

    func fit(for slide: PresentSlide?) -> SlideFit? {
        slide.flatMap { fits[$0.itemId ?? ""] }
    }

    var currentGroup: Group? { groups.first { $0.range.contains(index) } }

    /// The current song's sections in order, with repeats (V1 C V2 C B C): label and slide index.
    var currentSections: [(label: String, index: Int)] {
        guard let g = currentGroup else { return [] }
        return g.range.compactMap { i in slides[i].label.map { ($0, i) } }
    }

    private func buildGroups() {
        var out: [Group] = []
        var start = 0
        for i in slides.indices where i == slides.count - 1 || slides[i + 1].itemId != slides[i].itemId {
            let first = slides[start]
            out.append(Group(id: first.itemId ?? "item-\(start)", title: first.itemTitle ?? first.type.capitalized,
                             type: first.type, range: start..<(i + 1)))
            start = i + 1
        }
        groups = out
        fits = Dictionary(uniqueKeysWithValues: out.map { g in (g.id, SlideFit(Array(slides[g.range]))) })
    }

    private func restartLoop() {
        loopTask?.cancel()
        guard looping else { return }
        loopTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Self.loopSeconds))
                guard !Task.isCancelled, let self else { return }
                guard !self.blank, let g = self.currentGroup, g.range.count > 1 else { continue }
                self.go(to: self.index + 1 < g.range.upperBound ? self.index + 1 : g.range.lowerBound, fromLoop: true)
            }
        }
    }

    // MARK: Start and stop

    func start(_ presentation: SetPresentation, offline: Bool) async {
        await stop()
        setID = presentation.set.id
        title = presentation.set.name
        slides = presentation.slides
        buildGroups()
        looping = false
        index = 0
        blank = false
        self.offline = offline
        active = true
        NotificationCenter.default.post(name: .presentationChanged, object: nil)
        await connect()
    }

    func stop() async {
        looping = false
        listeners.forEach { $0.cancel() }
        listeners = []
        if let channel { await supabase.removeChannel(channel) }
        channel = nil
        connected = false
        active = false
        NotificationCenter.default.post(name: .presentationChanged, object: nil)
    }

    // MARK: Moving (from this iPad)

    func go(to i: Int, fromLoop: Bool = false) {
        guard !slides.isEmpty else { return }
        index = min(max(i, 0), slides.count - 1)
        if !fromLoop && looping { restartLoop() }   // moving by hand carries on looping from here
        send(event: "control", ["type": .string("GOTO"), "index": .integer(index)])
        sendStatus()
    }

    func nextSlide() { go(to: index + 1) }
    func previousSlide() { go(to: index - 1) }

    func toggleBlank() {
        blank.toggle()
        send(event: "control", ["type": .string("SYNC"), "index": .integer(index), "blank": .bool(blank)])
        sendStatus()
    }

    /// End: tells the web Present screen to close, like the web Controller's End.
    func end() async {
        send(event: "control", ["type": .string("EXIT")])
        try? await Task.sleep(for: .milliseconds(200))
        await stop()
    }

    // MARK: Realtime

    private func connect() async {
        guard let setID else { return }
        let ch = supabase.channel("presentgo-\(setID.uuidString.lowercased())")
        let controls = ch.broadcastStream(event: "control")
        let statuses = ch.broadcastStream(event: "status")
        channel = ch
        listeners.append(Task { [weak self] in
            for await message in controls { self?.receiveControl(Self.payload(message)) }
        })
        listeners.append(Task { [weak self] in
            for await message in statuses { self?.receiveStatus(Self.payload(message)) }
        })
        do {
            try await ch.subscribeWithError()
            connected = true
            // Like the web Present screen: say hello so an open web Controller syncs us to its slide.
            send(event: "status", ["type": .string("HELLO")])
        } catch {
            connected = false
        }
    }

    private static func payload(_ message: JSONObject) -> JSONObject {
        message["payload"]?.objectValue ?? message
    }

    private func isNew(_ p: JSONObject) -> Bool {
        guard let id = p["id"]?.stringValue else { return true }
        if seen.contains(id) { return false }
        seen.append(id)
        if seen.count > 200 { seen.removeFirst(50) }
        return true
    }

    private func receiveControl(_ p: JSONObject) {
        guard isNew(p), let type = p["type"]?.stringValue else { return }
        switch type {
        case "GOTO": if let i = p["index"]?.intValue { index = clamp(i) }
        case "NEXT": index = clamp(index + 1)
        case "PREV": index = clamp(index - 1)
        case "BLANK": blank.toggle()
        case "SYNC":
            if let i = p["index"]?.intValue { index = clamp(i) }
            if case .bool(let b)? = p["blank"] { blank = b }
        default: break
        }
    }

    private func receiveStatus(_ p: JSONObject) {
        guard isNew(p), let type = p["type"]?.stringValue else { return }
        if type == "HELLO" {
            // Another screen opened: bring it to where we are.
            send(event: "control", ["type": .string("SYNC"), "index": .integer(index), "blank": .bool(blank)])
        } else if type == "STATUS" {
            if let i = p["current"]?.intValue { index = clamp(i) }
            if case .bool(let b)? = p["blank"] { blank = b }
        }
    }

    private func sendStatus() {
        send(event: "status", ["type": .string("STATUS"), "current": .integer(index), "blank": .bool(blank), "total": .integer(slides.count)])
    }

    private func send(event: String, _ payload: JSONObject) {
        guard let channel, connected else { return }
        var message = payload
        let id = UUID().uuidString.lowercased()
        message["id"] = .string(id)
        seen.append(id)
        Task { await channel.broadcast(event: event, message: message) }
    }

    private func clamp(_ i: Int) -> Int { slides.isEmpty ? 0 : min(max(i, 0), slides.count - 1) }
}

extension Notification.Name {
    static let presentationChanged = Notification.Name("StaffListPresentationChanged")
}
