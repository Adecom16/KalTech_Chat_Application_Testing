/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#DAA520',
          light: '#F4D03F',
          dark: '#B8860B',
        }
      }
    },
  },
  plugins: [],
}
