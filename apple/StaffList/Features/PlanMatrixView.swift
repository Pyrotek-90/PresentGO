import SwiftUI

/// Settings → Account → Plan: what each plan includes, side by side, with the team's plan
/// highlighted. Mirrors PLAN_MATRIX in src/lib/plans.js — keep them in step.
/// Paid plans aren't on sale yet; when they are, buying in the app has to go through
/// In-App Purchase (StoreKit), so changing plans here only says they're coming soon.
struct PlanMatrixView: View {
    @Environment(\.dismiss) private var dismiss
    let current: String
    @State private var pick: String?

    enum Cell { case yes, no, text(String) }
    static let order = ["free", "solo", "pro", "ultimate"]
    static let label = ["free": "Free", "solo": "Solo", "pro": "Pro", "ultimate": "Ultimate"]
    static let price = ["free": "Free", "solo": "$5/mo", "pro": "$12/mo", "ultimate": "Soon"]

    private static let y = Cell.yes, n = Cell.no
    static let matrix: [(group: String, rows: [(String, [Cell])])] = [
        ("Your music book", [
            ("Songs, chord charts & transposition", [y, y, y, y]),
            ("Imports (ChordPro, PDF, bulk folder)", [y, y, y, y]),
            ("Sets, Song Viewer & calendar", [y, y, y, y]),
            ("Team Details", [y, y, y, y]),
            ("Content Library", [.text("100 MB"), .text("500 MB"), .text("1 GB"), .text("5 GB")]),
        ]),
        ("Presenting", [
            ("Controller, Up Next, Loop & TV", [n, y, y, y]),
            ("CCLI Report", [n, y, y, y]),
            ("PDF songbook export", [n, y, y, y]),
            ("Devices signed in", [n, .text("3"), .text("∞"), .text("∞")]),
        ]),
        ("AI tools", [
            ("AI Translate", [n, n, y, y]),
            ("AI Worship Leader Notes", [n, n, y, y]),
            ("AI key / BPM & Smart Cleanup", [n, n, y, y]),
        ]),
        ("Team", [
            ("Scheduling, invites & calendar sync", [n, n, y, y]),
            ("Add, invite & message members", [n, n, y, y]),
            ("Shared access for the team", [n, n, y, y]),
        ]),
        ("Church", [
            ("Up to 5 workspaces", [n, n, n, y]),
            ("Announcements page", [n, n, n, y]),
            ("Registrations & merchandise", [n, n, n, y]),
        ]),
    ]

    private var cur: String { Self.order.contains(current) ? current : "free" }
    private let colWidth: CGFloat = 58

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    ForEach(Self.matrix, id: \.group) { g in
                        Text(g.group.uppercased())
                            .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                            .padding(.top, 16).padding(.bottom, 4).padding(.horizontal, 12)
                        ForEach(g.rows, id: \.0) { label, cells in
                            Divider().padding(.leading, 12)
                            HStack(spacing: 0) {
                                Text(label).font(.footnote).frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.leading, 12).padding(.vertical, 7)
                                ForEach(Array(cells.enumerated()), id: \.offset) { i, c in
                                    cell(c).frame(width: colWidth).frame(maxHeight: .infinity)
                                        .background(Self.order[i] == cur ? Theme.accent.opacity(0.18) : .clear)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.bottom, 12)
            }
            .safeAreaInset(edge: .bottom) { footer }
            .navigationTitle("Plans & Features")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { HeaderTextButton("Done") { dismiss() } }.headerIconItem() }
        }
    }

    private var header: some View {
        HStack(spacing: 0) {
            Spacer()
            ForEach(Self.order, id: \.self) { p in
                Button { pick = p } label: {
                    VStack(spacing: 2) {
                        Text(Self.label[p] ?? p).font(.caption.weight(.semibold))
                            .foregroundStyle(p == cur ? Theme.accentLight : .primary)
                        Text(Self.price[p] ?? "").font(.system(size: 10)).foregroundStyle(.secondary)
                        Text(p == cur ? "Current" : " ").font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.accentLight)
                    }
                    .frame(width: colWidth).padding(.vertical, 6)
                    .background(p == cur ? Theme.accent.opacity(0.18) : .clear)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(pick == p ? Theme.accentLight : .clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
    }

    @ViewBuilder private func cell(_ c: Cell) -> some View {
        switch c {
        case .yes: Image(systemName: "checkmark").font(.footnote.weight(.semibold)).foregroundStyle(Theme.accentLight)
        case .no: Image(systemName: "minus").font(.caption2).foregroundStyle(.quaternary)
        case .text(let t): Text(t).font(.caption2).multilineTextAlignment(.center)
        }
    }

    private var footer: some View {
        VStack(spacing: 4) {
            if let pick, pick != cur {
                Text("Changing to **\(Self.label[pick] ?? pick)** isn't available yet — paid plans are coming soon.")
            } else {
                Text("You're on **\(Self.label[cur] ?? cur)**. Tap a plan above to change.")
            }
        }
        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
        .frame(maxWidth: .infinity).padding(12)
        .background(.bar)
    }
}
