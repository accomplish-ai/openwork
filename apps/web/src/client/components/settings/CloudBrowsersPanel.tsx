'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type {
  CloudBrowserConfig,
  CloudBrowserProvider,
  CloudBrowserProviderConfig,
} from '@accomplish_ai/agent-core/common';

const PROVIDERS: {
  id: CloudBrowserProvider;
  name: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; required: boolean }[];
}[] = [
  {
    id: 'browserbase',
    name: 'Browserbase',
    description: 'Cloud browser infrastructure with CDP support',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'bb_live_...', required: true },
      { key: 'projectId', label: 'Project ID', placeholder: 'Your project ID', required: true },
    ],
  },
];

const DEFAULT_CONFIG: CloudBrowserConfig = {
  activeProvider: null,
  providers: {},
};

export function CloudBrowsersPanel() {
  const [config, setConfig] = useState<CloudBrowserConfig>(DEFAULT_CONFIG);
  const [expandedProvider, setExpandedProvider] = useState<CloudBrowserProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const accomplish = getAccomplish();

  useEffect(() => {
    let mounted = true;
    accomplish
      .getCloudBrowserConfig()
      .then((c) => {
        if (mounted && c) {
          setConfig(c);
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load cloud browser config');
        }
      });
    return () => {
      mounted = false;
    };
  }, [accomplish]);

  const saveConfig = useCallback(
    async (newConfig: CloudBrowserConfig) => {
      setSaving(true);
      setSaveError(null);
      try {
        await accomplish.setCloudBrowserConfig(newConfig);
        setConfig(newConfig);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
      } finally {
        setSaving(false);
      }
    },
    [accomplish],
  );

  const handleToggleActive = useCallback(
    async (providerId: CloudBrowserProvider) => {
      const newConfig = { ...config };
      if (newConfig.activeProvider === providerId) {
        newConfig.activeProvider = null;
      } else {
        newConfig.activeProvider = providerId;
      }
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleSaveProvider = useCallback(
    async (providerId: CloudBrowserProvider, providerConfig: CloudBrowserProviderConfig) => {
      const newConfig = {
        ...config,
        providers: {
          ...config.providers,
          [providerId]: providerConfig,
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  const handleRemoveProvider = useCallback(
    async (providerId: CloudBrowserProvider) => {
      const newConfig = {
        ...config,
        providers: { ...config.providers },
      };
      delete newConfig.providers[providerId];
      if (newConfig.activeProvider === providerId) {
        newConfig.activeProvider = null;
      }
      await saveConfig(newConfig);
    },
    [config, saveConfig],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Browser Mode</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Choose between the built-in local browser or a cloud browser provider for agent tasks.
        </p>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className={
              config.activeProvider === null
                ? 'font-medium text-foreground'
                : 'text-muted-foreground'
            }
          >
            {config.activeProvider === null
              ? 'Using local browser (default)'
              : `Using ${PROVIDERS.find((p) => p.id === config.activeProvider)?.name ?? config.activeProvider}`}
          </span>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {loadError}
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {saveError}
        </div>
      )}

      {PROVIDERS.map((provider) => {
        const providerConfig = config.providers[provider.id];
        const isActive = config.activeProvider === provider.id;
        const isExpanded = expandedProvider === provider.id;
        const isConfigured = !!providerConfig?.apiKey || !!providerConfig?.endpoint;

        return (
          <div
            key={provider.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <button
              onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{provider.name}</span>
                  {isConfigured && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Configured
                    </span>
                  )}
                  {isActive && (
                    <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{provider.description}</p>
              </div>
              <svg
                className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <ProviderForm
                provider={provider}
                config={providerConfig}
                isActive={isActive}
                saving={saving}
                onSave={(c) => handleSaveProvider(provider.id, c)}
                onToggleActive={() => handleToggleActive(provider.id)}
                onRemove={() => handleRemoveProvider(provider.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProviderForm({
  provider,
  config,
  isActive,
  saving,
  onSave,
  onToggleActive,
  onRemove,
}: {
  provider: (typeof PROVIDERS)[number];
  config?: CloudBrowserProviderConfig;
  isActive: boolean;
  saving: boolean;
  onSave: (config: CloudBrowserProviderConfig) => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const [formValues, setFormValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {};
    for (const field of provider.fields) {
      values[field.key] = (config?.[field.key as keyof CloudBrowserProviderConfig] as string | undefined) ?? '';
    }
    return values;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const providerConfig: CloudBrowserProviderConfig = {
      provider: provider.id,
      enabled: true,
      apiKey: formValues.apiKey || undefined,
      projectId: formValues.projectId || undefined,
      endpoint: formValues.endpoint || undefined,
    };
    onSave(providerConfig);
  };

  const isConfigured = provider.fields
    .filter((f) => f.required)
    .every((f) => formValues[f.key]?.trim());

  return (
    <div className="border-t border-border p-4 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {provider.fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-foreground mb-1">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <input
              type={field.key === 'apiKey' ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={formValues[field.key] ?? ''}
              onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !isConfigured}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {config && (
            <>
              <button
                type="button"
                onClick={onToggleActive}
                disabled={saving}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
                }`}
              >
                {isActive ? 'Deactivate' : 'Set Active'}
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={saving}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
