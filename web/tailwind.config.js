/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#007AFF',
          dark:    '#0051D5',
          // #007AFF fails WCAG AA contrast (4.09:1) as normal-weight text on
          // white — reuses the already-defined "dark" shade (~6.77:1) for
          // any text-colored usage instead of the background/button shade.
          text:    '#0051D5',
        },
        accent:   '#5856D6',
        success:  '#34C759',
        warning:  '#FF9500',
        danger:   '#FF3B30',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
