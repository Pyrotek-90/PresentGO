/**
 * Parses raw lyric text into structured slides.
 * - Detects section labels: [Verse 1], [Chorus], Chorus:, etc.
 * - Filters out Tag / Echo / Instrumental sections (not for display)
 * - Deduplicates repeated sections with identical content (e.g. repeated Chorus)
 * - Strips common metadata lines that lyrics APIs prepend (author, contributor counts)
 * - Label appears only on the FIRST slide of each section; subsequent slides carry
 *   sectionLabel for reference but label: null so they don't repeat the heading.
 */

// Section types that are performance cues — not lyric content to display
const SKIP_SECTION = /^(tag|echo|instrumental|interlude|ad.?lib|spoken|background|vamp|repeat|outro vocal)/i

// Patterns that identify a section header line
const SECTION_HEADER = /^\[.+\]$|^(verse|chorus|bridge|pre-?chorus|tag|echo|outro|intro|hook|refrain|coda)\s*\d*:?$/i

// Metadata lines that lyrics APIs sometimes prepend — strip these
const META_LINE = /^(writer|author|written by|music by|lyrics by|artist|paroles|composers?|publisher|\d+\s*contributors?)[^\n]*/i

function stripMetadata(raw) {
  return raw
    .split('\n')
    .filter(line => !META_LINE.test(line.trim()))
    .join('\n')
    .trim()
}

export function formatLyrics(rawLyrics, linesPerSlide = 2) {
  if (!rawLyrics || !rawLyrics.trim()) return []

  const cleaned = stripMetadata(rawLyrics)
  const rawSections = cleaned.split(/\n\s*\n/)
  const slides = []

  // Content fingerprints for deduplication across sections
  const seen = new Set()

  for (const section of rawSections) {
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue

    // Detect section label on first line
    let label = null
    let contentLines = lines

    if (SECTION_HEADER.test(lines[0])) {
      label = lines[0].replace(/[\[\]]/g, '').trim()
      contentLines = lines.slice(1)
    }

    // Skip tag / echo / instrumental sections entirely
    if (label && SKIP_SECTION.test(label)) continue

    // Skip sections with no displayable content
    if (!contentLines.length) continue

    // Deduplicate: skip if this exact content was already added
    // (handles songs where Chorus appears verbatim 3× in the raw text)
    const fingerprint = contentLines.join('\n').toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)

    // Chunk content into slides of linesPerSlide lines each
    for (let i = 0; i < contentLines.length; i += linesPerSlide) {
      const chunk = contentLines.slice(i, i + linesPerSlide)
      if (!chunk.length) continue
      slides.push({
        lines: chunk,
        // Label only on the first slide of this section — subsequent slides
        // belong to the same section but don't repeat the heading
        label: i === 0 ? (label || null) : null,
        // sectionLabel is always set so Controller can reference the section
        sectionLabel: label || null,
      })
    }
  }

  return slides
}

/**
 * Builds a flat array of all slides across all items in a set,
 * with metadata about which item each slide belongs to.
 */
export function buildPresentationSlides(setItems, songs) {
  const all = []

  for (const item of setItems) {
    if (item.type === 'welcome') {
      all.push({
        type: 'welcome',
        itemId: item.id,
        itemTitle: item.content.title || 'Welcome',
        lines: [item.content.title, item.content.subtitle].filter(Boolean),
        label: null,
        sectionLabel: null,
      })
    } else if (item.type === 'song') {
      const song = songs.find(s => s.id === item.content.song_id)
      if (!song) continue
      const slides = (song.slides?.length ? song.slides : null)
        || formatLyrics(song.raw_lyrics, song.lines_per_slide || 2)
      for (const slide of slides) {
        all.push({
          type: 'song',
          itemId: item.id,
          itemTitle: song.title,
          lines: slide.lines,
          label: slide.label,
          sectionLabel: slide.sectionLabel || slide.label || null,
        })
      }
    } else if (item.type === 'announcement') {
      for (const slide of (item.content.slides || [])) {
        all.push({
          type: 'announcement',
          itemId: item.id,
          itemTitle: item.content.title || 'Announcement',
          lines: slide.lines,
          label: null,
          sectionLabel: null,
        })
      }
    } else if (item.type === 'blank') {
      all.push({
        type: 'blank',
        itemId: item.id,
        itemTitle: 'Blank',
        lines: [],
        label: null,
        sectionLabel: null,
      })
    } else if (item.type === 'media') {
      all.push({
        type: 'media',
        itemId: item.id,
        itemTitle: item.content?.media_name || 'Media',
        lines: [item.content?.media_name || 'Media file'],
        label: item.content?.media_category || 'Content',
        sectionLabel: item.content?.media_category || null,
      })
    }
  }

  return all
}
