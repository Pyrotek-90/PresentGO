import { CREST_D, CREST_W, CREST_H } from './crestPath'

/**
 * The StaffList crest: a blackletter S woven with a treble clef. `size` is its height in px;
 * it takes the text color (use a text-* class to color it).
 */
export default function Logo({ size = 32, className = '', title }) {
  return (
    <svg
      height={size}
      width={(size * CREST_W) / CREST_H}
      viewBox={`0 0 ${CREST_W} ${CREST_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <path fill="currentColor" fillRule="evenodd" d={CREST_D} />
    </svg>
  )
}
