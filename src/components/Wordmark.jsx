/**
 * The STAFFLIST wordmark: blackletter S and L, teal italic FF (fortissimo), centered on a
 * five-line staff. It scales with the font size of its container, so size it with a text class
 * (e.g. className="text-6xl"). `staff={false}` drops the lines for small sizes, where they blur.
 * When the final logo files arrive, this can be swapped for the SVG.
 */
export default function Wordmark({ className = '', staff = true, tone = 'dark' }) {
  const ink = tone === 'dark' ? '#ffffff' : '#111418'
  const teal = tone === 'dark' ? '#22d3ee' : '#0e7490'
  const line = tone === 'dark' ? 'rgba(34,211,238,0.4)' : 'rgba(14,116,144,0.45)'
  const gothic = { fontFamily: "'Grenze Gotisch', serif", fontWeight: 800, fontSize: '1.45em', letterSpacing: 0 }
  return (
    <span role="img" aria-label="StaffList" className={`relative inline-flex items-center justify-center ${className}`}
      style={{ height: '1.6em', padding: staff ? '0 0.5em' : 0 }}>
      {staff && (
        <span aria-hidden="true" className="absolute inset-x-0 flex flex-col justify-between"
          style={{ top: '50%', height: '0.72em', marginTop: '-0.36em' }}>
          {[0, 1, 2, 3, 4].map(i => <span key={i} className="block" style={{ height: 'max(1px, 0.018em)', background: line }} />)}
        </span>
      )}
      <span aria-hidden="true" className="relative flex items-center whitespace-nowrap"
        style={{ color: ink, fontFamily: "'Grenze', serif", fontWeight: 500, letterSpacing: '0.04em' }}>
        <span className="wm-cap" style={gothic}>S</span>
        <span className="wm-cap">TA</span>
        <span className="wm-cap" style={{ fontFamily: "'Bodoni Moda', serif", fontStyle: 'italic', fontWeight: 800, fontSize: '1.04em', letterSpacing: '-0.01em', color: teal, margin: '0 0.04em' }}>FF</span>
        <span className="wm-cap" style={{ ...gothic, marginLeft: '0.04em' }}>L</span>
        <span className="wm-cap">IST</span>
      </span>
    </span>
  )
}
