import SwiftUI

/// "This Week" — a thought on authentic worship with a supporting scripture, new each Sunday.
/// The same thought as the web Home page (API thoughts/week). Collapsible, remembered.
struct WeeklyThoughtCard: View {
    @AppStorage("thoughtCollapsed") private var collapsed = false
    @State private var thought: Thought?

    struct Thought: Codable, Hashable {
        let title: String
        let thought: String
        let text: String
        let ref: String
        let week_of: String
    }
    private struct Request: Encodable { let date: String }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.snappy) { collapsed.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(collapsed ? -90 : 0))
                    Text("This Week").font(.headline)
                    if let thought {
                        Text("· \(thought.title)").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Image(systemName: "sparkles").foregroundStyle(Theme.accentLight)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(collapsed ? "Shows this week's thought" : "Hides this week's thought")

            if !collapsed, let thought {
                VStack(alignment: .leading, spacing: 10) {
                    Text(thought.thought).font(.subheadline)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("“\(thought.text)”").font(.subheadline.italic()).foregroundStyle(.secondary)
                        (Text(thought.ref).fontWeight(.semibold).foregroundColor(Theme.accentLight)
                            + Text("  KJV").foregroundColor(.secondary))
                            .font(.caption)
                    }
                    .padding(.leading, 12)
                    .overlay(alignment: .leading) { Rectangle().fill(Theme.accent.opacity(0.6)).frame(width: 2) }
                }
                .padding(.top, 10)
                .transition(.opacity)
            }
        }
        .task { await load() }
    }

    private func load() async {
        let today = ServiceSet.dayFormatter.string(from: .now)
        let key = "thought-\(today)"
        if let saved = OfflineStore.load(Thought.self, from: key) { thought = saved; return }
        if let t = try? await StaffListAPI.shared.post("thoughts/week", Request(date: today), as: Thought.self) {
            thought = t
            OfflineStore.save(t, as: key)
        } else if let any = OfflineStore.load(Thought.self, from: "thought-last") {
            thought = any
        }
        if let thought { OfflineStore.save(thought, as: "thought-last") }
    }
}
