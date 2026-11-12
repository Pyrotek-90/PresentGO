import SwiftUI

/// Section labels in the order they appear in lyrics ("[Verse 1]" lines), each once.
func lyricSections(_ lyrics: String) -> [String] {
    var seen = Set<String>()
    var out: [String] = []
    for line in lyrics.components(separatedBy: "\n") {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.hasPrefix("["), t.hasSuffix("]"), t.count > 2 else { continue }
        let label = String(t.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
        if !label.isEmpty, seen.insert(label).inserted { out.append(label) }
    }
    return out
}

/// A song's order of sections from its saved slides (a labelled slide starts a section).
func slideSequence(_ slides: [Slide]?) -> [String] {
    (slides ?? []).compactMap(\.label)
}

/// Edit an order of sections: drag to reorder, swipe to remove, add any section again
/// (e.g. Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus). Used for a song's own order and
/// for one set's order of a song.
struct ArrangementEditor: View {
    let title: String
    @Binding var order: [String]
    let sections: [String]
    var resetLabel = "Reset to Lyrics Order"
    var onReset: (() -> Void)? = nil

    var body: some View {
        List {
            Section {
                ForEach(Array(order.enumerated()), id: \.offset) { _, label in
                    Text(label)
                }
                .onMove { order.move(fromOffsets: $0, toOffset: $1) }
                .onDelete { order.remove(atOffsets: $0) }
            } footer: {
                Text("Drag to reorder, swipe to remove. Add a section again to repeat it.")
            }
            Section("Add Section") {
                ForEach(sections, id: \.self) { label in
                    Button {
                        order.append(label)
                    } label: {
                        Label(label, systemImage: "plus.circle")
                    }
                }
            }
            Section {
                Button(resetLabel) {
                    if let onReset { onReset() } else { order = sections }
                }
            }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// One translation of a song's lyrics (same [Section] labels and line count as the lyrics, so
/// each line lines up with its lyric line on the slides).
struct TranslationEditorView: View {
    @Binding var translation: Translation
    var onDelete: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Name") {
                TextField("e.g. English Translation", text: $translation.title)
            }
            Section {
                TextEditor(text: $translation.text)
                    .frame(minHeight: 320)
                    .autocorrectionDisabled()
            } header: {
                Text("Text")
            } footer: {
                Text("Keep the same [Section] labels and one line per lyric line.")
            }
            Section {
                Button("Delete Translation", role: .destructive) {
                    onDelete()
                    dismiss()
                }
            }
        }
        .navigationTitle(translation.title.isEmpty ? "Translation" : translation.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Choose the other keys a team plays a song in.
struct KeyListPicker: View {
    let original: String
    @Binding var selected: Set<String>

    var body: some View {
        List {
            Section {
                ForEach(MusicKeys.options(like: original).filter { $0 != original }, id: \.self) { key in
                    Button {
                        if selected.contains(key) { selected.remove(key) } else { selected.insert(key) }
                    } label: {
                        HStack {
                            Text(Song.shortKey(key))
                            Spacer()
                            if selected.contains(key) { Image(systemName: "checkmark").foregroundStyle(.tint) }
                        }
                    }
                    .tint(.primary)
                }
            } footer: {
                Text("These show first when choosing a key for a set.")
            }
        }
        .navigationTitle("Other Keys")
        .navigationBarTitleDisplayMode(.inline)
    }
}

let songThemes = ["Worship", "Praise", "Communion", "Offering", "Opening", "Closing", "Prayer", "Salvation", "Healing"]
