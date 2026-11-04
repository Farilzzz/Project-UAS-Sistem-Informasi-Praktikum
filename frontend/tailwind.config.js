/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1A2332',
          50: '#F4F6F9',
          100: '#E5E9F0',
          200: '#CBD4E1',
          700: '#233045',
          800: '#1A2332',
          900: '#111722',
        },
        action: {
          red: '#C92A2A',
          hover: '#A61E1E',
        },
        gold: {
          accent: '#F59E0B',
          hover: '#D97706',
        },
        canvas: '#F8F9FA',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}