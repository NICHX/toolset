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
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
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
