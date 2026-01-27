import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { Card, CardContent } from '@/components/ui/card';

export function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const accomplish = getAccomplish();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

  // Load saved language on mount
  useEffect(() => {
    accomplish.getLanguage().then((language: string) => {
      setCurrentLanguage(language);
    });
  }, [accomplish]);

  // Listen for language changes from other windows
  useEffect(() => {
    const onLanguageChange = accomplish.onLanguageChange;
    if (!onLanguageChange) return;

    return onLanguageChange(({ language }: { language: string }) => {
      setCurrentLanguage(language);
      i18n.changeLanguage(language);
    });
  }, [accomplish, i18n]);

  const handleLanguageChange = async (language: string) => {
    setCurrentLanguage(language);
    await i18n.changeLanguage(language);
    await accomplish.setLanguage(language);
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="font-medium text-foreground">{t('settings.language')}</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Choose your preferred language
            </p>
          </div>
          <div className="ml-4 flex gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  currentLanguage === lang.code
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {lang.nativeName}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
