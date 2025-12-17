/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        katech: {
          // Official Katech colors
          black: '#000000',
          white: '#ffffff',
          gold: '#DAA520', // Goldenrod - for accents/small components
          'gold-light': '#F5D76E',
          'gold-dark': '#B8860B',
          // Light mode backgrounds
          'light-bg': '#ffffff',
          'light-surface': '#f8f9fa',
          'light-border': '#e5e7eb',
          'light-text': '#1f2937',
          'light-muted': '#6b7280',
          // Dark mode backgrounds
          'dark-bg': '#000000',
          'dark-surface': '#111111',
          'dark-border': '#2d2d2d',
          'dark-text': '#ffffff',
          'dark-muted': '#9ca3af',
        }
      }
    },
  },
  plugins: [],
}
