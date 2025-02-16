/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Force dark colors as default
      backgroundColor: {
        DEFAULT: '#111827', // gray-900
      },
      textColor: {
        DEFAULT: '#ffffff', // white
      },
    },
  },
  plugins: [],
}
