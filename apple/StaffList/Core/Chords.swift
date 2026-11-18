import Foundation

/// Chord transposition on the device, a line-for-line port of src/lib/chords.js (the same rules
/// the web app and the API use), so changing key is instant and works offline.
enum Chords {
    private static let sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let flat = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    private static let notePC: [String: Int] = [
        "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
        "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11,
    ]
    private static let flatMajorPCs: Set<Int> = [5, 10, 3, 8, 1, 6]

    private static let chordRE = try! NSRegularExpression(
        pattern: #"^([A-G][#b♭]?)((?:m|maj|min|dim|aug|sus|add|M|\d|\+|°|ø|-|\(|\)|#|b|♭)*)(?:/([A-G][#b♭]?))?$"#)
    private static let barRE = try! NSRegularExpression(
        pattern: #"^(\|{1,2}:?|:?\|{1,2}|/+|%|x\d+|\d+x)$"#, options: [.caseInsensitive])
    private static let keyRE = try! NSRegularExpression(
        pattern: #"^([A-G])([#♭b]?)\s*(Major|Minor)?"#, options: [.caseInsensitive])

    struct Key { let root: String; let accidental: String; let minor: Bool }

    static func parseKey(_ s: String?) -> Key? {
        guard let s, let m = keyRE.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) else { return nil }
        func group(_ i: Int) -> String { Range(m.range(at: i), in: s).map { String(s[$0]) } ?? "" }
        let acc = group(2) == "♭" ? "b" : group(2)
        return Key(root: group(1).uppercased(), accidental: acc, minor: group(3).lowercased() == "minor")
    }

    private static func tonicPC(_ key: String?) -> Int? {
        parseKey(key).flatMap { notePC[$0.root + $0.accidental] }
    }

    private static func useFlats(_ key: String?) -> Bool {
        guard let k = parseKey(key), let pc = notePC[k.root + k.accidental] else { return false }
        return flatMajorPCs.contains(k.minor ? (pc + 3) % 12 : pc)
    }

    private static func matches(_ re: NSRegularExpression, _ s: String) -> NSTextCheckingResult? {
        re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s))
    }

    static func isBarToken(_ t: String) -> Bool { matches(barRE, t) != nil }

    static func isChordToken(_ t: String) -> Bool {
        if matches(chordRE, t) != nil { return true }
        guard t.count > 2, t.hasPrefix("("), t.hasSuffix(")") else { return false }
        return matches(chordRE, String(t.dropFirst().dropLast())) != nil
    }

    static func isChordLine(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, !t.hasPrefix("[") else { return false }
        let tokens = t.split(whereSeparator: \.isWhitespace).map(String.init)
        return tokens.contains(where: isChordToken) && tokens.allSatisfy { isChordToken($0) || isBarToken($0) }
    }

    private static func transposeNote(_ note: String, _ semis: Int, _ flats: Bool) -> String {
        guard let pc = notePC[note.replacingOccurrences(of: "♭", with: "b")] else { return note }
        return (flats ? flat : sharp)[(pc + semis + 120) % 12]
    }

    private static func shift(_ tok: String, _ semis: Int, _ flats: Bool) -> String {
        if isBarToken(tok) { return tok }
        guard let m = matches(chordRE, tok) else {
            if tok.count > 2, tok.hasPrefix("("), tok.hasSuffix(")") {
                return "(\(shift(String(tok.dropFirst().dropLast()), semis, flats)))"
            }
            return tok
        }
        func group(_ i: Int) -> String? { Range(m.range(at: i), in: tok).map { String(tok[$0]) } }
        let root = transposeNote(group(1) ?? "", semis, flats)
        let bass = group(3).map { "/" + transposeNote($0, semis, flats) } ?? ""
        return root + (group(2) ?? "") + bass
    }

    /// The chart in another key. Chord lines keep their spacing so chords stay over their words.
    static func transpose(_ chart: String, from: String?, to: String?) -> String {
        guard let a = tonicPC(from), let b = tonicPC(to), !chart.isEmpty else { return chart }
        let semis = (b - a + 12) % 12
        if semis == 0 { return chart }
        let flats = useFlats(to)
        return chart.components(separatedBy: "\n").map { line in
            guard isChordLine(line) else { return line }
            // Alternating runs of text and whitespace.
            var parts: [String] = []
            var run = ""
            var runIsSpace: Bool?
            for ch in line {
                let space = ch == " " || ch == "\t"
                if runIsSpace == nil || runIsSpace == space { run.append(ch) } else { parts.append(run); run = String(ch) }
                runIsSpace = space
            }
            if !run.isEmpty { parts.append(run) }
            var out = ""
            var carry = 0   // characters the previous chord grew by, taken from the next gap
            for p in parts {
                if p.first == " " || p.first == "\t" {
                    out += String(repeating: " ", count: max(1, p.count - carry))
                    carry = 0
                } else {
                    let next = shift(p, semis, flats)
                    carry = next.count - p.count
                    out += next
                }
            }
            return out
        }.joined(separator: "\n")
    }

    /// Every key a song can be played in, in its mode, like transposeKeyOptions (original excluded).
    static func keyOptions(_ original: String?) -> [String] {
        guard let k = parseKey(original), let origPC = tonicPC(original) else { return [] }
        let mode = k.minor ? "Minor" : "Major"
        let names = k.minor
            ? ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"]
            : ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
        return names.enumerated().filter { $0.offset != origPC }
            .map { "\($0.element.replacingOccurrences(of: "b", with: "♭")) \(mode)" }
    }

    /// The same key written differently ("Bb Major", "B♭ Major", "Bb") counts as one.
    static func sameKey(_ a: String?, _ b: String?) -> Bool {
        guard let x = parseKey(a), let y = parseKey(b) else { return false }
        return tonicPC(a) == tonicPC(b) && x.minor == y.minor
    }
}
