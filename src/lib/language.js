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

// Best guess at a language name from the writing system alone ('' when it's Latin script).
const SCRIPTS = [
  [/\p{Script=Devanagari}/u, 'Hindi'], [/\p{Script=Tamil}/u, 'Tamil'], [/\p{Script=Telugu}/u, 'Telugu'],
  [/\p{Script=Malayalam}/u, 'Malayalam'], [/\p{Script=Kannada}/u, 'Kannada'], [/\p{Script=Bengali}/u, 'Bengali'],
  [/\p{Script=Gurmukhi}/u, 'Punjabi'], [/\p{Script=Gujarati}/u, 'Gujarati'], [/\p{Script=Hangul}/u, 'Korean'],
  [/\p{Script=Hiragana}|\p{Script=Katakana}/u, 'Japanese'], [/\p{Script=Han}/u, 'Chinese'], [/\p{Script=Arabic}/u, 'Arabic'],
  [/\p{Script=Cyrillic}/u, 'Russian'], [/\p{Script=Greek}/u, 'Greek'], [/\p{Script=Hebrew}/u, 'Hebrew'], [/\p{Script=Thai}/u, 'Thai'],
  [/\p{Script=Ethiopic}/u, 'Amharic'],
]
export function scriptLanguage(text) {
  const t = text || ''
  let best = '', count = 0
  for (const [re, name] of SCRIPTS) {
    const n = (t.match(new RegExp(re.source, 'gu')) || []).length
    if (n > count) { best = name; count = n }
  }
  return count >= 4 ? best : ''
}

// Romanized / Latin-script languages common in church settings, recognised by everyday words.
const WORDS = {
  Hindi: `hai hain ho tera teri tere mera meri mere tu tum aap main mai hum ka ki ke ko ne se mein me par aur ye yeh woh wo
    nahi na kya kaise jab tab sab koi kuch yeshu yesu masih prabhu khuda parmeshwar ishwar pita aatma pavitra naam dil mann
    jeevan prem pyaar karunga gaunga gaayenge hoon raha rahi tha thi diya liya kar karo karte karta jaye jaaye dhanyawad
    stuti mahima aradhana kripa daya`,
  Spanish: `el la los las un una y que de del en es por para con mi mis tu tus su sus no se lo al como pero mas muy yo te me
    nos señor dios jesús cristo gloria santo amor gracia corazón vida eres soy está estás quiero alabanza aleluya cuán grande`,
  Portuguese: `o a os as um uma e que de do da dos das em no na é por para com meu minha teu tua seu sua não se ao como mas
    muito eu te me nos senhor deus jesus cristo glória santo amor graça coração vida és sou está quero louvor`,
  French: `le la les un une et que de du des en est pour avec mon ma mes ton ta tes son sa ses ne pas se au comme mais très
    je tu il nous vous seigneur dieu jésus christ gloire saint amour grâce cœur vie es suis louange`,
  Tagalog: `ang ng mga sa si ni ay at na ko mo ka ikaw ako kami tayo sila ito iyan dito hindi oo ka panginoon diyos hesus
    kristo papuri pag-ibig puso buhay salamat dakila`,
  Indonesian: `yang dan di ke dari ini itu aku kau engkau kami kita mereka tidak ada dengan untuk dalam akan tuhan yesus
    allah kasih hati hidup puji sembah kudus`,
  Swahili: `na ya wa la za kwa ni si mimi wewe sisi yeye wao bwana mungu yesu kristo upendo moyo maisha asante sifa
    takatifu nakupenda`,
  German: `der die das ein eine und ist nicht ich du er wir ihr sie mein dein sein mit für auf zu von herr gott jesus
    christus liebe herz leben gnade heilig`,
}
const WORD_SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(/\s+/).filter(Boolean))]))

// Best guess at the lyrics' language without any network call: the writing system first,
// then everyday words for romanized lyrics. '' when unsure or when it looks like English.
export function guessLanguage(text) {
  const byScript = scriptLanguage(text)
  if (byScript) return byScript
  if (!looksNonEnglish(text)) return ''
  const words = lyricLines(text).join(' ').toLowerCase().replace(/[’']/g, '')
    .split(/[^\p{L}-]+/u).filter(w => w.length > 0)
  if (words.length < 6) return ''
  const scores = Object.entries(WORD_SETS)
    .map(([lang, set]) => [lang, words.filter(w => set.has(w)).length / words.length])
    .sort((a, b) => b[1] - a[1])
  const [best, second] = scores
  return best[1] >= 0.15 && best[1] >= (second?.[1] || 0) * 1.4 ? best[0] : ''
}
