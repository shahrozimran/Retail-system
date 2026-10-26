'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  return <button type="button" onClick={toggle} className="icon-button theme-toggle" title={label} aria-label={label}>
    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
  </button>;
}
