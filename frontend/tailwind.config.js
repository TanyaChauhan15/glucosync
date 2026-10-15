/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#080F1F', 900: '#101A2E', 800: '#152238', 700: '#1E2F4A', 600: '#2A3F5F' },
        brand: { blue: '#3B82F6', teal: '#2DD4BF' },
        sev: { yellow: '#FACC15', orange: '#F97316', red: '#EF4444', normal: '#22C55E' },
        muted: '#94A3B8',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}
