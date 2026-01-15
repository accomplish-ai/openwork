import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation resources
import en from '../locales/en.json';
import ja from '../locales/ja.json';

// Initialize with empty resources
const resources = {
  en: { translation: {} },
  ja: { translation: {} },
};

// Load translation files dynamically
async function loadTranslations() {
  try {
    const enTranslations = await import('../locales/en.json');
    const jaTranslations = await import('../locales/ja.json');
    
    i18n.addResourceBundle('en', 'translation', enTranslations.default, true, true);
    i18n.addResourceBundle('ja', 'translation', jaTranslations.default, true, true);
  } catch (error) {
    console.error('Failed to load translations:', error);
  }
}

// Load translations immediately
loadTranslations();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;