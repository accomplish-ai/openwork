import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { changeLanguage, getLanguagePreference } from '@/i18n';

// Auto label in each supported system language so it's always recognizable
const AUTO_LABELS: Record<string, string> = {
  en: 'Auto (System)',
  'zh-CN': '自动（跟随系统）',
};
const AUTO_FALLBACK = 'Auto (System)';

// Compute once at module level — navigator.language is static
const systemLang = typeof navigator !== 'undefined' ? navigator.language : 'en';
const matchedLang = Object.keys(AUTO_LABELS).find(
  (key) => systemLang === key || systemLang.startsWith(key.split('-')[0]),
);
const autoLabel = AUTO_LABELS[matchedLang ?? ''] || AUTO_FALLBACK;

const LANGUAGE_OPTIONS = [
  { value: 'auto' as const, label: autoLabel },
  { value: 'en' as const, label: 'English' },
  { value: 'zh-CN' as const, label: '简体中文' },
];

type LanguageValue = (typeof LANGUAGE_OPTIONS)[number]['value'];

export function LanguageSelector() {
  const { t } = useTranslation('settings');
  const [currentLanguage, setCurrentLanguage] = useState<LanguageValue>(getLanguagePreference);

  const handleChange = useCallback(async (value: LanguageValue) => {
    setCurrentLanguage(value);
    await changeLanguage(value);
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" />
            {t('language.title')}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {t('language.description')}
          </p>
        </div>
        <div className="ml-4">
          <select
            value={currentLanguage}
            onChange={(e) => handleChange(e.target.value as LanguageValue)}
            className="h-8 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
