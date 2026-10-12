/**
 * StaffList logo — an open song book with a music note.
 * Left page carries staff lines (the song sheet); an eighth note rises from the right page.
 */
export default function Logo({ size = 32, color = 'currentColor', className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Open book — two pages meeting at the spine */}
      <path d="M20 15.5C15.5 12.8 9.5 12.6 4 14.2V33.2C9.5 31.6 15.5 31.8 20 34.5V15.5Z"
        fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 15.5C24.5 12.8 30.5 12.6 36 14.2V33.2C30.5 31.6 24.5 31.8 20 34.5V15.5Z"
        fill={color} fillOpacity="0.15" stroke={color} strokeWidth="2" strokeLinejoin="round" />

      {/* Staff lines on the left page */}
      <path d="M7.5 19.2C10.5 18.6 13.8 18.8 16.5 19.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.5 22.7C10.5 22.1 13.8 22.3 16.5 23.3" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M7.5 26.2C10.5 25.6 13.8 25.8 16.5 26.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />

      {/* Eighth note rising from the right page */}
      <ellipse cx="25.6" cy="25.4" rx="3.2" ry="2.5" transform="rotate(-20 25.6 25.4)" fill={color} />
      <path d="M28.5 24.6V5.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M28.5 5.5C29.2 8.6 33.6 9.6 33.6 13.6" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
