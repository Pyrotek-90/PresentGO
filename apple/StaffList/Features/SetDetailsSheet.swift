import SwiftUI
import Supabase

/// New set, or a set's details — the same fields as the web Set page: name, date, time and
/// length, location, extra times (rehearsal, soundcheck…), and repeating sets. Saved through the
/// shared API (sets/save), which also creates or updates the repeats.
struct SetDetailsSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    let set: ServiceSet?
    var hasProgram = false
    var onSaved: (ServiceSet, String?) -> Void
    var onDeleted: () -> Void

    @State private var name: String
    @State private var date: Date
    @State private var time: Date
    @State private var duration: Int
    @State private var venue: String
    @State private var address: String
    @State private var room: String
    @State private var times: [EditableTime]
    @State private var freq: String
    @State private var endsOn: Bool
    @State private var count: Int
    @State private var until: Date
    @State private var monthlyDay: String   // "w0"…"w4" (1st–4th, last weekday) or "date"
    @State private var newTimeName = ""
    @State private var askingTimeName = false
    @State private var copyProgram = false
    @State private var applyToFollowing = false
    @State private var saving = false
    @State private var confirmDelete = false
    @State private var error: String?

    struct EditableTime: Identifiable, Hashable {
        let id = UUID()
        var label: String
        var date: Date
        var hasTime: Bool
        var time: Date
        var minutes: Int
    }

    private static let durations = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240]

    init(set: ServiceSet?, hasProgram: Bool = false,
         onSaved: @escaping (ServiceSet, String?) -> Void = { _, _ in }, onDeleted: @escaping () -> Void = {}) {
        self.set = set
        self.hasProgram = hasProgram
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        let cal = Calendar.current
        let tenAM = cal.date(bySettingHour: 10, minute: 0, second: 0, of: .now) ?? .now
        let startDate = set?.date ?? SetDetailsSheet.nextSunday()
        _name = State(initialValue: set?.name ?? "")
        _date = State(initialValue: startDate)
        _time = State(initialValue: set?.timeValue ?? tenAM)
        _duration = State(initialValue: set?.durationMin ?? 90)
        _venue = State(initialValue: set?.venueName ?? "")
        _address = State(initialValue: set?.locationAddress ?? "")
        _room = State(initialValue: set?.locationDetails ?? "")
        _times = State(initialValue: (set?.extraTimes ?? []).compactMap { t in
            guard let d = ServiceSet.dayFormatter.date(from: t.date) else { return nil }
            let clock = SetDetailsSheet.clock(t.time)
            return EditableTime(label: t.label, date: d, hasTime: clock != nil, time: clock ?? tenAM, minutes: t.minutes ?? 90)
        })
        _freq = State(initialValue: set?.recurrence?.freq ?? "")
        let rule = set?.recurrence
        _monthlyDay = State(initialValue: rule?.by == "date" ? "date" : "w\(rule?.week ?? SetDetailsSheet.weekOfMonth(startDate))")
        _endsOn = State(initialValue: set?.recurrence?.until != nil)
        _count = State(initialValue: set?.recurrence?.count ?? 12)
        _until = State(initialValue: set?.recurrence?.until.flatMap { ServiceSet.dayFormatter.date(from: $0) }
                       ?? cal.date(byAdding: .month, value: 3, to: .now) ?? .now)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Set Name") {
                        TextField("Required", text: $name)
                            .multilineTextAlignment(.trailing)
                    }
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                    HStack {
                        Text("Time")
                        Spacer()
                        DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                            .labelsHidden()
                        Picker("Length", selection: $duration) {
                            ForEach(Self.durations, id: \.self) { Text(Self.durationLabel($0)).tag($0) }
                        }
                        .labelsHidden()
                        .fixedSize()
                    }
                }

                Section("Location") {
                    TextField("Venue (e.g. Main Sanctuary)", text: $venue)
                    TextField("Address", text: $address, axis: .vertical).textContentType(.fullStreetAddress)
                    TextField("Room or details", text: $room)
                }

                Section {
                    ForEach($times) { $t in timeRow($t) }
                        .onDelete { times.remove(atOffsets: $0) }
                    Menu {
                        ForEach(ExtraTime.names, id: \.self) { n in
                            Button(n) { addTime(n) }
                        }
                        Divider()
                        Button("New Time Name…", systemImage: "square.and.pencil") {
                            newTimeName = ""
                            askingTimeName = true
                        }
                    } label: {
                        Label("Add Time", systemImage: "plus")
                    }
                } header: {
                    Text("Extra Times")
                } footer: {
                    Text("Rehearsal, practice, soundcheck or your own. They go in the invitations and calendars.")
                }

                Section {
                    Picker("Repeat", selection: $freq.animation()) {
                        Text("Does not repeat").tag("")
                        Text("Weekly").tag("weekly")
                        Text("Every 2 weeks").tag("biweekly")
                        Text("Monthly").tag("monthly")
                    }
                    if freq == "monthly" {
                        Picker("Day of the month", selection: $monthlyDay) {
                            ForEach(0..<5, id: \.self) { n in
                                Text("\(Self.ordinals[n]) \(weekdayName)").tag("w\(n)")
                            }
                            Text("Day \(Calendar.current.component(.day, from: date)) of each month").tag("date")
                        }
                        .onChange(of: monthlyDay) { _, choice in moveDate(to: choice) }
                    }
                    if !freq.isEmpty {
                        Picker("Ends", selection: $endsOn) {
                            Text("After a number of sets").tag(false)
                            Text("On a date").tag(true)
                        }
                        if endsOn {
                            DatePicker("Last date", selection: $until, in: date..., displayedComponents: .date)
                        } else {
                            Stepper("\(count) sets in all", value: $count, in: 2...104)
                        }
                        if hasProgram {
                            Toggle("Copy this program to the new sets", isOn: $copyProgram)
                        }
                    }
                    if set?.seriesId != nil {
                        Toggle("Also update the following sets", isOn: $applyToFollowing)
                    }
                } header: {
                    Text("Repeat")
                } footer: {
                    if set?.seriesId != nil {
                        Text("Changing the repeat removes upcoming sets in the series that are still empty, and adds new ones. Sets that already have a program or team are kept.")
                    }
                }

                if set != nil {
                    Section {
                        Button("Delete Set", role: .destructive) { confirmDelete = true }
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle(set == nil ? "New Set" : "Set Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button(set == nil ? "Create" : "Save") { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .confirmationDialog("Delete \"\(set?.name ?? "")\"?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete Set", role: .destructive) { Task { await delete() } }
            } message: {
                Text("The set and its program are deleted for everyone on the team. Songs stay in the library.")
            }
            .alert("New Time", isPresented: $askingTimeName) {
                TextField("Name, e.g. Band Prayer", text: $newTimeName)
                Button("Add") { addCustomTime() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("What is this time for?")
            }
            .interactiveDismissDisabled(saving)
        }
    }

    private func timeRow(_ t: Binding<EditableTime>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("Name", text: t.label).font(.body.weight(.medium))
            HStack(spacing: 8) {
                DatePicker("Date", selection: t.date, displayedComponents: .date).labelsHidden()
                DatePicker("Time", selection: t.time, displayedComponents: .hourAndMinute).labelsHidden()
                Spacer(minLength: 0)
                Picker("Length", selection: t.minutes) {
                    ForEach(Self.durations, id: \.self) { Text(Self.durationLabel($0)).tag($0) }
                }
                .labelsHidden()
                .fixedSize()
            }
        }
        .padding(.vertical, 2)
    }

    private func addTime(_ label: String) {
        // Rehearsals and practices default to two days before; anything else to the same day.
        let before = ["Rehearsal", "Practice", "Run-Thru"].contains(label) ? -2 : 0
        let d = Calendar.current.date(byAdding: .day, value: before, to: date) ?? date
        let t = Calendar.current.date(bySettingHour: before == 0 ? 8 : 19, minute: 0, second: 0, of: .now) ?? .now
        times.append(EditableTime(label: label, date: d, hasTime: true, time: t, minutes: before == 0 ? 60 : 90))
    }

    private static let ordinals = ["1st", "2nd", "3rd", "4th", "Last"]
    private var weekdayName: String { date.formatted(.dateTime.weekday(.wide)) }

    /// 0–3 for the 1st–4th weekday of its month, 4 for a 5th (counted as "last") — as on the web.
    static func weekOfMonth(_ d: Date) -> Int { min((Calendar.current.component(.day, from: d) - 1) / 7, 4) }

    /// Choosing "1st Sunday" (etc.) moves the first set to that day — this month if it's still
    /// ahead, otherwise next month — so the series starts on the right day.
    private func moveDate(to choice: String) {
        guard choice.hasPrefix("w"), let n = Int(choice.dropFirst()) else { return }
        let cal = Calendar.current
        let weekday = cal.component(.weekday, from: date)
        func match(inMonthOf base: Date) -> Date? {
            guard let first = cal.date(from: cal.dateComponents([.year, .month], from: base)),
                  let days = cal.range(of: .day, in: .month, for: first) else { return nil }
            let all = days.compactMap { cal.date(byAdding: .day, value: $0 - 1, to: first) }
                .filter { cal.component(.weekday, from: $0) == weekday }
            return n == 4 ? all.last : (all.indices.contains(n) ? all[n] : nil)
        }
        let today = cal.startOfDay(for: .now)
        if let d = match(inMonthOf: date), d >= today { date = d }
        else if let next = cal.date(byAdding: .month, value: 1, to: date), let d = match(inMonthOf: next) { date = d }
    }

    private func addCustomTime() {
        let name = newTimeName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        addTime(name)
    }

    // MARK: Saving

    private func hm(_ d: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let day = ServiceSet.dayFormatter
        var rule: RepeatRule? = freq.isEmpty ? nil
            : RepeatRule(freq: freq, count: endsOn ? nil : count, until: endsOn ? day.string(from: until) : nil)
        if freq == "monthly" {
            if monthlyDay == "date" { rule?.by = "date" }
            else { rule?.by = "weekday"; rule?.week = Int(monthlyDay.dropFirst()) ?? Self.weekOfMonth(date) }
        }
        let request = SetSaveRequest(
            id: set?.id,
            church_id: set == nil ? session.currentTeam?.id : nil,
            name: name.trimmingCharacters(in: .whitespaces),
            date: day.string(from: date),
            time: hm(time),
            duration: duration,
            venue: venue, address: address, room: room,
            times: times.map { ExtraTime(label: $0.label, date: day.string(from: $0.date), time: $0.hasTime ? hm($0.time) : nil, minutes: $0.minutes) },
            repeat: rule,
            copy_program: copyProgram,
            scope: applyToFollowing ? "following" : "one",
            time_zone: TimeZone.current.identifier
        )
        do {
            let reply = try await StaffListAPI.shared.post("sets/save", request, as: SetSaveReply.self)
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            onSaved(reply.set, reply.message)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete() async {
        guard let set else { return }
        do {
            try await supabase.from("sets").delete().eq("id", value: set.id).execute()
            NotificationCenter.default.post(name: .setsChanged, object: nil)
            dismiss()
            onDeleted()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Helpers

    static func nextSunday() -> Date {
        let cal = Calendar.current
        let today = cal.startOfDay(for: .now)
        let weekday = cal.component(.weekday, from: today)   // 1 = Sunday
        return cal.date(byAdding: .day, value: weekday == 1 ? 0 : 8 - weekday, to: today) ?? today
    }

    static func clock(_ hm: String?) -> Date? {
        guard let hm, hm.count >= 5 else { return nil }
        let p = hm.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return Calendar.current.date(bySettingHour: p[0], minute: p[1], second: 0, of: .now)
    }

    static func durationLabel(_ m: Int) -> String {
        if m % 60 == 0 { return "\(m / 60) hr" }
        if m > 60 { return "\(m / 60) hr \(m % 60) min" }
        return "\(m) min"
    }
}
