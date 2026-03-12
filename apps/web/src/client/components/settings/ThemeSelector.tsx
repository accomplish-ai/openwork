import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Desktop, CaretDown } from '@phosphor-icons/react';
import { applyTheme } from '@/lib/theme';
import { getAccomplish } from '@/lib/accomplish';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const THEME_OPTIONS = [
  { value: 'system' as const, label: 'settings:appearance.themeSystem', icon: Desktop },
  { value: 'light' as const, label: 'settings:appearance.themeLight', icon: Sun },
  { value: 'dark' as const, label: 'settings:appearance.themeDark', icon: Moon },
];

type ThemeValue = 'system' | 'light' | 'dark';

function isThemeValue(v: string): v is ThemeValue {
  return v === 'system' || v === 'light' || v === 'dark';
}

function getStoredTheme(): ThemeValue {
  if (typeof localStorage === 'undefined') {
    return 'system';
  }
  const stored = localStorage.getItem('theme');
  return isThemeValue(stored ?? '') ? (stored as ThemeValue) : 'system';
}

export function ThemeSelector() {
  const { t } = useTranslation('settings');
  const [current, setCurrent] = useState<ThemeValue>(getStoredTheme);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accomplish = getAccomplish();
    if (accomplish.getTheme) {
      accomplish
        .getTheme()
        .then((theme) => {
          if (isThemeValue(theme)) {
            setCurrent(theme);
          }
        })
        .catch(() => {
          // ignore — fall back to the stored value
        });
    }
  }, []);

  const handleChange = useCallback(
    async (value: string) => {
      if (!isThemeValue(value)) {
        return;
      }
      const previousTheme = current;
      setCurrent(value);
      applyTheme(value);
      const accomplish = getAccomplish();
      if (accomplish.setTheme) {
        try {
          await accomplish.setTheme(value);
        } catch {
          setCurrent(previousTheme);
          applyTheme(previousTheme);
        }
      }
    },
    [current],
  );

  const currentOption = THEME_OPTIONS.find((o) => o.value === current) ?? THEME_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Sun className="h-4 w-4 text-muted-foreground" />
            {t('appearance.themeTitle')}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {t('appearance.themeDescription')}
          </p>
        </div>
        <div className="ml-4">
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-2 h-8 rounded-md border border-border px-3 text-sm text-foreground transition-all duration-150',
                  'hover:bg-black/[0.04] dark:hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-ring',
                )}
              >
                <CurrentIcon className="h-4 w-4 text-muted-foreground" />
                <span>{t(currentOption.label)}</span>
                <CaretDown
                  className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', {
                    'rotate-180': open,
                  })}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuRadioGroup value={current} onValueChange={handleChange}>
                {THEME_OPTIONS.map((option) => {
                  const OptionIcon = option.icon;
                  return (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      <OptionIcon className="h-4 w-4 text-muted-foreground mr-2" />
                      {t(option.label)}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
