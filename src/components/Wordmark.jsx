import { CREST_D, CREST_W, CREST_H } from './crestPath'

/**
 * The StaffList wordmark: the crest stands in for the S, with "taffList" (Grenze Gotisch)
 * centered on it. With `tagline`, "To the Chief Musician" runs under the name, from just after
 * the S to the end of the name. It scales with the font size of its container, so size it with
 * a text class (e.g. className="text-6xl"), and it takes the text color.
 * Design: "17 · Crest as the S" on the StaffList Wordmarks canvas.
 */
export default function Wordmark({ className = '', tagline = false }) {
  return (
    <span role="img" aria-label={tagline ? 'StaffList, To the Chief Musician' : 'StaffList'}
      className={`inline-flex items-center leading-none ${className}`}>
      <svg aria-hidden="true" viewBox={`0 0 ${CREST_W} ${CREST_H}`} xmlns="http://www.w3.org/2000/svg"
        style={{ height: '1.72em', width: 'auto', marginRight: '-0.02em', flexShrink: 0 }}>
        <path fill="currentColor" fillRule="evenodd" d={CREST_D} />
      </svg>
      <span aria-hidden="true" className="relative">
        <span className="block" style={{ fontFamily: "'Grenze Gotisch', serif", fontWeight: 800, lineHeight: 0.8 }}>taffList</span>
        {tagline && (
          <span className="absolute inset-x-0 flex justify-between"
            style={{ top: '100%', marginTop: '0.18em', fontFamily: "'Cormorant SC', serif", fontWeight: 700, fontSize: '0.25em', lineHeight: 1, opacity: 0.82, padding: '0 0.1em' }}>
            <span>To</span><span>the</span><span>Chief</span><span>Musician</span>
          </span>
        )}
      </span>
    </span>
  )
}
