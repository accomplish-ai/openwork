'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccomplish } from '@/lib/accomplish';
import { Switch } from '@/components/ui/switch';
import type {
  MessagingConfig,
  MessagingPlatform,
  MessagingIntegrationConfig,
} from '@accomplish_ai/agent-core/common';

const PLATFORMS: {
  id: MessagingPlatform;
  name: string;
  descriptionKey: string;
  icon: React.ReactNode;
  available: boolean;
}[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    descriptionKey: 'integrations.platforms.whatsapp',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    ),
    available: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    descriptionKey: 'integrations.platforms.slack',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
    available: false,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    descriptionKey: 'integrations.platforms.telegram',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
    available: false,
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    descriptionKey: 'integrations.platforms.teams',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.404 4.91c0 1.198-.972 2.17-2.17 2.17-1.199 0-2.17-.972-2.17-2.17S16.035 2.74 17.234 2.74c1.198 0 2.17.972 2.17 2.17zM24 11.5v4.286c0 1.462-1.182 2.643-2.643 2.643h-.214c-1.462 0-2.643-1.181-2.643-2.643V10h3.357c1.182 0 2.143.96 2.143 2.143v-.643zM14.571 5.7a2.857 2.857 0 1 1-5.714 0 2.857 2.857 0 0 1 5.714 0zM17.5 10H5.786c-1.182 0-2.143.96-2.143 2.143v5.714c0 2.143 1.929 3.857 4.286 3.857h7.429c2.357 0 4.286-1.714 4.286-3.857v-5.714c0-1.183-.96-2.143-2.143-2.143z" />
      </svg>
    ),
    available: false,
  },
];

const DEFAULT_CONFIG: MessagingConfig = {
  integrations: {},
};

export function IntegrationsPanel() {
  const { t } = useTranslation('settings');
  const [config, setConfig] = useState<MessagingConfig>(DEFAULT_CONFIG);
  const [expandedPlatform, setExpandedPlatform] = useState<MessagingPlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const accomplish = useAccomplish();

  useEffect(() => {
    accomplish.getMessagingConfig().then((c) => {
      if (c) {
        setConfig(c);
      }
    });
  }, [accomplish]);

  const saveConfig = useCallback(
    async (newConfig: MessagingConfig) => {
      setSaving(true);
      try {
        await accomplish.setMessagingConfig(newConfig);
        setConfig(newConfig);
      } finally {
        setSaving(false);
      }
    },
    [accomplish],
  );

  const handleToggleEnabled = useCallback(
    async (platform: MessagingPlatform) => {
      const existing = config.integrations[platform];
      const newIntegration: MessagingIntegrationConfig = existing
        ? { ...existing, enabled: !existing.enabled }
        : { platform, enabled: true, tunnelEnabled: false };
      const newConfig: MessagingConfig = {
        ...config,
        integrations: {
          ...config.integrations,
          [platform]: newIntegration,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleToggleTunnel = useCallback(
    async (platform: MessagingPlatform) => {
      const existing = config.integrations[platform];
      if (!existing) {
        return;
      }
      const newConfig: MessagingConfig = {
        ...config,
        integrations: {
          ...config.integrations,
          [platform]: { ...existing, tunnelEnabled: !existing.tunnelEnabled },
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleRemove = useCallback(
    async (platform: MessagingPlatform) => {
      const newConfig: MessagingConfig = {
        ...config,
        integrations: { ...config.integrations },
      };
      delete newConfig.integrations[platform];
      await saveConfig(newConfig);
      setExpandedPlatform(null);
    },
    [config, saveConfig],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">{t('integrations.title')}</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          {t('integrations.description')}
        </p>
      </div>

      {PLATFORMS.map((platform) => {
        const integration = config.integrations[platform.id];
        const isExpanded = expandedPlatform === platform.id;
        const isEnabled = integration?.enabled ?? false;

        return (
          <div
            key={platform.id}
            className={`rounded-lg border bg-card overflow-hidden ${
              platform.available ? 'border-border' : 'border-border/50 opacity-60'
            }`}
          >
            <button
              onClick={() => {
                if (platform.available) {
                  setExpandedPlatform(isExpanded ? null : platform.id);
                }
              }}
              disabled={!platform.available}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="text-muted-foreground">{platform.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{platform.name}</span>
                    {isEnabled && (
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                        {t('integrations.enabled')}
                      </span>
                    )}
                    {!platform.available && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('integrations.comingSoon')}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t(platform.descriptionKey)}
                  </p>
                </div>
              </div>
              {platform.available && (
                <svg
                  className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>

            {isExpanded && platform.available && (
              <div className="border-t border-border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {t('integrations.enable', { name: platform.name })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('integrations.enableDescription')}
                    </p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onChange={() => handleToggleEnabled(platform.id)}
                    disabled={saving}
                    ariaLabel={t('integrations.enable', { name: platform.name })}
                  />
                </div>

                {platform.id === 'whatsapp' && isEnabled && (
                  <div className="rounded-lg border border-border p-4">
                    <div className="text-sm font-medium text-foreground mb-2">
                      {t('integrations.whatsapp.connect')}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('integrations.whatsapp.scanQr')}
                    </p>
                    <div className="flex items-center justify-center rounded-lg bg-white p-6 dark:bg-gray-100">
                      <div className="text-center">
                        <div className="h-48 w-48 rounded-lg bg-muted flex items-center justify-center mx-auto">
                          <div className="text-center text-muted-foreground">
                            <svg
                              className="h-12 w-12 mx-auto mb-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 14.625v2.625m0 0v2.625m0-2.625h2.625m-2.625 0H10.875"
                              />
                            </svg>
                            <span className="text-xs">
                              {t('integrations.whatsapp.qrPlaceholder')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {integration?.accountName && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {t('integrations.connectedAs', { name: integration.accountName })}
                      </div>
                    )}
                  </div>
                )}

                {isEnabled && (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {t('integrations.remoteAccess')}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('integrations.remoteAccessDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={integration?.tunnelEnabled ?? false}
                      onChange={() => handleToggleTunnel(platform.id)}
                      disabled={saving}
                      ariaLabel={t('integrations.remoteAccess')}
                    />
                  </div>
                )}

                {integration && (
                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => handleRemove(platform.id)}
                      disabled={saving}
                      className="text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md px-3 py-1.5"
                    >
                      {t('integrations.disconnect', { name: platform.name })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
