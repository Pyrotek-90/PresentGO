/**
 * PresentGO Logo — a wireless presentation screen icon
 * A display with a play arrow and signal arcs, communicating "wireless presentation"
 */
export default function Logo({ size = 32, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Screen body */}
      <rect x="3" y="9" width="28" height="19" rx="3" fill={color} opacity="0.15" />
      <rect x="3" y="9" width="28" height="19" rx="3" stroke={color} strokeWidth="2" />

      {/* Play arrow centered in screen */}
      <path d="M14 14.5L14 23.5L22 19L14 14.5Z" fill={color} />

      {/* Wireless signal arcs — top right */}
      <path d="M32 11 Q36 15 32 19" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M34.5 8.5 Q40 14 34.5 21.5" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />

      {/* Stand */}
      <path d="M17 28 L17 32 L23 32" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 32 L27 32" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
