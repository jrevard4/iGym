'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { t as translate } from '../../lib/i18n';

const THEME_KEY = 'igym_theme';
const LANG_KEY = 'igym_lang';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const storedLang = window.localStorage.getItem(LANG_KEY);
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(storedTheme || (systemDark ? 'dark' : 'light'));
    setLang(storedLang || 'en');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme, ready]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang, ready]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <PreferencesContext.Provider value={{ theme, toggleTheme, lang, setLang }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

// Convenience hook: t('someKey') resolved against the active language.
export function useT() {
  const { lang } = usePreferences();
  return useCallback((key) => translate(key, lang), [lang]);
}
