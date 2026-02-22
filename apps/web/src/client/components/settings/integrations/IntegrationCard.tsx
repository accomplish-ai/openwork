import { memo, useCallback, useState, type ReactElement, type ReactNode } from 'react';
import type { IntegrationConfig } from '@accomplish_ai/agent-core';

interface IntegrationCardProps {
  platform: string;
  title: string;
  description: string;
  icon?: ReactNode;
  integration?: IntegrationConfig;
  onConnect: () => Promise<void> | void;
  onDisconnect: () => Promise<void> | void;
  onSetupTunnel: () => Promise<void> | void;
  onToggleTunnel: (enabled: boolean) => Promise<void> | void;
}

export const IntegrationCard = memo(function IntegrationCard({
  title,
  description,
  icon,
  integration,
  onConnect,
  onDisconnect,
  onSetupTunnel,
  onToggleTunnel,
}: IntegrationCardProps): ReactElement {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [settingTunnel, setSettingTunnel] = useState(false);

  const isConnected = integration?.status === 'connected';
  const isConnecting = integration?.status === 'connecting';
  const isTunnelEnabled = integration?.tunnelEnabled || false;

  const handleConnect = useCallback(async () => {
    try {
      setConnecting(true);
      await onConnect();
    } finally {
      setConnecting(false);
    }
  }, [onConnect]);

  const handleDisconnect = useCallback(async () => {
    try {
      setDisconnecting(true);
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }, [onDisconnect]);

  const handleSetupTunnel = useCallback(async () => {
    try {
      setSettingTunnel(true);
      await onSetupTunnel();
    } finally {
      setSettingTunnel(false);
    }
  }, [onSetupTunnel]);

  const Spinner = () => (
    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );

  function renderActionButton(): ReactElement {
    if (isConnecting) {
      return (
        <button
          disabled
          className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary/80 px-3 text-[11px] font-medium text-primary-foreground opacity-70"
        >
          <Spinner />
          Reconnecting...
        </button>
      );
    }

    if (!isConnected) {
      return (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {connecting ? <Spinner /> : null}
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      );
    }

    return (
      <button
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {disconnecting ? <Spinner /> : null}
        {disconnecting ? 'Disconnecting...' : 'Disconnect'}
      </button>
    );
  }

  return (
    <div className="group rounded-xl border border-border bg-card p-3.5 transition-all duration-200 hover:border-primary hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${isConnected ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground leading-tight">{title}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        {/* Status dot */}
        {isConnected && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-medium text-green-600 dark:text-green-400">
              Connected
            </span>
          </div>
        )}
        {isConnecting && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-[10px] font-medium text-muted-foreground">Reconnecting</span>
          </div>
        )}
      </div>

      {/* Tunnel toggle — only when connected */}
      {isConnected && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2">
          <div>
            <p className="text-[11px] font-medium text-foreground">Tunnel mode</p>
            <p className="text-[10px] text-muted-foreground">Receive commands remotely</p>
          </div>
          <button
            onClick={() => {
              if (!isTunnelEnabled && !settingTunnel) {
                handleSetupTunnel();
              } else {
                onToggleTunnel(!isTunnelEnabled);
              }
            }}
            disabled={settingTunnel}
            className="relative h-5 w-9 rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50"
            style={{
              backgroundColor: isTunnelEnabled ? 'var(--color-primary)' : 'var(--color-muted)',
            }}
            aria-label="Toggle tunnel"
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                isTunnelEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      <div className="mt-3 flex gap-2">{renderActionButton()}</div>
    </div>
  );
});
