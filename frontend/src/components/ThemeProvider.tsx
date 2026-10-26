'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { THEME_KEY, type Theme } from '@/lib/theme';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(THEME_KEY); } catch { /* Storage can be unavailable in a restricted WebView. */ }
      const resolved = stored === 'light' || stored === 'dark' ? stored : media.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = resolved;
      setTheme(resolved);
    };
    apply();
    media.addEventListener('change', apply);
    window.addEventListener('storage', apply);
    return () => { media.removeEventListener('change', apply); window.removeEventListener('storage', apply); };
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* Keep this window's choice even without storage. */ }
    setTheme(next);
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
