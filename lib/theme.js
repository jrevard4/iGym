// Shared color tokens for mobile (App.js consumes these directly in a
// StyleSheet factory, since React Native has no CSS/Tailwind dark: variant
// mechanism). Web's dark mode instead uses Tailwind's `dark:` classes and
// doesn't need this file — but BRAND_COLORS stays the single source of
// truth for hex values that appear in both places.

export const BRAND_COLORS = {
  brand: '#007AFF',
  brandDark: '#0051D5',
  accent: '#5856D6',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
};

export const LIGHT_THEME = {
  ...BRAND_COLORS,
  mode: 'light',
  background: '#F7F7F8',
  surface: '#FFFFFF',
  card: '#F8F8F8',
  inputBg: '#F0F0F0',
  text: '#1C1C1E',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  placeholder: '#9CA3AF',
  overlay: 'rgba(0,0,0,0.5)',
};

export const DARK_THEME = {
  ...BRAND_COLORS,
  mode: 'dark',
  background: '#0B0B0D',
  surface: '#1C1C1E',
  card: '#242426',
  inputBg: '#2C2C2E',
  text: '#F2F2F7',
  textMuted: '#9CA3AF',
  border: '#38383A',
  placeholder: '#6B7280',
  overlay: 'rgba(0,0,0,0.7)',
};

export function getTheme(mode) {
  return mode === 'dark' ? DARK_THEME : LIGHT_THEME;
}
