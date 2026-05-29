/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        turo: {
          green: '#1D9E75',
          'green-light': '#eaf3de',
          'green-dark': '#0F6E56',
        }
      }
    },
  },
  plugins: [],
}
