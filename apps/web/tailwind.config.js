/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'] },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', fg: 'rgb(var(--primary-fg) / <alpha-value>)', soft: 'rgb(var(--primary-soft) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--danger) / <alpha-value>)', soft: 'rgb(var(--danger-soft) / <alpha-value>)' },
        success: { DEFAULT: 'rgb(var(--success) / <alpha-value>)', soft: 'rgb(var(--success-soft) / <alpha-value>)' },
        warn: { DEFAULT: 'rgb(var(--warn) / <alpha-value>)', soft: 'rgb(var(--warn-soft) / <alpha-value>)' },
      },
    },
  },
  plugins: [],
};
