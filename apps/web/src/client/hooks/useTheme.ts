import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

const THEME_KEY = 'accomplish-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  try {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // localStorage may be blocked in privacy mode
  }
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // matchMedia may be unavailable in some environments
  }
  return 'light';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [hasUserPreference, setHasUserPreference] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    applyTheme(theme);
    // Only persist if user explicitly toggled
    if (!hasUserPreference || typeof window === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage may be blocked in privacy mode
    }
  }, [theme, hasUserPreference]);

  const toggleTheme = () => {
    setHasUserPreference(true);
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return { theme, toggleTheme };
}
