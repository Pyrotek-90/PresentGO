import SwiftUI
import Supabase

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
    var onOpen: (ServiceSet) -> Void

    @State private var sets: [ServiceSet] = []
    @State private var assignments: [Assignment] = []
    @State private var songs: [UUID: [String]] = [:]
    @State private var loaded = false
    @State private var failed: String?

    private var columnWidth: CGFloat { sizeClass == .regular ? 168 : 136 }
    private var labelWidth: CGFloat { sizeClass == .regular ? 108 : 84 }
    private let line: CGFloat = 19
    private let today = ServiceSet.dayFormatter.string(from: .now)

    // MARK: Rows

    private enum Row: Identifiable, Hashable {
        case header, songsTitle, songs, section(TeamSection), position(Position)
        var id: String {
            switch self {
            case .header: return "header"
            case .songsTitle: return "songsTitle"
            case .songs: return "songs"
            case .section(let s): return "section-\(s.rawValue)"
            case .position(let p): return p.id.uuidString
            }
        }
    }

    private func people(_ p: Position, in s: ServiceSet) -> [Assignment] {
        assignments.filter { $0.setId == s.id && $0.positionId == p.id && members[$0.memberId] != nil }
            .sorted { (members[$0.memberId]?.name ?? "") < (members[$1.memberId]?.name ?? "") }
    }

    /// Songs, every Production role, then the positions anyone is scheduled in on these sets,
    /// grouped like the set's team section.
    private var rows: [Row] {
        var out: [Row] = [.header, .songsTitle, .songs]
        let used = Set(assignments.filter { members[$0.memberId] != nil }.map(\.positionId))
        let order = Dictionary(uniqueKeysWithValues: positions.enumerated().map { ($1.id, $0) })
        for section in TeamSection.allCases {
            // Production always shows all its roles; other sections only the ones scheduled.
            let list = positions.filter { (section == .production || used.contains($0.id)) && TeamSection.of($0) == section }
                .sorted { (TeamSection.rank($0), order[$0.id] ?? 0) < (TeamSection.rank($1), order[$1.id] ?? 0) }
            guard !list.isEmpty else { continue }
            out.append(.section(section))
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
                        Button { onOpen(s) } label: {
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(rows) { row in
                                    cell(row, s)
                                        .frame(width: columnWidth, height: height(row), alignment: .topLeading)
                                        .background(isBand(row) ? Color.secondary.opacity(0.1) : .clear)
                                        .overlay(alignment: .bottom) { rule }
                                }
                            }
                            .background(isNext(s) ? Theme.accent.opacity(0.07) : .clear)
                            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.2)).frame(width: 0.5) }
                            .opacity(isPast(s) ? 0.6 : 1)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Opens the set")
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.visible)
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
            ForEach([("accepted", "Accepted"), ("invited", "Waiting"), ("declined", "Declined"), ("draft", "Not sent")], id: \.0) { key, text in
                HStack(spacing: 4) {
                    Circle().fill(statusColor(key)).frame(width: 7, height: 7)
                    Text(text)
                }
            }
            Spacer()
            Text("Tap a set to edit its team").foregroundStyle(.tertiary)
        }
        .font(.caption2).foregroundStyle(.secondary)
        .padding(.horizontal, 10).padding(.vertical, 8)
    }

    private func statusColor(_ status: String?) -> Color {
        switch status {
        case "accepted": return .green
        case "declined": return .red
        case "invited": return .orange
        default: return .secondary
        }
    }

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
