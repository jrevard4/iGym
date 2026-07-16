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
          // #007AFF measures 4.01:1 against white — fails WCAG AA (4.5:1) for
          // both button and link/text usage at normal sizes. Darkened just
          // enough to clear the bar (5.81:1) while staying recognizably blue;
          // an automated axe-core audit (web/tests/e2e/accessibility.spec.js)
          // caught this — see that file for how to re-verify.
          DEFAULT: '#0062CC',
          dark:    '#0051D5',
          // #007AFF fails WCAG AA contrast (4.09:1) as normal-weight text on
          // white — reuses the already-defined "dark" shade (~6.77:1) for
          // any text-colored usage instead of the background/button shade.
          text:    '#0051D5',
        },
        accent:   '#5856D6',
        // #34C759 measures 2.22:1 against white — fails as a solid button
        // background with white text (needs 4.5:1). Darkened to 5.02:1.
        success:  '#198038',
        // #FF9500 measures 2.20:1 against white — same failure as success
        // above. Darkened to 5.49:1.
        warning:  '#A65200',
        // #FF3B30 measures 3.55:1 against white — fails as the "Decline"
        // button's solid background with white text. Darkened to Material
        // Design's red 700 (#D32F2F, ~4.98:1), a well-tested accessible red.
        danger:   '#D32F2F',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
