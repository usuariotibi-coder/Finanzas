/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f7f4fa',
          100: '#efeaf5',
          200: '#d5d1da',
          300: '#b4b0c2',
          400: '#827691',
          500: '#5d516f',
          600: '#2e1a47',
          700: '#26133c',
          800: '#1c0e2d',
          900: '#140316',
        },
        accent: {
          50: '#ffe9ee',
          100: '#ffd1dc',
          200: '#f7a2b7',
          300: '#eb6b8b',
          400: '#d9345c',
          500: '#ce0037',
          600: '#b80032',
          700: '#9a002a',
          800: '#76001f',
          900: '#540016',
        },
        neutral: {
          900: '#3b434d',
          800: '#626971',
          700: '#757c82',
          600: '#8b8e95',
          500: '#9ea1a6',
          400: '#b4b4bc',
          300: '#b9c0c8',
          200: '#cbcdd3',
          150: '#d5d8dd',
          100: '#dfe2e7',
          75: '#ebecee',
          50: '#f5f6f8',
        },
      },
      fontFamily: {
        display: ['"Barlow Semi Condensed"', 'system-ui', 'sans-serif'],
        body: ['"Barlow Semi Condensed"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
