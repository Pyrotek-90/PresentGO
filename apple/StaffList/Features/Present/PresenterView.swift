import SwiftUI

/// Present a set from the iPad. The iPad shows the controller (current and next slide, every
/// slide grouped by song); a connected TV (Screen Mirroring / AirPlay or HDMI) shows only the
/// slide. Arrow keys, Space and Page Up/Down — what Bluetooth foot pedals send — move slides;
/// B blanks the screen. Stays in step with the web Controller and Present screen.
struct PresenterView: View {
    let set: ServiceSet
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var model = PresentationModel.shared
    private var tv = TVConnection.shared
    @State private var loading = true
    @State private var error: String?
    @State private var showSlideFullScreen = false
    @FocusState private var focused: Bool

    init(set: ServiceSet) { self.set = set }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Getting slides ready…")
                } else if let error {
                    ContentUnavailableView("Couldn't open the presentation", systemImage: "wifi.exclamationmark", description: Text(error))
                } else if model.slides.isEmpty {
                    ContentUnavailableView("No slides", systemImage: "rectangle.on.rectangle.slash",
                                           description: Text("Add songs or other items to this set first."))
                } else if sizeClass == .regular {
                    HStack(spacing: 0) {
                        stage.frame(maxWidth: .infinity)
                        Divider()
                        slideList.frame(width: 340)
                    }
                } else {
                    VStack(spacing: 0) {
                        stage
                        Divider()
                        slideList
                    }
                }
            }
            .background(Color(.systemBackground))
            .navigationTitle(set.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("End") { Task { await model.stop(); dismiss() } }
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        showSlideFullScreen = true
                    } label: {
                        Label("Show Slide Full Screen", systemImage: "arrow.up.left.and.arrow.down.right")
                    }
                    .disabled(model.slides.isEmpty)
                }
            }
            .fullScreenCover(isPresented: $showSlideFullScreen) {
                FullScreenSlide()
            }
        }
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(keys: [.rightArrow, .downArrow, .space, .pageDown, .return]) { _ in
            model.nextSlide(); return .handled
        }
        .onKeyPress(keys: [.leftArrow, .upArrow, .pageUp]) { _ in
            model.previousSlide(); return .handled
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "bB")) { _ in
            model.toggleBlank(); return .handled
        }
        .task { await load() }
        .onDisappear { Task { await model.stop() } }
    }

    // MARK: Pieces

    private var stage: some View {
        VStack(spacing: 14) {
            statusLine
            SlideView(slide: model.current, blank: model.blank)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(alignment: .topLeading) {
                    if model.blank {
                        Text("BLANK").font(.caption.bold()).padding(6)
                            .background(.red, in: Capsule()).foregroundStyle(.white).padding(8)
                    }
                }
                .onTapGesture { model.nextSlide() }
                .accessibilityLabel("Current slide. Tap for the next slide.")

            HStack(spacing: 12) {
                Button { model.previousSlide() } label: {
                    Label("Back", systemImage: "chevron.left").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(model.index == 0)

                Button { model.toggleBlank() } label: {
                    Label(model.blank ? "Show" : "Blank", systemImage: model.blank ? "eye" : "eye.slash")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(model.blank ? .red : nil)

                Button { model.nextSlide() } label: {
                    Label("Next", systemImage: "chevron.right").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.index >= model.slides.count - 1)
            }
            .labelStyle(.titleAndIcon)

            if sizeClass == .regular, let next = model.next {
                VStack(alignment: .leading, spacing: 6) {
                    Text("NEXT").font(.caption.bold()).foregroundStyle(.secondary)
                    SlideView(slide: next).frame(maxWidth: 320).clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
        }
        .padding()
    }

    private var statusLine: some View {
        HStack(spacing: 14) {
            Label(tv.connected ? "TV: slides only" : "No TV connected",
                  systemImage: tv.connected ? "tv" : "tv.slash")
            if model.offline {
                Label("Offline copy", systemImage: "icloud.slash")
            } else if model.connected {
                Label("Live with web", systemImage: "dot.radiowaves.left.and.right")
            }
            Spacer()
            Text("\(model.index + 1) / \(model.slides.count)").monospacedDigit()
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
        .help("Connect a TV with Screen Mirroring (AirPlay) or an HDMI adapter.")
    }

    private var slideList: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(Array(model.groups.enumerated()), id: \.offset) { _, group in
                    Section(group.title) {
                        ForEach(group.range, id: \.self) { i in
                            slideRow(i).id(i)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .onChange(of: model.index) { _, i in
                withAnimation { proxy.scrollTo(i, anchor: .center) }
            }
        }
    }

    private func slideRow(_ i: Int) -> some View {
        let slide = model.slides[i]
        let text = slide.type == "blank" ? "Blank" : (slide.image != nil ? "Image" : slide.lines.joined(separator: " / "))
        return Button {
            model.go(to: i)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                if let label = slide.label { Text(label).font(.caption.bold()).foregroundStyle(.tint) }
                Text(text.isEmpty ? " " : text).font(.subheadline).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .tint(.primary)
        .listRowBackground(i == model.index ? Color.accentColor.opacity(0.25) : nil)
    }

    private func load() async {
        loading = true
        defer { loading = false; focused = true }
        do {
            let (presentation, offline) = try await OfflineStore.presentation(for: set.id)
            await model.start(presentation, offline: offline)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// The current slide filling the iPad (or iPhone) — for when there's no TV, or for mirroring.
/// Tap the right side for the next slide, the left side to go back; swipe down to close.
private struct FullScreenSlide: View {
    @Environment(\.dismiss) private var dismiss
    private var model = PresentationModel.shared

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                SlideView(slide: model.current, blank: model.blank)
            }
            .contentShape(Rectangle())
            .onTapGesture { location in
                if location.x < geo.size.width / 3 { model.previousSlide() } else { model.nextSlide() }
            }
            .gesture(DragGesture().onEnded { v in if v.translation.height > 120 { dismiss() } })
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
    }
}
