import SwiftUI

/// One slide as the congregation sees it — the same look as the web Present screen: bold white
/// lyrics on black, translation lines in grey brackets, one text size per song (`fit`).
/// Used full size on the TV and as every preview on the controller.
struct SlideView: View {
    let slide: PresentSlide?
    var blank = false
    var fit: SlideFit? = nil

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black
                if !blank, let slide {
                    content(slide, size: geo.size)
                }
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
    }

    @ViewBuilder private func content(_ slide: PresentSlide, size: CGSize) -> some View {
        if let image = slide.image, let url = URL(string: image) {
            AsyncImage(url: url) { phase in
                if let img = phase.image { img.resizable().scaledToFit() } else { ProgressView().tint(.white) }
            }
        } else if slide.type == "welcome" {
            let base = size.height / 9
            VStack(spacing: base * 0.4) {
                Text(slide.title ?? slide.lines.first ?? "")
                    .font(.system(size: base * 1.4, weight: .bold))
                if let sub = slide.subtitle, !sub.isEmpty {
                    Text(sub).font(.system(size: base * 0.7, weight: .semibold)).foregroundStyle(.white.opacity(0.7))
                }
            }
            .multilineTextAlignment(.center)
            .foregroundStyle(.white)
            .padding(base)
            .minimumScaleFactor(0.3)
        } else {
            let fontSize = (fit ?? SlideFit([slide])).fontSize(for: size)
            VStack(spacing: fontSize * SlideFit.gapEm) {
                ForEach(Array(slide.lines.enumerated()), id: \.offset) { i, line in
                    VStack(spacing: 0) {
                        Text(line)
                            .font(.system(size: fontSize, weight: .bold))
                            .foregroundStyle(.white)
                        if let sub = slide.subs?[safe: i] ?? nil, !sub.isEmpty {
                            Text("[\(sub)]")
                                .font(.system(size: fontSize * SlideFit.subScale, weight: .bold))
                                .foregroundStyle(Color(white: 0.62))
                        }
                    }
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .multilineTextAlignment(.center)
            .frame(width: size.width, height: size.height)
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
