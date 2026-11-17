import SwiftUI

/// The sets on a calendar, like the web Schedule page: Month or Week, Today and ‹ ›.
/// Upcoming sets are highlighted in the accent color, past sets are dimmed, today is circled.
/// Tapping a day selects it (its sets are listed under the calendar); tapping a set opens it.
struct SetsCalendar: View {
    let sets: [ServiceSet]
    @Binding var selected: Date
    var onOpen: (ServiceSet) -> Void

    @AppStorage("setsCalendarMode") private var mode = "month"
    @State private var cursor = Date.now
    @Environment(\.horizontalSizeClass) private var sizeClass

    private let cal = Calendar.current
    private var today: Date { cal.startOfDay(for: .now) }

    private var byDay: [Date: [ServiceSet]] {
        var out: [Date: [ServiceSet]] = [:]
        for s in sets { if let d = s.date { out[cal.startOfDay(for: d), default: []].append(s) } }
        for (k, v) in out { out[k] = v.sorted { ($0.serviceTime ?? "") < ($1.serviceTime ?? "") } }
        return out
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if mode == "week" { weekView } else { monthView }
        }
        .onAppear { cursor = selected }
    }

    // MARK: Header

    private var title: String {
        if mode == "week" {
            let days = weekDays(of: cursor)
            guard let first = days.first, let last = days.last else { return "" }
            let sameMonth = cal.isDate(first, equalTo: last, toGranularity: .month)
            return sameMonth
                ? "\(first.formatted(.dateTime.month(.wide))) \(first.formatted(.dateTime.day()))–\(last.formatted(.dateTime.day())), \(last.formatted(.dateTime.year()))"
                : "\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day().year()))"
        }
        return cursor.formatted(.dateTime.month(.wide).year())
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text(title).font(.headline).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 8)
            Picker("View", selection: $mode) {
                Text("Month").tag("month")
                Text("Week").tag("week")
            }
            .pickerStyle(.segmented)
            .frame(width: 140)
            Button("Today") { cursor = .now; selected = today }
                .buttonStyle(.bordered).controlSize(.small)
            Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                .buttonStyle(.borderless).accessibilityLabel(mode == "week" ? "Previous week" : "Previous month")
            Button { shift(1) } label: { Image(systemName: "chevron.right") }
                .buttonStyle(.borderless).accessibilityLabel(mode == "week" ? "Next week" : "Next month")
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    private func shift(_ by: Int) {
        cursor = cal.date(byAdding: mode == "week" ? .weekOfYear : .month, value: by, to: cursor) ?? cursor
    }

    // MARK: Month

    private var weekdaySymbols: [String] {
        let s = cal.veryShortStandaloneWeekdaySymbols
        let first = cal.firstWeekday - 1
        return Array(s[first...] + s[..<first])
    }

    private var monthDays: [Date] {
        guard let start = cal.date(from: cal.dateComponents([.year, .month], from: cursor)) else { return [] }
        let lead = (cal.component(.weekday, from: start) - cal.firstWeekday + 7) % 7
        let gridStart = cal.date(byAdding: .day, value: -lead, to: start) ?? start
        return (0..<42).compactMap { cal.date(byAdding: .day, value: $0, to: gridStart) }
    }

    private var monthView: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(weekdaySymbols.enumerated()), id: \.offset) { _, w in
                    Text(w).font(.caption2.weight(.semibold)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 6)
            Divider()
            let days = monthDays
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 0) {
                ForEach(days, id: \.self) { day in
                    monthCell(day)
                }
            }
        }
    }

    private func monthCell(_ day: Date) -> some View {
        let inMonth = cal.isDate(day, equalTo: cursor, toGranularity: .month)
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let daySets = byDay[cal.startOfDay(for: day)] ?? []
        let wide = sizeClass == .regular
        return Button { selected = day } label: {
            VStack(alignment: .leading, spacing: 3) {
                dayNumber(day)
                if wide {
                    ForEach(daySets.prefix(2)) { s in
                        Button { onOpen(s) } label: { chip(s) }.buttonStyle(.plain)
                    }
                    if daySets.count > 2 {
                        Text("+\(daySets.count - 2) more").font(.system(size: 10)).foregroundStyle(.secondary)
                    }
                } else if !daySets.isEmpty {
                    HStack(spacing: 3) {
                        ForEach(daySets.prefix(3)) { s in
                            Circle().fill(isUpcoming(s) ? Theme.accentLight : Color.secondary).frame(width: 6, height: 6)
                        }
                    }
                    .padding(.leading, 2)
                }
                Spacer(minLength: 0)
            }
            .padding(4)
            .frame(maxWidth: .infinity, minHeight: wide ? 78 : 50, alignment: .topLeading)
            .background(isSelected ? Theme.accent.opacity(0.15) : .clear)
            .overlay(isSelected ? RoundedRectangle(cornerRadius: 2).stroke(Theme.accent.opacity(0.7)) : nil)
            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 0.5) }
            .overlay(alignment: .bottom) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(height: 0.5) }
            .opacity(inMonth ? 1 : 0.35)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.formatted(date: .complete, time: .omitted))\(daySets.isEmpty ? "" : ", \(daySets.count) set\(daySets.count == 1 ? "" : "s")")")
    }

    private func dayNumber(_ day: Date) -> some View {
        let isToday = cal.isDate(day, inSameDayAs: today)
        return Text("\(cal.component(.day, from: day))")
            .font(.caption.weight(isToday ? .bold : .regular))
            .frame(width: 22, height: 22)
            .foregroundStyle(isToday ? .white : .secondary)
            .background(isToday ? Theme.accent : .clear, in: Circle())
    }

    private func chip(_ s: ServiceSet) -> some View {
        let upcoming = isUpcoming(s)
        return Text(s.name)
            .font(.system(size: 10, weight: .medium))
            .lineLimit(1)
            .padding(.horizontal, 4).padding(.vertical, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(upcoming ? Theme.accentLight : .secondary)
            .background((upcoming ? Theme.accent.opacity(0.25) : Color.secondary.opacity(0.12)), in: RoundedRectangle(cornerRadius: 4))
    }

    // MARK: Week

    private func weekDays(of date: Date) -> [Date] {
        let start = cal.dateInterval(of: .weekOfYear, for: date)?.start ?? cal.startOfDay(for: date)
        return (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: start) }
    }

    private var weekView: some View {
        let days = weekDays(of: cursor)
        return Group {
            if sizeClass == .regular {
                HStack(alignment: .top, spacing: 0) {
                    ForEach(days, id: \.self) { day in weekColumn(day) }
                }
                .frame(minHeight: 180, alignment: .top)
            } else {
                VStack(spacing: 0) {
                    ForEach(days, id: \.self) { day in weekRow(day) }
                }
            }
        }
    }

    /// iPad: seven columns, each day's sets as cards with their times.
    private func weekColumn(_ day: Date) -> some View {
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let daySets = byDay[cal.startOfDay(for: day)] ?? []
        return Button { selected = day } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text(day.formatted(.dateTime.weekday(.abbreviated))).font(.caption).foregroundStyle(.secondary)
                    dayNumber(day)
                }
                ForEach(daySets) { s in
                    Button { onOpen(s) } label: { setCard(s) }.buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(isSelected ? Theme.accent.opacity(0.12) : .clear)
            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 0.5) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// iPhone: one row per day.
    private func weekRow(_ day: Date) -> some View {
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let daySets = byDay[cal.startOfDay(for: day)] ?? []
        return Button { selected = day } label: {
            HStack(alignment: .top, spacing: 10) {
                VStack(spacing: 2) {
                    Text(day.formatted(.dateTime.weekday(.abbreviated))).font(.caption2).foregroundStyle(.secondary)
                    dayNumber(day)
                }
                .frame(width: 40)
                VStack(alignment: .leading, spacing: 6) {
                    if daySets.isEmpty {
                        Text(" ").font(.caption)
                    }
                    ForEach(daySets) { s in
                        Button { onOpen(s) } label: { setCard(s) }.buttonStyle(.plain)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(isSelected ? Theme.accent.opacity(0.12) : .clear)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(height: 0.5) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func setCard(_ s: ServiceSet) -> some View {
        let upcoming = isUpcoming(s)
        return VStack(alignment: .leading, spacing: 2) {
            Text(s.name).font(.caption.weight(.semibold)).lineLimit(2)
            if let t = s.timeValue {
                Text(t.formatted(date: .omitted, time: .shortened)).font(.caption2)
            }
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(upcoming ? Theme.accentLight : .secondary)
        .background(upcoming ? Theme.accent.opacity(0.22) : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(upcoming ? Theme.accent.opacity(0.5) : .clear))
    }

    private func isUpcoming(_ s: ServiceSet) -> Bool {
        guard let d = s.date else { return true }
        return cal.startOfDay(for: d) >= today
    }
}
