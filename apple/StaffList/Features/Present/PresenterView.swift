import SwiftUI

/// Present a set — the same controller as the web app (src/pages/Controller.jsx):
///   header:  ● LIVE · set name · TV · Slide x of y · End
///   top:     Now Showing | Up Next | Run Order
///   row:     section buttons (V1 C V2 C B) · item title · Loop · Blank · Tiles/Text · ‹ ›
///   grid:    every slide of the selected item, as slide tiles or as large text
/// A TV (Screen Mirroring / AirPlay or HDMI) shows only the Now Showing slide. Arrow keys,
/// Space and Page Up/Down (Bluetooth foot pedals) move slides; B blanks; Esc ends.
struct PresenterView: View {
    let set: ServiceSet
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    private var model = PresentationModel.shared
    private var tv = TVConnection.shared
    @State private var loading = true
    @State private var error: String?
    @State private var started = false
    @State private var selectedGroupID: String?
    @AppStorage("controllerGridMode") private var gridMode = "tiles"
    @State private var showSlideFullScreen = false
    @FocusState private var focused: Bool

    init(set: ServiceSet) { self.set = set }

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            if loading {
                ProgressView("Getting slides ready…").tint(.white).foregroundStyle(Theme.muted)
            } else if let error {
                ContentUnavailableView("Couldn't open the presentation", systemImage: "wifi.exclamationmark", description: Text(error))
                    .overlay(alignment: .topLeading) { Button("Close") { dismiss() }.padding() }
            } else if !started {
                ConnectStep(setName: set.name, slideCount: model.slides.count, tv: tv,
                            onStart: { started = true; focused = true },
                            onBack: { Task { await model.stop(); dismiss() } })
            } else {
                controller
            }
        }
        .preferredColorScheme(.dark)
        .focusable()
        .focused($focused)
        .focusEffectDisabled()
        .onKeyPress(keys: [.rightArrow, .downArrow, .space, .pageDown]) { _ in
            guard started else { return .ignored }
            model.nextSlide(); return .handled
        }
        .onKeyPress(keys: [.leftArrow, .upArrow, .pageUp]) { _ in
            guard started else { return .ignored }
            model.previousSlide(); return .handled
        }
        .onKeyPress(characters: CharacterSet(charactersIn: "bB")) { _ in
            guard started else { return .ignored }
            model.toggleBlank(); return .handled
        }
        .onKeyPress(.escape) { endPresentation(); return .handled }
        .task { await load() }
        .onDisappear { Task { await model.stop() } }
        .fullScreenCover(isPresented: $showSlideFullScreen) { FullScreenSlide() }
    }

    // MARK: - Controller

    private var groupForGrid: PresentationModel.Group? {
        model.groups.first { $0.id == selectedGroupID } ?? model.currentGroup
    }

    private var controller: some View {
        VStack(spacing: 0) {
            header
            VStack(spacing: 0) {
                topRow
                controlRow
            }
            .background(Theme.panel)
            .overlay(alignment: .bottom) { Theme.border.frame(height: 1) }
            SlideGrid(group: groupForGrid, mode: gridMode)
        }
        .onChange(of: model.currentGroup?.id) { _, id in selectedGroupID = id }
        .onAppear { selectedGroupID = model.currentGroup?.id }
    }

    private var header: some View {
        HStack(spacing: 8) {
            LiveDot()
            Text("LIVE").font(.caption.weight(.bold)).foregroundStyle(Theme.red).tracking(0.5)
            Text("·").foregroundStyle(Theme.muted)
            Text(set.name).font(.subheadline.weight(.medium)).lineLimit(1)
            Spacer(minLength: 8)
            if model.offline {
                Label("Offline", systemImage: "icloud.slash").font(.caption).foregroundStyle(Theme.muted)
            } else if model.connected {
                Label("Web", systemImage: "dot.radiowaves.left.and.right").font(.caption).foregroundStyle(Theme.muted)
                    .help("In step with the web Controller and Present screen")
            }
            Button { showSlideFullScreen = true } label: {
                HStack(spacing: 5) {
                    Image(systemName: "tv")
                    Text(tv.connected ? "TV" : "No TV")
                }
                .font(.caption.weight(.medium))
                .padding(.horizontal, 8).frame(height: 28)
                .foregroundStyle(tv.connected ? Theme.green : Theme.muted)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(tv.connected ? Theme.green.opacity(0.4) : Theme.border))
            }
            .buttonStyle(.plain)
            .help(tv.connected ? "The TV shows only the slide. Tap to also show it full screen here." : "No TV — Control Center → Screen Mirroring. Tap to show the slide full screen here.")
            if sizeClass == .regular {
                Text("Slide \(model.index + 1) of \(model.slides.count)").font(.caption).foregroundStyle(Theme.muted).monospacedDigit()
            }
            Button(action: endPresentation) {
                Label("End", systemImage: "xmark")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(Theme.red, in: RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .overlay(alignment: .bottom) { Theme.border.frame(height: 1) }
    }

    private var topRow: some View {
        GeometryReader { geo in
            let runOrderWidth: CGFloat = sizeClass == .regular ? (geo.size.width > 1100 ? 250 : 210) : 0
            let gaps: CGFloat = sizeClass == .regular ? 24 : 12
            let slideWidth = min((geo.size.width - 32 - runOrderWidth - gaps) / 2, geo.size.height / 9 * 16)
            HStack(alignment: .top, spacing: 12) {
                Spacer(minLength: 0)
                slideSection(title: model.blank ? "● Screen Blanked" : "● Now Showing", titleColor: Theme.red,
                             slide: model.blank ? nil : model.current, live: !model.blank, width: slideWidth) {}
                slideSection(title: upNextTitle, titleColor: Theme.muted, slide: model.next, live: false, width: slideWidth) {
                    model.nextSlide()
                }
                if sizeClass == .regular {
                    runOrder.frame(width: runOrderWidth, height: slideWidth / 16 * 9 + 20)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .frame(height: sizeClass == .regular ? 270 : 150)
    }

    private var upNextTitle: String {
        guard let next = model.next else { return "Up Next" }
        if let label = next.label { return "Up Next · \(label)" }
        if next.itemId != model.current?.itemId, let t = next.itemTitle { return "Up Next · \(t)" }
        return "Up Next"
    }

    private func slideSection(title: String, titleColor: Color, slide: PresentSlide?, live: Bool, width: CGFloat, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(titleColor).lineLimit(1)
            Button(action: action) {
                SlideView(slide: slide, fit: model.fit(for: slide))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(live ? Theme.red.opacity(0.7) : Theme.border, lineWidth: 2))
                    .shadow(color: live ? Theme.red.opacity(0.15) : .clear, radius: 10)
            }
            .buttonStyle(.plain)
        }
        .frame(width: max(width, 80))
    }

    private var runOrder: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Run Order").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(model.groups) { g in
                        let active = model.currentGroup?.id == g.id
                        let selected = selectedGroupID == g.id
                        Button {
                            selectedGroupID = g.id
                            model.go(to: g.firstIndex)
                        } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(active ? Theme.red : .clear)
                                    .overlay(Circle().stroke(active ? .clear : Color(white: 0.32)))
                                    .frame(width: 8, height: 8)
                                Text(g.title).lineLimit(1)
                                    .font(.subheadline.weight(active ? .semibold : .regular))
                                    .foregroundStyle(active ? .white : Theme.muted)
                                Spacer(minLength: 4)
                                if active {
                                    Text("\(model.index - g.firstIndex + 1)/\(g.range.count)")
                                        .font(.caption2).foregroundStyle(Theme.red).monospacedDigit()
                                }
                            }
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            .background(active ? Color(white: 0.2) : selected ? Color.white.opacity(0.04) : .clear)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Theme.border.frame(height: 1)
                    }
                }
            }
            .background(Color(white: 0.14), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var controlRow: some View {
        HStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if groupForGrid?.id == model.currentGroup?.id {
                        let sections = model.currentSections
                        let active = sections.last { $0.index <= model.index }?.index
                        ForEach(Array(sections.enumerated()), id: \.offset) { _, sec in
                            Button { model.go(to: sec.index) } label: {
                                Text(Self.abbreviate(sec.label))
                                    .font(.caption.weight(.semibold))
                                    .lineLimit(1)
                                    .padding(.horizontal, 10)
                                    .frame(minWidth: 40, minHeight: 32)
                                    .foregroundStyle(active == sec.index ? Theme.accentLight : Theme.muted)
                                    .background(active == sec.index ? Theme.accent.opacity(0.25) : .clear, in: RoundedRectangle(cornerRadius: 8))
                                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(active == sec.index ? Theme.accent : Theme.border))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity)

            if sizeClass == .regular, let title = groupForGrid?.title {
                Text(title).font(.subheadline.weight(.semibold)).lineLimit(1).frame(maxWidth: 260)
            }

            HStack(spacing: 6) {
                toggleButton("Loop", systemImage: "repeat", on: model.looping) { model.looping.toggle() }
                    .help("Loop this item's slides every \(Int(PresentationModel.loopSeconds)) seconds")
                toggleButton(model.blank ? "Unblank" : "Blank", systemImage: "xmark.square", on: model.blank, onColor: .white) { model.toggleBlank() }
                    .help("Blank the screen (B)")
                HStack(spacing: 0) {
                    modeButton("tiles", "square.grid.2x2", "Tile view")
                    modeButton("text", "text.alignleft", "Text view")
                }
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                Button { model.previousSlide() } label: {
                    Image(systemName: "chevron.left").frame(minWidth: 40, minHeight: 32)
                        .foregroundStyle(Theme.muted)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
                }
                .buttonStyle(.plain)
                .disabled(model.index == 0)
                .opacity(model.index == 0 ? 0.3 : 1)
                .accessibilityLabel("Previous slide")
                Button { model.nextSlide() } label: {
                    Image(systemName: "chevron.right").frame(minWidth: 40, minHeight: 32)
                        .foregroundStyle(Theme.accentLight)
                        .background(Theme.accent.opacity(0.25), in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.accent))
                }
                .buttonStyle(.plain)
                .disabled(model.index >= model.slides.count - 1)
                .opacity(model.index >= model.slides.count - 1 ? 0.3 : 1)
                .accessibilityLabel("Next slide")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func toggleButton(_ title: String, systemImage: String, on: Bool, onColor: Color = Theme.accentLight, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .labelStyle(sizeClass == .regular ? AnyLabelStyle(.titleAndIcon) : AnyLabelStyle(.iconOnly))
                .padding(.horizontal, 10).frame(minHeight: 32)
                .foregroundStyle(on ? onColor : Theme.muted)
                .background(on ? (onColor == .white ? Color.white.opacity(0.1) : Theme.accent.opacity(0.25)) : .clear, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? (onColor == .white ? .white : Theme.accent) : Theme.border))
        }
        .buttonStyle(.plain)
    }

    private func modeButton(_ mode: String, _ icon: String, _ label: String) -> some View {
        Button { gridMode = mode } label: {
            Image(systemName: icon)
                .frame(width: 40, height: 32)
                .foregroundStyle(gridMode == mode ? Theme.accentLight : Theme.muted)
                .background(gridMode == mode ? Theme.accent.opacity(0.25) : .clear)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// "Verse 1" → "V1", "Chorus" → "C", "Bridge" → "B", "Pre-Chorus" → "PC" — as on the web.
    static func abbreviate(_ label: String) -> String {
        let l = label.trimmingCharacters(in: .whitespaces)
        let lower = l.lowercased()
        if lower.hasPrefix("verse") { return "V" + l.dropFirst(5).trimmingCharacters(in: .whitespaces) }
        switch lower {
        case "chorus": return "C"
        case "bridge": return "B"
        case "pre-chorus", "prechorus": return "PC"
        case "tag": return "T"
        case "outro": return "Out"
        case "intro": return "In"
        default: return l
        }
    }

    // MARK: - Loading and ending

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

    private func endPresentation() {
        Task {
            await model.end()
            dismiss()
        }
    }
}

// MARK: - Slide grid

/// Every slide of one item: slide tiles, or large text cards (like ProPresenter's text view).
/// Keeps the live slide in view.
private struct SlideGrid: View {
    let group: PresentationModel.Group?
    let mode: String
    private var model = PresentationModel.shared
    @Environment(\.horizontalSizeClass) private var sizeClass

    init(group: PresentationModel.Group?, mode: String) {
        self.group = group
        self.mode = mode
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if let group {
                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(Array(group.range), id: \.self) { i in
                            cell(i).id(i)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
            }
            .onChange(of: model.index) { _, i in
                withAnimation { proxy.scrollTo(i, anchor: .top) }
            }
            .onChange(of: group?.id) { _, _ in
                proxy.scrollTo(model.index, anchor: .top)
            }
        }
    }

    private var columns: [GridItem] {
        let count = mode == "text" ? (sizeClass == .regular ? 3 : 2) : (sizeClass == .regular ? 4 : 3)
        return Array(repeating: GridItem(.flexible(), spacing: 10), count: count)
    }

    @ViewBuilder private func cell(_ i: Int) -> some View {
        let slide = model.slides[i]
        let live = i == model.index && !model.blank
        Button { model.go(to: i) } label: {
            if mode == "text" { textCard(slide, i, live) } else { tile(slide, i, live) }
        }
        .buttonStyle(.plain)
    }

    private func tile(_ slide: PresentSlide, _ i: Int, _ live: Bool) -> some View {
        SlideView(slide: slide, fit: model.fit(for: slide))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(live ? Theme.red.opacity(0.7) : Theme.border, lineWidth: 2))
            .overlay(alignment: .topLeading) {
                if let label = slide.label {
                    Text(label.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.5)
                        .foregroundStyle(Color(white: 0.62))
                        .padding(.horizontal, 4).background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 3))
                        .padding(5)
                }
            }
            .overlay(alignment: .topTrailing) {
                if live { Circle().fill(Theme.red).frame(width: 8, height: 8).padding(6) }
            }
            .overlay(alignment: .bottomTrailing) {
                Text("\(i + 1)").font(.system(size: 9)).foregroundStyle(Color(white: 0.4)).padding(5)
            }
    }

    private func textCard(_ slide: PresentSlide, _ i: Int, _ live: Bool) -> some View {
        VStack(spacing: 6) {
            HStack {
                Text((slide.label ?? " ").uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(live ? Theme.red : Color(white: 0.45))
                Spacer()
                Text("\(i + 1)").font(.system(size: 10)).foregroundStyle(Color(white: 0.35))
            }
            if let image = slide.image, let url = URL(string: image) {
                AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.black }
                    .aspectRatio(16 / 9, contentMode: .fit)
            } else if slide.type == "welcome" {
                VStack(spacing: 2) {
                    Text(slide.title ?? "").font(.system(size: 15, weight: .bold))
                    if let s = slide.subtitle { Text(s).font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(white: 0.62)) }
                }
            } else if slide.lines.isEmpty {
                Text("Blank").font(.subheadline.italic()).foregroundStyle(Color(white: 0.4))
            } else {
                VStack(spacing: 4) {
                    ForEach(Array(slide.lines.enumerated()), id: \.offset) { n, line in
                        VStack(spacing: 1) {
                            Text(line).font(.system(size: 15, weight: .bold))
                            if let sub = slide.subs?[safe: n] ?? nil, !sub.isEmpty {
                                Text("[\(sub)]").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color(white: 0.62))
                            }
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(.white)
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 12)
        .frame(maxWidth: .infinity, minHeight: 90, alignment: .top)
        .background(live ? Theme.red.opacity(0.1) : Theme.panel, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(live ? Theme.red.opacity(0.7) : Theme.border, lineWidth: 2))
    }
}

// MARK: - Connect step

/// Before controlling: the web's "Presentation Mode" steps, with the TV's live status.
private struct ConnectStep: View {
    let setName: String
    let slideCount: Int
    let tv: TVConnection
    var onStart: () -> Void
    var onBack: () -> Void
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button(action: onBack) { Label("Program", systemImage: "arrow.left").font(.subheadline) }
                    .buttonStyle(.plain).foregroundStyle(Theme.muted)
                Image(systemName: "tv").foregroundStyle(Theme.accent)
                Text(setName).font(.subheadline.weight(.medium)).lineLimit(1)
                Text("· Presentation Mode").font(.caption).foregroundStyle(Theme.muted)
                Spacer()
            }
            .padding(.horizontal, 24).padding(.vertical, 16)
            .overlay(alignment: .bottom) { Theme.border.frame(height: 1) }

            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 8) {
                        Image(systemName: "wifi")
                            .font(.system(size: 26)).foregroundStyle(Theme.accentLight)
                            .frame(width: 56, height: 56)
                            .background(Theme.accent.opacity(0.2), in: RoundedRectangle(cornerRadius: 16))
                        Text("Presentation Mode").font(.title3.weight(.semibold))
                        Text("Your program is ready (\(slideCount) slides). The TV shows only the Now Showing slide.")
                            .font(.subheadline).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                    }

                    step(1, "Connect to the same Wi-Fi") {
                        bullet("Your \(device) and your Apple TV (or AirPlay TV) must be on the **same Wi-Fi network**, or AirPlay won't find the TV.")
                    }
                    step(2, "Turn on Screen Mirroring") {
                        bullet("Swipe down from the top-right corner to open **Control Center** → tap **Screen Mirroring** → choose your TV.")
                        bullet("The TV shows **only the Now Showing slide**, full screen. Your \(device) keeps the controller with Up Next, the run order and all your slides.")
                        tvStatus
                    }
                    step(3, "Run the service from here") {
                        bullet("Tap a slide to put it on the TV. **Blank** clears the TV; **Loop** cycles the current item.")
                        bullet("Keep StaffList open on this screen while presenting. If you switch apps, iOS goes back to mirroring the whole screen.")
                    }

                    Button(action: onStart) {
                        Label("Start Controlling", systemImage: "arrow.right")
                            .labelStyle(TrailingIconLabelStyle())
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                    Text("No display? You can still use the controller to rehearse, and connect the TV at any time.")
                        .font(.caption).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .frame(maxWidth: 520)
                .padding(24)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var device: String { sizeClass == .regular ? "iPad" : "iPhone" }

    private var tvStatus: some View {
        HStack(spacing: 8) {
            Circle().fill(tv.connected ? Theme.green : Color(white: 0.33)).frame(width: 8, height: 8)
            Text(tv.connected ? "TV connected. It's showing only the slide." : "Waiting for a TV…")
        }
        .font(.subheadline)
        .foregroundStyle(tv.connected ? Theme.green : Theme.muted)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tv.connected ? Theme.green.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(tv.connected ? Theme.green.opacity(0.4) : Theme.border))
    }

    private func step<C: View>(_ n: Int, _ title: String, @ViewBuilder _ body: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("\(n)").font(.caption.weight(.semibold)).foregroundStyle(Theme.accentLight)
                    .frame(width: 24, height: 24).background(Theme.accent.opacity(0.2), in: Circle())
                Text(title).font(.subheadline.weight(.medium))
            }
            body()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
    }

    private func bullet(_ text: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•").foregroundStyle(Theme.accentLight)
            Text(text).foregroundStyle(Theme.muted)
        }
        .font(.subheadline)
    }
}

// MARK: - Full-screen slide

/// The current slide filling this screen — for rehearsing without a TV, or for mirroring.
/// Tap the right side for the next slide, the left side to go back; swipe down to close.
private struct FullScreenSlide: View {
    @Environment(\.dismiss) private var dismiss
    private var model = PresentationModel.shared

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                SlideView(slide: model.current, blank: model.blank, fit: model.fit(for: model.current))
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

// MARK: - Look

/// The web Controller's colors (tailwind.config.js / index.css, dark theme).
enum Theme {
    static let background = Color(red: 0.039, green: 0.039, blue: 0.039)   // #0a0a0a
    static let panel = Color(red: 0.102, green: 0.102, blue: 0.102)        // #1a1a1a
    static let border = Color(red: 0.165, green: 0.165, blue: 0.165)       // #2a2a2a
    static let muted = Color(red: 0.64, green: 0.64, blue: 0.64)
    static let accent = Color(red: 0.055, green: 0.455, blue: 0.565)       // #0e7490
    static let accentLight = Color(red: 0.133, green: 0.827, blue: 0.933)  // #22d3ee
    static let red = Color(red: 0.937, green: 0.267, blue: 0.267)          // #ef4444
    static let green = Color(red: 0.29, green: 0.871, blue: 0.502)         // #4ade80
}

private struct LiveDot: View {
    @State private var pulse = false
    var body: some View {
        Circle().fill(Theme.red).frame(width: 8, height: 8)
            .opacity(pulse ? 0.35 : 1)
            .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
            .onAppear { pulse = true }
    }
}

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}

private struct AnyLabelStyle: LabelStyle {
    private let make: (Configuration) -> AnyView
    init<S: LabelStyle>(_ style: S) { make = { AnyView(style.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
