import UIKit

/// One text size per song (or other item), like the web (src/lib/slideFit.js): the longest line
/// fills 85% of the slide width, unless the tallest slide would then be too tall, in which case
/// it shrinks to fit 80% of the height. The same rule sizes the TV and every preview.
struct SlideFit: Hashable, Sendable {
    var widestEm: CGFloat = 1
    var rows: CGFloat = 1

    static let lineHeight: CGFloat = 1.25
    static let gapEm: CGFloat = 0.5
    static let subScale: CGFloat = 0.55

    /// Font size (points) for a slide of this size.
    func fontSize(for size: CGSize) -> CGFloat {
        min(size.width * 0.85 / max(widestEm, 1), size.height * 0.80 / max(rows, 1))
    }

    init() {}

    init(_ slides: [PresentSlide]) {
        var widest: CGFloat = 0
        var rows: CGFloat = 1
        for s in slides {
            for line in s.lines { widest = max(widest, Self.widthEm(line)) }
            let subs = (s.subs ?? []).compactMap { $0 }.filter { !$0.isEmpty }
            for t in subs { widest = max(widest, Self.widthEm("[\(t)]") * Self.subScale) }
            let n = CGFloat(s.lines.count)
            let subRows = CGFloat(subs.count) * Self.subScale
            rows = max(rows, n * Self.lineHeight + subRows * Self.lineHeight + max(0, n - 1) * Self.gapEm)
        }
        widestEm = max(widest, 1)
        self.rows = rows
    }

    private static let font = UIFont.systemFont(ofSize: 100, weight: .bold)

    static func widthEm(_ text: String) -> CGFloat {
        guard !text.isEmpty else { return 0 }
        return (text as NSString).size(withAttributes: [.font: font]).width / 100
    }
}
