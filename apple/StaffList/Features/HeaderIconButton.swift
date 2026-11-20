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

extension View {
    /// For a Menu in the top bar: keep the squared label as drawn (no tint, no system glyph),
    /// so it matches the HeaderIconButtons on the iPad as well as the iPhone.
    func headerMenuStyle() -> some View {
        self.menuStyle(.button)
            .buttonStyle(.plain)
            .menuIndicator(.hidden)
            .tint(.primary)
    }
}

/// A top-bar text button in the same squared style: Save, Done, Add, Send and the like.
/// Confirming actions are filled teal; others use the soft fill of the icon buttons.
struct HeaderTextButton: View {
    let title: String
    var prominent = true
    let action: () -> Void
    @Environment(\.isEnabled) private var enabled

    init(_ title: String, prominent: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.prominent = prominent
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 12)
                .frame(minWidth: 34, minHeight: 34)
                .foregroundStyle(prominent ? Color.white : Color.primary)
                .background(prominent ? Theme.accent : Color.primary.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(prominent ? Theme.accentLight.opacity(0.5) : Color.primary.opacity(0.12), lineWidth: 0.5))
                .opacity(enabled ? 1 : 0.4)
                .contentShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }
}

/// A squared Back button in place of the system one, on every pushed page.
struct SquaredBackButton: ViewModifier {
    @Environment(\.dismiss) private var dismiss
    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HeaderIconButton("Back", systemImage: "chevron.left") { dismiss() }
                }
                .headerIconItem()
            }
    }
}

extension View {
    func squaredBackButton() -> some View { modifier(SquaredBackButton()) }
}

/// Swiping from the left edge still goes back when the system Back button is replaced.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
