import SwiftUI

/// One slide as the congregation sees it: white text on black, scaled to fit the screen.
/// Used full size on the TV and as previews on the presenter.
struct SlideView: View {
    let slide: PresentSlide?
    var blank = false

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
        let base = size.height / 9   // lyric line height at full size
        if let image = slide.image, let url = URL(string: image) {
            AsyncImage(url: url) { phase in
                if let img = phase.image { img.resizable().scaledToFit() } else { ProgressView().tint(.white) }
            }
        } else if slide.type == "welcome" {
            VStack(spacing: base * 0.4) {
                Text(slide.title ?? slide.lines.first ?? "")
                    .font(.system(size: base * 1.4, weight: .bold, design: .serif))
                if let sub = slide.subtitle, !sub.isEmpty {
                    Text(sub).font(.system(size: base * 0.7)).opacity(0.85)
                }
            }
            .multilineTextAlignment(.center)
            .foregroundStyle(.white)
            .padding(base)
            .minimumScaleFactor(0.3)
        } else {
            VStack(spacing: base * 0.25) {
                ForEach(Array(slide.lines.enumerated()), id: \.offset) { i, line in
                    VStack(spacing: base * 0.05) {
                        Text(line)
                            .font(.system(size: base * 0.9, weight: .semibold))
                        if let sub = slide.subs?[safe: i] ?? nil, !sub.isEmpty {
                            Text(sub)
                                .font(.system(size: base * 0.55).italic())
                                .opacity(0.8)
                        }
                    }
                }
            }
            .multilineTextAlignment(.center)
            .foregroundStyle(.white)
            .lineLimit(2)
            .minimumScaleFactor(0.3)
            .padding(.horizontal, size.width * 0.05)
            .padding(.vertical, base * 0.5)
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
