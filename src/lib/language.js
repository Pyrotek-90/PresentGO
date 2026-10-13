// Quick, offline check for whether song lyrics are (at least partly) in a language other than English.
// Works for other scripts (Devanagari, Tamil, Korean, …) and for romanized lyrics such as
// "Dhanyawad ho tera Yeshu", which a script check alone would miss.

const EN = new Set(`a about above after again against all almost alone along also always am among an and another any are
around as at away be because been before behind being below beside best better between beyond both but by came can cannot
come comes could day days did do does done down each even ever every everything far few for forever from gave give given
gives go goes going gone good got great had has have he heart hearts heaven her here him his hold holy how i if in into is
it its just keep king know known last let life light like live lives long love made make many may me mercy more most much
must my name near never new no none nor not nothing now o of oh on once one only or other our out over own power praise
rise said same saw say says see seen she shall should sing so some soul still such take than that the their them then there
these they thing things this those though through till time to too toward under unto until up upon us very was way we well
were what when where which while who whom whose why will with within without word world would ye yes yet you your yours
yourself lord god jesus christ spirit glory grace hallelujah alleluia amen savior saviour father hope faith free blood
cross worthy holy hands feet eyes alive song worship forevermore`.split(/\s+/))

const LATIN = /[A-Za-zÀ-ɏ]/
const LETTER = /\p{L}/u

const lyricLines = text => (text || '').split('\n')
  .map(l => l.trim())
  .filter(l => l && !/^\[.*\]$/.test(l))

// True when enough of the lyrics look non-English to offer a translation.
export function looksNonEnglish(text) {
  const lines = lyricLines(text)
  if (!lines.length) return false

  // Other writing systems: count letters outside the Latin alphabet.
  const letters = lines.join('').match(/\p{L}/gu) || []
  const nonLatin = letters.filter(ch => !LATIN.test(ch)).length
  if (letters.length >= 6 && nonLatin / letters.length > 0.2) return true

  // Latin-script lyrics: a line is "foreign" when almost none of its words are common English words.
  let judged = 0, foreign = 0
  for (const line of lines) {
    const words = line.toLowerCase().replace(/[’']/g, '').split(/[^a-zÀ-ɏ]+/).filter(w => w.length > 0 && LETTER.test(w))
    if (words.length < 3) continue
    judged++
    const hits = words.filter(w => EN.has(w)).length
    if (hits / words.length < 0.25) foreign++
  }
  return judged >= 2 && foreign / judged >= 0.25
}
