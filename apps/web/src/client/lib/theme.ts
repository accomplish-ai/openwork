import { getAccomplish } from './accomplish';

type ThemePreference = 'system' | 'light' | 'dark' | 'pure-dark';

const THEME_KEY = 'theme';

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let themeChangeCleanup: (() => void) | null = null;

interface ThemeApplyOptions {
  animate?: boolean;
  persist?: boolean;
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (preference === 'pure-dark') {
    return 'dark';
  }
  return preference;
}

function applyClass(preference: ThemePreference, resolved: 'light' | 'dark', animate = true): void {
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('pure-dark', preference === 'pure-dark');
    root.dataset.theme = preference;
    root.dataset.resolvedTheme = resolved;
  };

  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };

  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => apply());
    return;
  }

  root.classList.add('theme-changing');
  apply();
  window.setTimeout(() => {
    root.classList.remove('theme-changing');
  }, 220);
}

function cleanupSystemListener(): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaQuery = null;
    mediaListener = null;
  }
}

function setupSystemListener(): void {
  cleanupSystemListener();
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaListener = (e: MediaQueryListEvent) => {
    applyClass('system', e.matches ? 'dark' : 'light');
  };
  mediaQuery.addEventListener('change', mediaListener);
}

export function applyTheme(preference: string, options: ThemeApplyOptions = {}): void {
  const validated = (
    ['system', 'light', 'dark', 'pure-dark'].includes(preference) ? preference : 'system'
  ) as ThemePreference;
  const { animate = true, persist = true } = options;

  if (persist) {
    localStorage.setItem(THEME_KEY, validated);
  }

  const resolved = resolveTheme(validated);
  applyClass(validated, resolved, animate);

  if (validated === 'system') {
    setupSystemListener();
  } else {
    cleanupSystemListener();
  }
}

export function initTheme(): void {
  const accomplish = getAccomplish();
  const cachedTheme = localStorage.getItem(THEME_KEY);

  if (cachedTheme) {
    applyTheme(cachedTheme, { animate: false, persist: false });
  } else {
    applyTheme('system', { animate: false, persist: false });
  }

  accomplish.getTheme().then((preference) => {
    applyTheme(preference, { animate: false });
  });

  if (accomplish.onThemeChange) {
    themeChangeCleanup = accomplish.onThemeChange(({ theme }) => {
      applyTheme(theme);
    });
  }
}

export function cleanupTheme(): void {
  cleanupSystemListener();
  if (themeChangeCleanup) {
    themeChangeCleanup();
    themeChangeCleanup = null;
  }
}
