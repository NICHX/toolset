module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../reminder-plugin/src/renderer/**/*.{tsx,ts,css}',
  ],
  safelist: [
    { pattern: /^border-l-(blue|emerald|purple|amber|red|primary)-\d+\/\d+/ },
    { pattern: /^bg-(indigo|emerald|amber|red|primary|slate)-\d+\/\d+/ },
    { pattern: /^text-(indigo|emerald|amber|red|primary)-\d+/ },
    { pattern: /^from-(indigo|emerald|purple|blue|amber)-\d+/ },
    { pattern: /^to-(indigo|emerald|purple|blue|amber)-\d+/ },
    { pattern: /^border-(indigo|emerald|amber|red|primary)-\d+\/\d+/ },
    { pattern: /^hover:(bg|text)-(indigo|emerald|red|slate)-\d+/ },
    { pattern: /^placeholder-(slate)-\d+/ },
    { pattern: /^bg-gradient-to-br/ },
    { pattern: /^bg-clip-text/ },
    { pattern: /^tabular-nums/ },
    { pattern: /^animate-pulse/ },
    { pattern: /^inset-0/ },
    { pattern: /^backdrop-blur/ },
    { pattern: /^cursor-(grab|grabbing)/ },
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
          950: 'var(--primary-950)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
