/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware semantic tokens (driven by CSS variables)
        bg:      'var(--color-bg)',
        surface: 'var(--color-surface)',
        card:    'var(--color-card)',
        border:  'var(--color-border)',
        primary: 'var(--color-text)',
        muted:   'var(--color-muted)',
        // Accent stays consistent across themes
        accent: {
          DEFAULT: '#0e7490',
          hover:   '#0891b2',
          light:   '#22d3ee',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
