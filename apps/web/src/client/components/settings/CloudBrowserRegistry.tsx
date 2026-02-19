import React, { useState, useEffect, useCallback } from 'react';
import type {
  CloudBrowserProviderId,
  CloudProviderAccount,
} from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';
import { BrowserbaseForm } from './cloud-browsers/BrowserbaseForm';
import { cn } from '@/lib/utils';
import { Cloud, ExternalLink } from 'lucide-react';

export function CloudBrowserRegistry() {
  const [selectedProvider, setSelectedProvider] = useState<CloudBrowserProviderId>('browserbase');
  const [providers, setProviders] = useState<Record<string, CloudProviderAccount>>({});
  const [loading, setLoading] = useState(true);

  const accomplish = getAccomplish();

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const allProviders = await accomplish.getAllCloudProviders();
      const providerMap = allProviders.reduce(
        (acc, p) => {
          acc[p.providerId] = p;
          return acc;
        },
        {} as Record<string, CloudProviderAccount>,
      );
      setProviders(providerMap);
    } catch (err) {
      console.error('Failed to load cloud providers', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleSaveBrowserbase = async () => {
    try {
      await loadProviders(); // Reload to get updated state
    } catch (err) {
      console.error('Failed to reload providers after save', err);
    }
  };

  const PROVIDER_LIST = [
    {
      id: 'browserbase' as CloudBrowserProviderId,
      name: 'Browserbase',
      description: 'Serverless browser infrastructure for AI agents.',
      url: 'https://browserbase.com',
    },
    {
      id: 'brightdata' as CloudBrowserProviderId,
      name: 'Bright Data',
      description: 'Scraping Browser with built-in unblocking.',
      url: 'https://brightdata.com',
      disabled: true, // Placeholder for Phase 2/3
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Cloud Browsers</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure cloud browser providers for running web tasks in the cloud.
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar List */}
        <div className="w-48 border-r bg-muted/10">
          <div className="p-2 space-y-1">
            {PROVIDER_LIST.map((provider) => (
              <button
                key={provider.id}
                onClick={() => !provider.disabled && setSelectedProvider(provider.id)}
                disabled={provider.disabled}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  selectedProvider === provider.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  provider.disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            {selectedProvider === 'browserbase' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Browserbase Configuration</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-muted-foreground">
                      Run headless browsers with advanced debugging and anti-detection.
                    </p>
                    <a
                      href="https://browserbase.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Visit Website <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                  <BrowserbaseForm
                    initialConfig={providers['browserbase']?.config}
                    onSave={handleSaveBrowserbase}
                  />
                </div>
              </div>
            )}

            {selectedProvider === 'brightdata' && (
              <div className="text-center py-12 text-muted-foreground">
                Assuming Bright Data implementation coming soon...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
