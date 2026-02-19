/**
 * Web i18n Configuration (Self-Contained)
 *
 * All translations are bundled as static imports. Language preference is
 * persisted in localStorage. No IPC or main-process dependency.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Static English locale imports
import enCommon from '@locales/en/common.json';
import enHome from '@locales/en/home.json';
import enSettings from '@locales/en/settings.json';
import enExecution from '@locales/en/execution.json';
import enHistory from '@locales/en/history.json';
import enErrors from '@locales/en/errors.json';
import enSidebar from '@locales/en/sidebar.json';

// Static Chinese locale imports
import zhCNCommon from '@locales/zh-CN/common.json';
import zhCNHome from '@locales/zh-CN/home.json';
import zhCNSettings from '@locales/zh-CN/settings.json';
import zhCNExecution from '@locales/zh-CN/execution.json';
import zhCNHistory from '@locales/zh-CN/history.json';
import zhCNErrors from '@locales/zh-CN/errors.json';
import zhCNSidebar from '@locales/zh-CN/sidebar.json';

// Supported languages and namespaces
export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const;
export const NAMESPACES = [
  'common',
  'home',
  'execution',
  'settings',
  'history',
  'errors',
  'sidebar',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type Namespace = (typeof NAMESPACES)[number];

export const LANGUAGE_STORAGE_KEY = 'openwork-language';

// Flag to track initialization
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

function updateDocumentDirection(language: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = language;
}

/**
 * Read the stored language preference from localStorage.
 * Returns the concrete language to use (resolves 'auto' via navigator).
 */
function resolveStoredLanguage(): SupportedLanguage {
  if (typeof localStorage === 'undefined') {
    return 'en';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-CN') {
    return stored;
  }
  // 'auto' or missing — detect from browser
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (nav.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en';
}

/**
 * Initialize i18n with bundled translations
 */
export async function initI18n(): Promise<void> {
  if (isInitialized) {
    return;
  }
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const initialLanguage = resolveStoredLanguage();

    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources: {
          en: {
            common: enCommon as Record<string, unknown>,
            home: enHome as Record<string, unknown>,
            settings: enSettings as Record<string, unknown>,
            execution: enExecution as Record<string, unknown>,
            history: enHistory as Record<string, unknown>,
            errors: enErrors as Record<string, unknown>,
            sidebar: enSidebar as Record<string, unknown>,
          },
          'zh-CN': {
            common: zhCNCommon as Record<string, unknown>,
            home: zhCNHome as Record<string, unknown>,
            settings: zhCNSettings as Record<string, unknown>,
            execution: zhCNExecution as Record<string, unknown>,
            history: zhCNHistory as Record<string, unknown>,
            errors: zhCNErrors as Record<string, unknown>,
            sidebar: zhCNSidebar as Record<string, unknown>,
          },
        },
        lng: initialLanguage,
        fallbackLng: 'en',
        defaultNS: 'common',
        ns: NAMESPACES as unknown as string[],

        interpolation: {
          escapeValue: false,
        },

        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        },

        debug: process.env.NODE_ENV === 'development',

        returnEmptyString: false,

        react: {
          useSuspense: false,
        },
      });

    updateDocumentDirection(initialLanguage);
    isInitialized = true;
    console.log(`[i18n] Initialized with language: ${initialLanguage}`);
  })();

  return initializationPromise;
}

/**
 * Change language and persist to localStorage
 */
export async function changeLanguage(language: 'en' | 'zh-CN' | 'auto'): Promise<void> {
  const resolvedLanguage = language === 'auto' ? resolveAutoLanguage() : language;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(resolvedLanguage);
  updateDocumentDirection(resolvedLanguage);
}

/**
 * Get the current language preference from localStorage
 */
export function getLanguagePreference(): 'en' | 'zh-CN' | 'auto' {
  if (typeof localStorage === 'undefined') {
    return 'auto';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh-CN' || stored === 'auto') {
    return stored;
  }
  return 'auto';
}

function resolveAutoLanguage(): SupportedLanguage {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  if (nav.startsWith('zh')) {
    return 'zh-CN';
  }
  return 'en';
}

export default i18n;
