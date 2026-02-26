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
        navy: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a5bdfd',
          400: '#8098fb',
          500: '#6074f7',
          600: '#4a55eb',
          700: '#3b43d0',
          800: '#3139a8',
          900: '#2d3585',
          950: '#1a1f4e',
        },
        maritime: {
          50: '#f0fdff',
          100: '#ccfbff',
          200: '#99f3ff',
          300: '#54e6ff',
          400: '#06cff0',
          500: '#00b3cc',
          600: '#028faa',
          700: '#07718a',
          800: '#0f5c70',
          900: '#114c5e',
          950: '#063140',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
