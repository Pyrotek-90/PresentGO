import SwiftUI

/// A top-bar icon button in a modern, squared style: the symbol in a rounded square with a soft
/// fill and a hairline border (like the Claude app's header buttons), instead of a bare glyph.
struct HeaderIconButton: View {
    let title: String
    let systemImage: String
    var badge = false
    let action: () -> Void

    init(_ title: String, systemImage: String, badge: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.badge = badge
        self.action = action
    }

    var body: some View {
        Button(action: action) { HeaderIconLabel(systemImage: systemImage, badge: badge) }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
    }
}

/// The squared icon itself, for Menus and other controls in the top bar.
struct HeaderIconLabel: View {
    let systemImage: String
    var badge = false

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 15, weight: .semibold))
            .symbolRenderingMode(.hierarchical)
            .frame(width: 34, height: 34)
            .foregroundStyle(.primary)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.primary.opacity(0.12), lineWidth: 0.5))
            .overlay(alignment: .topTrailing) {
                if badge { Circle().fill(Theme.accentLight).frame(width: 8, height: 8).offset(x: 2, y: -2) }
            }
            .contentShape(RoundedRectangle(cornerRadius: 10))
    }
}

extension ToolbarContent {
    /// On iOS 26 and later, toolbar items share a glass capsule; the squared icon has its own look.
    @ToolbarContentBuilder
    func headerIconItem() -> some ToolbarContent {
        if #available(iOS 26.0, *) {
            self.sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}
