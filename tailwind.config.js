/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        income: '#22c55e',
        expense: '#ef4444',
        transfer: '#3b82f6',
      },
    },
  },
  plugins: [],
}

