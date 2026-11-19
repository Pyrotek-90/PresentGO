// Browser-free (the API imports it): reading a song's title, CCLI number and key from a file name.

// "07 - Goodness Of God - Chord Chart (G).pdf" → { title: "Goodness Of God", ccli, key }
export function parseFilename(name) {
  let base = name.replace(/\.[^.]+$/, '')
  const ccli = base.match(/(?:^|[\s_-])(\d{5,8})(?=$|[\s_-])/)?.[1] || ''
  const keyM = base.match(/[\s_(-]\(?(?:key\s*(?:of\s*)?)?([A-G][#b]?m?)\)?\s*$/i)
  if (ccli) base = base.replace(ccli, ' ')
  base = base
    .replace(/[\s_(-]\(?(?:key\s*(?:of\s*)?)?[A-G][#b]?m?\)?\s*$/i, '')
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, '')
    .replace(/\b(chord\s*charts?|chords|lead\s*sheet|lyrics?|chart|songselect|praisecharts|pco)\b/gi, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
  return { title: base, ccli, key: keyM ? keyM[1] : '' }
}
