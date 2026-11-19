import SwiftUI
import Supabase
import UniformTypeIdentifiers

/// What is dragged from a person in the matrix. Dropped on another set's cell, it puts them on
/// that set in that row's position (a copy: they stay on the set they came from).
struct AssignmentDrag: Codable, Transferable {
    let memberId: UUID
    let positionId: UUID

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .json)
    }
}

/// Who's serving across sets at a glance: one column per set (the last one, then the upcoming
/// ones), with its songs and the people in each position. The row labels stay put while the
/// columns scroll sideways, snapping a set at a time. Rotate the iPad to landscape to see more.
struct ScheduleMatrix: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.horizontalSizeClass) private var sizeClass
    let members: [UUID: TeamMember]
    let positions: [Position]
    /// Change this to reload (pull to refresh on the Team page).
    var reloadToken: Int = 0
    /// The selected set (highlighted; Assign works on it). Nil = the next upcoming set, like the web.
    var selectedID: UUID? = nil
    /// Tap a set's header: select it.
    var onSelect: (ServiceSet) -> Void = { _ in }
    /// Tap a set's songs: open Edit Set.
    var onOpen: (ServiceSet) -> Void

    @State private var sets: [ServiceSet] = []
    @State private var assignments: [Assignment] = []
    @State private var songs: [UUID: [String]] = [:]
    @State private var loaded = false
    @State private var failed: String?
    /// The cell a person is being dragged over ("setId-positionId"), and the result of the last drop.
    @State private var dropTarget: String?
    @State private var note: String?

    private var columnWidth: CGFloat { sizeClass == .regular ? 168 : 136 }
    private var labelWidth: CGFloat { sizeClass == .regular ? 108 : 84 }
    private let line: CGFloat = 19
    private let today = ServiceSet.dayFormatter.string(from: .now)

    // MARK: Rows

    private enum Row: Identifiable, Hashable {
        case header, songsTitle, songs, section(MatrixGroup), position(Position)
        var id: String {
            switch self {
            case .header: return "header"
            case .songsTitle: return "songsTitle"
            case .songs: return "songs"
            case .section(let g): return "section-\(g.rawValue)"
            case .position(let p): return p.id.uuidString
            }
        }
    }

    /// The matrix's groups: the behind-the-scenes roles, the singers, and the instrumentalists.
    enum MatrixGroup: String, CaseIterable {
        case production, singers, musicians
        var label: String { rawValue.capitalized }

        private static let productionWords = ["presenter", "audio", "sound", "light", "video", "camera",
            "stream", "slide", "lyric", "media", "tech", "production", "stage", "broadcast", "projection",
            "propresenter", "mix", "director", "producer", "graphics", "photo"]
        private static let singerWords = ["sing", "vocal", "voice", "choir", "bgv", "worship leader", "lead"]

        static func of(_ p: Position) -> MatrixGroup {
            switch TeamSection.of(p) {
            case .production: return .production
            case .singers: return .singers
            case .musicians: return .musicians
            case .other:
                let name = p.name.lowercased()
                if productionWords.contains(where: { name.contains($0) }) { return .production }
                if singerWords.contains(where: { name.contains($0) }) { return .singers }
                return .musicians
            }
        }

        /// Standard roles first in the web's order, then the team's own.
        static func rank(_ p: Position) -> Int {
            let order = ["presenter", "audio", "singer", "keys", "acoustic", "electric", "bass", "drums"]
            return order.firstIndex(of: p.name.lowercased()) ?? 100
        }
    }

    private func people(_ p: Position, in s: ServiceSet) -> [Assignment] {
        assignments.filter { $0.setId == s.id && $0.positionId == p.id && members[$0.memberId] != nil }
            .sorted { (members[$0.memberId]?.name ?? "") < (members[$1.memberId]?.name ?? "") }
    }

    /// Songs, then every position the team has: Production (Presenter, Audio, Lighting…),
    /// Singers, and Musicians (every instrument).
    private var rows: [Row] {
        var out: [Row] = [.header, .songsTitle, .songs]
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        for group in MatrixGroup.allCases {
            let list = positions.filter { MatrixGroup.of($0) == group }
                .sorted { (MatrixGroup.rank($0), order[$0.id] ?? 0) < (MatrixGroup.rank($1), order[$1.id] ?? 0) }
            guard !list.isEmpty else { continue }
            out.append(.section(group))
            out += list.map { .position($0) }
        }
        return out
    }

    private func height(_ row: Row) -> CGFloat {
        switch row {
        case .header: return 50
        case .songsTitle, .section: return 24
        case .songs:
            let most = sets.map { songs[$0.id]?.count ?? 0 }.max() ?? 0
            return CGFloat(max(most, 1)) * line + 10
        case .position(let p):
            let most = sets.map { people(p, in: $0).count }.max() ?? 0
            return CGFloat(max(most, 1)) * line + 10
        }
    }

    // MARK: Body

    var body: some View {
        Group {
            if !loaded {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if let failed {
                Text(failed).font(.footnote).foregroundStyle(.secondary).padding()
            } else if sets.isEmpty {
                Text("No dated sets yet. Give a set a date to see who's serving.")
                    .font(.footnote).foregroundStyle(.secondary).padding()
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    matrix
                    legend
                    if let note {
                        Text(note).font(.caption2).foregroundStyle(.secondary)
                            .padding(.horizontal, 10).padding(.bottom, 8)
                    }
                }
            }
        }
        .task(id: reloadToken) { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .setsChanged)) { _ in
            Task { await load() }
        }
    }

    private var matrix: some View {
        let rows = rows
        return HStack(alignment: .top, spacing: 0) {
            // Row labels, pinned on the left.
            VStack(alignment: .leading, spacing: 0) {
                ForEach(rows) { row in
                    label(row)
                        .frame(width: labelWidth, height: height(row), alignment: .topLeading)
                        .background(isBand(row) ? Color.secondary.opacity(0.1) : .clear)
                        .overlay(alignment: .bottom) { rule }
                }
            }
            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.35)).frame(width: 1) }

            // One column per set, scrolling sideways a set at a time.
            ScrollView(.horizontal) {
                LazyHStack(spacing: 0) {
                    ForEach(sets) { s in
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rows) { row in
                                droppable(row, s) {
                                    tappable(row, s) {
                                        cell(row, s)
                                            .frame(width: columnWidth, height: height(row), alignment: .topLeading)
                                            .background(isBand(row) ? Color.secondary.opacity(0.1) : .clear)
                                            .overlay(alignment: .bottom) { rule }
                                    }
                                }
                            }
                        }
                        .background(isSelected(s) ? Theme.accent.opacity(0.15) : isNext(s) ? Theme.accent.opacity(0.07) : .clear)
                        .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.2)).frame(width: 0.5) }
                        .overlay { if isSelected(s) { Rectangle().stroke(Theme.accent.opacity(0.6), lineWidth: 1) } }
                        .opacity(isPast(s) && !isSelected(s) ? 0.6 : 1)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.visible)
        }
    }

    /// The header selects the set; the songs open Edit Set; the people cells are left for dragging.
    @ViewBuilder
    private func tappable<V: View>(_ row: Row, _ s: ServiceSet, @ViewBuilder _ content: () -> V) -> some View {
        switch row {
        case .header:
            Button { onSelect(s) } label: { content().contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityLabel("\(s.name), \(when(s))\(isSelected(s) ? ", selected" : "")")
                .accessibilityHint("Selects this set for Assign")
                .accessibilityAddTraits(isSelected(s) ? .isSelected : [])
        case .songs:
            Button { onOpen(s) } label: { content().contentShape(Rectangle()) }
                .buttonStyle(.plain)
                .accessibilityHint("Opens Edit Set")
        default:
            content()
        }
    }

    /// The selected set, or the next upcoming one (else the last), as on the web.
    private var effectiveSelectedID: UUID? {
        if let id = selectedID, sets.contains(where: { $0.id == id }) { return id }
        return (sets.first { !isPast($0) } ?? sets.last)?.id
    }
    private func isSelected(_ s: ServiceSet) -> Bool { s.id == effectiveSelectedID }

    /// A position cell accepts a dragged person: they're added to this set in this row's position.
    @ViewBuilder
    private func droppable<V: View>(_ row: Row, _ s: ServiceSet, @ViewBuilder _ content: () -> V) -> some View {
        if case .position(let p) = row {
            let key = "\(s.id)-\(p.id)"
            content()
                .background(dropTarget == key ? Theme.accent.opacity(0.3) : Color.clear)
                .dropDestination(for: AssignmentDrag.self) { items, _ in
                    guard let item = items.first else { return false }
                    Task { await drop(item, onto: s, position: p) }
                    return true
                } isTargeted: { on in
                    if on { dropTarget = key } else if dropTarget == key { dropTarget = nil }
                }
        } else {
            content()
        }
    }

    private func drop(_ item: AssignmentDrag, onto s: ServiceSet, position p: Position) async {
        guard let m = members[item.memberId] else { return }
        if assignments.contains(where: { $0.setId == s.id && $0.positionId == p.id && $0.memberId == m.id }) {
            note = "\(m.name) is already on \(s.name) as \(p.name)."
            return
        }
        do {
            let a: Assignment = try await supabase.from("set_assignments")
                .insert(NewAssignment(set_id: s.id, position_id: p.id, member_id: m.id))
                .select("id,set_id,position_id,member_id,status").single().execute().value
            assignments.append(a)
            note = "\(m.name) added to \(s.name) as \(p.name). Not sent yet; open the set to send requests."
        } catch {
            note = "Couldn't add \(m.name). \(error.localizedDescription)"
        }
    }

    private var rule: some View { Rectangle().fill(Color.secondary.opacity(0.15)).frame(height: 0.5) }

    private func isBand(_ row: Row) -> Bool {
        if case .section = row { return true }
        if case .songsTitle = row { return true }
        return false
    }

    // MARK: Labels

    @ViewBuilder
    private func label(_ row: Row) -> some View {
        switch row {
        case .header:
            Text("\(sets.count) set\(sets.count == 1 ? "" : "s")")
                .font(.caption).foregroundStyle(.secondary)
                .padding(8)
        case .songsTitle:
            bandTitle("Songs")
        case .songs:
            Color.clear
        case .section(let s):
            bandTitle(s.label)
        case .position(let p):
            Text(p.name).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 8).padding(.top, 6)
        }
    }

    private func bandTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold)).tracking(1)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 8).padding(.top, 6)
    }

    // MARK: Cells

    @ViewBuilder
    private func cell(_ row: Row, _ s: ServiceSet) -> some View {
        switch row {
        case .header:
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if isNext(s) { tag("NEXT", Theme.accentLight) } else if isPast(s) { tag("LAST", .secondary) }
                    Text(s.name).font(.caption.weight(.semibold)).lineLimit(1)
                }
                Text(when(s)).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            .padding(8)
            .overlay(alignment: .top) {
                if isNext(s) { Rectangle().fill(Theme.accentLight).frame(height: 2) }
            }
        case .songsTitle, .section:
            Color.clear
        case .songs:
            VStack(alignment: .leading, spacing: 0) {
                let list = songs[s.id] ?? []
                if list.isEmpty {
                    Text("No songs yet").foregroundStyle(.tertiary).frame(height: line)
                }
                ForEach(Array(list.enumerated()), id: \.offset) { i, title in
                    HStack(spacing: 4) {
                        Text("\(i + 1)").foregroundStyle(.secondary).monospacedDigit()
                        Text(title).lineLimit(1)
                    }
                    .frame(height: line)
                }
            }
            .font(.caption)
            .padding(.horizontal, 8).padding(.top, 5)
        case .position(let p):
            VStack(alignment: .leading, spacing: 0) {
                let list = people(p, in: s)
                if list.isEmpty {
                    Text("—").foregroundStyle(.tertiary).frame(height: line)
                }
                ForEach(list) { a in
                    HStack(spacing: 5) {
                        Circle().fill(statusColor(a.status)).frame(width: 7, height: 7)
                        Text(members[a.memberId]?.name ?? "").lineLimit(1)
                    }
                    .frame(height: line)
                    .draggable(AssignmentDrag(memberId: a.memberId, positionId: p.id))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(p.name): \(members[a.memberId]?.name ?? ""), \(a.statusLabel)")
                }
            }
            .font(.caption)
            .padding(.horizontal, 8).padding(.top, 5)
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text).font(.system(size: 8, weight: .bold))
            .padding(.horizontal, 3).padding(.vertical, 1)
            .foregroundStyle(color)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(color.opacity(0.6), lineWidth: 0.5))
    }

    private var legend: some View {
        HStack(spacing: 14) {
            ForEach([("accepted", "Accepted"), ("invited", "Pending"), ("declined", "Declined"), ("draft", "Not sent")], id: \.0) { key, text in
                HStack(spacing: 4) {
                    Circle().fill(statusColor(key)).frame(width: 7, height: 7)
                    Text(text)
                }
            }
            Spacer()
            Text("Tap a set to edit its team · drag a person to another set").foregroundStyle(.tertiary)
        }
        .font(.caption2).foregroundStyle(.secondary)
        .padding(.horizontal, 10).padding(.vertical, 8)
    }

    private func statusColor(_ status: String?) -> Color { StatusPill.color(status) }

    private func when(_ s: ServiceSet) -> String {
        var parts: [String] = []
        if let d = s.date { parts.append(d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())) }
        if let t = s.timeValue { parts.append(t.formatted(date: .omitted, time: .shortened)) }
        return parts.joined(separator: " · ")
    }

    private func isPast(_ s: ServiceSet) -> Bool { (s.serviceDate ?? today) < today }
    private func isNext(_ s: ServiceSet) -> Bool { sets.first { !isPast($0) }?.id == s.id }

    // MARK: Loading

    private struct ItemRow: Decodable {
        let setId: UUID
        let position: Int
        let content: JSONObject
        enum CodingKeys: String, CodingKey { case position, content; case setId = "set_id" }
    }
    private struct SongTitle: Decodable { let id: UUID; let title: String }

    private func load() async {
        defer { loaded = true }
        guard let team = session.currentTeam else { return }
        do {
            // The most recent past set, then the upcoming ones in date order.
            async let last: [ServiceSet] = supabase.from("sets").select(ServiceSet.columns)
                .eq("church_id", value: team.id).lt("service_date", value: today)
                .order("service_date", ascending: false).order("service_time", ascending: false)
                .limit(1).execute().value
            async let next: [ServiceSet] = supabase.from("sets").select(ServiceSet.columns)
                .eq("church_id", value: team.id).gte("service_date", value: today)
                .order("service_date").order("service_time")
                .limit(30).execute().value
            let list = try await last + next
            let ids = list.map { $0.id.uuidString }
            guard !ids.isEmpty else { sets = []; failed = nil; return }

            async let a: [Assignment] = supabase.from("set_assignments")
                .select("id,set_id,position_id,member_id,status").in("set_id", values: ids).execute().value
            async let i: [ItemRow] = supabase.from("set_items")
                .select("set_id,position,content").eq("type", value: "song").in("set_id", values: ids)
                .order("position").execute().value
            let (found, items) = try await (a, i)

            // Song titles: saved on the item, otherwise from the song itself.
            let missing = Set(items.filter { title(of: $0.content) == nil }
                .compactMap { $0.content["song_id"]?.stringValue })
            var titles: [String: String] = [:]
            if !missing.isEmpty, let rows: [SongTitle] = try? await supabase.from("songs")
                .select("id,title").in("id", values: Array(missing)).execute().value {
                for r in rows { titles[r.id.uuidString.lowercased()] = r.title }
            }
            var bySet: [UUID: [String]] = [:]
            for item in items.sorted(by: { $0.position < $1.position }) {
                let t = title(of: item.content)
                    ?? item.content["song_id"]?.stringValue.flatMap { titles[$0.lowercased()] }
                    ?? "Song"
                bySet[item.setId, default: []].append(t)
            }

            sets = list
            assignments = found
            songs = bySet
            failed = nil
        } catch {
            if sets.isEmpty { failed = "Couldn't load the schedule. \(error.localizedDescription)" }
        }
    }

    private func title(of content: JSONObject) -> String? {
        for key in ["song_title", "title"] {
            if let t = content[key]?.stringValue, !t.isEmpty { return t }
        }
        return nil
    }
}
