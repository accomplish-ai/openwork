import { useState, useEffect, useCallback } from 'react';
import type { ReactElement } from 'react';
import type { IntegrationConfig, IntegrationPlatform } from '@accomplish_ai/agent-core';
import { IntegrationCard } from './IntegrationCard';

function getAccomplishAPI() {
  if (typeof window === 'undefined' || !window.accomplish) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window.accomplish as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function waitForAPI(timeout = 5000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const api = getAccomplishAPI();
    if (api?.integrations) return api;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Accomplish API not available');
}

export function IntegrationsPanel(): ReactElement {
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inElectron = typeof window !== 'undefined' && window.accomplishShell?.isElectron === true;

  const loadIntegrations = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      const api = await waitForAPI();
      const data = await api.integrations.list();
      setIntegrations(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load integrations';
      console.error('[Integrations] Load error:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (inElectron) {
      loadIntegrations();
    } else {
      setLoading(false);
    }
  }, [inElectron, loadIntegrations]);

  // Poll for status changes so auto-reconnect / disconnect events
  // are reflected in the UI without requiring a manual refresh.
  useEffect(() => {
    if (!inElectron) {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const api = getAccomplishAPI();
        if (!api?.integrations) {
          return;
        }
        const data = await api.integrations.list();
        if (data) {
          setIntegrations(data);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [inElectron]);

  const handleConnect = async (platform: IntegrationPlatform): Promise<void> => {
    try {
      setError(null);
      const api = await waitForAPI();
      if (!api.integrations?.connect) throw new Error('Connect API not available');
      await api.integrations.connect(platform);
      setTimeout(() => loadIntegrations(), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to connect ${platform}`;
      console.error('[Integrations] Connect error:', message);
      setError(message);
    }
  };

  const handleDisconnect = async (platform: IntegrationPlatform): Promise<void> => {
    try {
      setError(null);
      const api = await waitForAPI();
      if (!api.integrations?.disconnect) throw new Error('Disconnect API not available');
      await api.integrations.disconnect(platform);
      await loadIntegrations();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to disconnect ${platform}`;
      console.error('[Integrations] Disconnect error:', message);
      setError(message);
    }
  };

  const handleSetupTunnel = async (platform: IntegrationPlatform): Promise<void> => {
    try {
      setError(null);
      const api = await waitForAPI();
      if (!api.integrations?.setupTunnel) throw new Error('Tunnel API not available');
      await api.integrations.setupTunnel(platform);
      await loadIntegrations();
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to setup tunnel for ${platform}`;
      console.error('[Integrations] Tunnel error:', message);
      setError(message);
    }
  };

  const handleToggleTunnel = async (
    platform: IntegrationPlatform,
    enabled: boolean,
  ): Promise<void> => {
    try {
      setError(null);
      const api = await waitForAPI();
      if (!api.integrations?.toggleTunnel) throw new Error('Toggle tunnel API not available');
      await api.integrations.toggleTunnel(platform, enabled);
      await loadIntegrations();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle tunnel';
      console.error('[Integrations] Toggle error:', message);
      setError(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-[11px] text-muted-foreground">Loading integrations...</p>
        </div>
      </div>
    );
  }

  if (!inElectron) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Integrations are only available in the desktop app.
        </p>
      </div>
    );
  }

  const whatsappConfig = integrations.find((i) => i.platform === 'whatsapp');

  return (
    <div className="flex flex-col gap-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Connect messaging platforms to trigger and monitor tasks remotely.
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => {
              setError(null);
              loadIntegrations();
            }}
            className="ml-3 text-xs font-medium hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Integration cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <IntegrationCard
          platform="whatsapp"
          title="WhatsApp"
          description="Trigger tasks and get updates via WhatsApp"
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          }
          integration={whatsappConfig}
          onConnect={() => handleConnect('whatsapp' as IntegrationPlatform)}
          onDisconnect={() => handleDisconnect('whatsapp' as IntegrationPlatform)}
          onSetupTunnel={() => handleSetupTunnel('whatsapp' as IntegrationPlatform)}
          onToggleTunnel={(enabled) =>
            handleToggleTunnel('whatsapp' as IntegrationPlatform, enabled)
          }
        />

        {/* Slack */}
        <div className="group rounded-xl border border-border bg-card p-3.5 opacity-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Slack</p>
              <p className="text-[11px] text-muted-foreground">Coming soon</p>
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="group rounded-xl border border-border bg-card p-3.5 opacity-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <svg
                className="h-4 w-4 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Telegram</p>
              <p className="text-[11px] text-muted-foreground">Coming soon</p>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          How it works
        </p>
        <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              1
            </span>
            <span>
              Click Connect to open WhatsApp Web and scan the QR code with your phone to pair your
              device.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              2
            </span>
            <span>
              Enable the tunnel toggle so Accomplish can listen for incoming commands from your
              messages.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              3
            </span>
            <span>
              Send a message starting with @accomplish followed by your prompt to start a task.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
              4
            </span>
            <span>Task progress and results appear directly in the Accomplish UI as they run.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
