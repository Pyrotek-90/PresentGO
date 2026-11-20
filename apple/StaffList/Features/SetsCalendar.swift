import SwiftUI

/// The sets on a calendar, like the web Schedule page: Month or Week, Today and ‹ ›.
/// Upcoming sets are highlighted in the accent color, past sets are dimmed, today is circled.
/// Tapping a day selects it (its sets are listed under the calendar); tapping a set opens it.
/// Weeks start on Monday so the weekend sits together. Month opens on this week and the three after
/// it; ‹ › then go a whole month at a time, and Today comes back to the four weeks.
struct SetsCalendar: View {
    let sets: [ServiceSet]
    @Binding var selected: Date
    var onOpen: (ServiceSet) -> Void
    /// Each set's team color (Settings → My Teams).
    var color: (ServiceSet) -> Color = { _ in Theme.accentLight }

    @AppStorage("setsCalendarMode") private var mode = "month"
    @AppStorage("setsCalendarCollapsed") private var collapsed = false
    @State private var cursor = Date.now
    /// Month view shows this week + 3 until ‹ › is used.
    @State private var rolling = true
    @Environment(\.horizontalSizeClass) private var sizeClass

    private let cal: Calendar = {
        var c = Calendar.current
        c.firstWeekday = 2   // Monday
        return c
    }()
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
            if !collapsed {
                Divider()
                if mode == "week" { weekView } else { monthView }
            }
        }
        .onAppear { cursor = selected }
    }

    // MARK: Header

    /// Month names: full on the iPad ("November"), short on the iPhone ("Nov") to leave room for
    /// the Month / Week buttons.
    private var title: String {
        let m: Date.FormatStyle.Symbol.Month = phone ? .abbreviated : .wide
        if mode == "week" {
            let days = weekDays(of: cursor)
            guard let first = days.first, let last = days.last else { return "" }
            let sameMonth = cal.isDate(first, equalTo: last, toGranularity: .month)
            return sameMonth
                ? "\(first.formatted(.dateTime.month(m))) \(first.formatted(.dateTime.day()))–\(last.formatted(.dateTime.day())), \(last.formatted(.dateTime.year()))"
                : "\(first.formatted(.dateTime.month(m).day())) – \(last.formatted(.dateTime.month(m).day().year()))"
        }
        if rolling, let first = monthDays.first, let last = monthDays.last {
            return "\(first.formatted(.dateTime.month(m).day())) – \(last.formatted(.dateTime.month(m).day()))"
        }
        return cursor.formatted(.dateTime.month(m).year())
    }

    private var phone: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    private var header: some View {
        HStack(spacing: 8) {
            Button {
                withAnimation(.snappy) { collapsed.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        .rotationEffect(.degrees(collapsed ? -90 : 0))
                    Text(collapsed ? "Calendar" : title).font(.headline).lineLimit(1).minimumScaleFactor(0.8)
                    if collapsed {
                        Text("· \(cursor.formatted(.dateTime.month(phone ? .abbreviated : .wide).year()))").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(collapsed ? "Shows the calendar" : "Hides the calendar")
            if !collapsed { controls }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    @ViewBuilder
    private var controls: some View {
            Picker("View", selection: $mode) {
                Text("Month").tag("month")
                Text("Week").tag("week")
            }
            .pickerStyle(.segmented)
            .frame(width: 140)
            Button("Today") { cursor = .now; rolling = true; selected = today }
                .buttonStyle(.bordered).controlSize(.small)
            Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                .buttonStyle(.borderless).accessibilityLabel(mode == "week" ? "Previous week" : "Previous month")
            Button { shift(1) } label: { Image(systemName: "chevron.right") }
                .buttonStyle(.borderless).accessibilityLabel(mode == "week" ? "Next week" : "Next month")
    }

    private func shift(_ by: Int) {
        if mode != "week" && rolling {
            // From the four weeks: › goes to next month, ‹ to this whole month.
            rolling = false
            cursor = cal.date(byAdding: .month, value: by > 0 ? 1 : 0, to: .now) ?? .now
            return
        }
        cursor = cal.date(byAdding: mode == "week" ? .weekOfYear : .month, value: by, to: cursor) ?? cursor
    }

    // MARK: Month

    private let weekdaySymbols = ["M", "Tu", "W", "Th", "F", "Sat", "Sun"]

    private var monthDays: [Date] {
        if rolling {
            let start = cal.dateInterval(of: .weekOfYear, for: .now)?.start ?? today
            return (0..<28).compactMap { cal.date(byAdding: .day, value: $0, to: start) }
        }
        guard let start = cal.date(from: cal.dateComponents([.year, .month], from: cursor)) else { return [] }
        let lead = (cal.component(.weekday, from: start) - cal.firstWeekday + 7) % 7
        let gridStart = cal.date(byAdding: .day, value: -lead, to: start) ?? start
        let days = cal.range(of: .day, in: .month, for: start)?.count ?? 30
        let count = Int((Double(lead + days) / 7).rounded(.up)) * 7
        return (0..<count).compactMap { cal.date(byAdding: .day, value: $0, to: gridStart) }
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
        let inMonth = rolling || cal.isDate(day, equalTo: cursor, toGranularity: .month)
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
                            Circle().fill(isUpcoming(s) ? color(s) : Color.secondary).frame(width: 6, height: 6)
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
            .foregroundStyle(upcoming ? color(s) : .secondary)
            .background((upcoming ? color(s).opacity(0.2) : Color.secondary.opacity(0.12)), in: RoundedRectangle(cornerRadius: 4))
    }

    // MARK: Week

    private func weekDays(of date: Date) -> [Date] {
        let start = cal.dateInterval(of: .weekOfYear, for: date)?.start ?? cal.startOfDay(for: date)
        return (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: start) }
    }

    private var weekView: some View {
        let days = weekDays(of: cursor)
        return Group {
            // Seven columns, only as tall as the busiest day. On the phone, just colored boxes.
            HStack(alignment: .top, spacing: 0) {
                ForEach(days, id: \.self) { day in
                    if sizeClass == .regular { weekColumn(day) } else { weekBoxColumn(day) }
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// iPad: seven columns, each day's sets as cards with their times.
    private func weekColumn(_ day: Date) -> some View {
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let daySets = byDay[cal.startOfDay(for: day)] ?? []
        return Button { selected = day } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text(weekdaySymbols[(cal.component(.weekday, from: day) + 5) % 7]).font(.caption).foregroundStyle(.secondary)
                    dayNumber(day)
                }
                ForEach(daySets) { s in
                    Button { onOpen(s) } label: { setCard(s) }.buttonStyle(.plain)
                }
            }
            .padding(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(dayFill(daySets, selected: isSelected))
            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 0.5) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// iPhone: a narrow column per day with a colored box for each set (tap a box to open the set).
    private func weekBoxColumn(_ day: Date) -> some View {
        let isSelected = cal.isDate(day, inSameDayAs: selected)
        let daySets = byDay[cal.startOfDay(for: day)] ?? []
        let label = weekdaySymbols[(cal.component(.weekday, from: day) + 5) % 7]
        return Button { selected = day } label: {
            VStack(spacing: 4) {
                Text(label).font(.caption2).foregroundStyle(.secondary)
                dayNumber(day)
                ForEach(daySets) { s in
                    Button { onOpen(s) } label: {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(isUpcoming(s) ? color(s).opacity(0.55) : Color.secondary.opacity(0.3))
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(isUpcoming(s) ? color(s) : .clear, lineWidth: 1))
                            .frame(height: 18)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(s.name)
                }
            }
            .padding(.horizontal, 3).padding(.vertical, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(dayFill(daySets, selected: isSelected))
            .overlay(alignment: .trailing) { Rectangle().fill(Color.secondary.opacity(0.15)).frame(width: 0.5) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.formatted(date: .complete, time: .omitted))\(daySets.isEmpty ? "" : ", \(daySets.count) set\(daySets.count == 1 ? "" : "s")")")
    }

    /// A day with a set is shaded all over in its team color (grey once it's past); the chosen day
    /// gets an accent outline on top.
    @ViewBuilder private func dayFill(_ daySets: [ServiceSet], selected: Bool) -> some View {
        ZStack {
            if let s = daySets.first {
                (isUpcoming(s) ? color(s).opacity(0.2) : Color.secondary.opacity(0.12))
            }
            if selected {
                Theme.accent.opacity(daySets.isEmpty ? 0.12 : 0.08)
                RoundedRectangle(cornerRadius: 4).strokeBorder(Theme.accentLight.opacity(0.7), lineWidth: 1.5)
            }
        }
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
        .foregroundStyle(upcoming ? color(s) : .secondary)
        .background(upcoming ? color(s).opacity(0.18) : Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(upcoming ? color(s).opacity(0.5) : .clear))
    }

    private func isUpcoming(_ s: ServiceSet) -> Bool {
        guard let d = s.date else { return true }
        return cal.startOfDay(for: d) >= today
    }
}
