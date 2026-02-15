/**
 * IntegrationCard Component
 *
 * Displays a messaging platform integration with its status,
 * connect/disconnect controls, and tunnel toggle.
 * Follows the same visual patterns as ConnectorCard.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { IntegrationConfig } from '@/lib/accomplish';

// Platform icon components
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.404 4.5c.966 0 1.75.784 1.75 1.75v4.5a1.75 1.75 0 0 1-1.75 1.75h-.904v3.5a2.5 2.5 0 0 1-2.5 2.5H9.5a2.5 2.5 0 0 1-2.5-2.5V8A2.5 2.5 0 0 1 9.5 5.5h6.5a2.5 2.5 0 0 1 2.5 2.5v.25h.904zM20.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM4.596 7.5h.904V16a4 4 0 0 0 4 4h4.596A2.5 2.5 0 0 1 11.596 22h-5a2.5 2.5 0 0 1-2.5-2.5v-9.5a2.5 2.5 0 0 1 .5-1.5zM3.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: WhatsAppIcon,
  slack: SlackIcon,
  teams: TeamsIcon,
  telegram: TelegramIcon,
};

const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  slack: '#4A154B',
  teams: '#6264A7',
  telegram: '#0088cc',
};

interface IntegrationCardProps {
  platform: { id: string; name: string; available: boolean };
  config?: IntegrationConfig;
  onConnect: (platformId: string) => void;
  onDisconnect: (platformId: string) => void;
  onToggleEnabled: (platformId: string, enabled: boolean) => void;
  onToggleTunnel: (platformId: string, enabled: boolean) => void;
  selected?: boolean;
  onSelect?: (platformId: string) => void;
}

export function IntegrationCard({
  platform,
  config,
  onConnect,
  onDisconnect,
  onToggleEnabled,
  onToggleTunnel,
  selected,
  onSelect,
}: IntegrationCardProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const Icon = PLATFORM_ICONS[platform.id];
  const color = PLATFORM_COLORS[platform.id] || '#666';
  const status = config?.connectionStatus || 'disconnected';
  const enabled = config?.enabled || false;
  const tunnelEnabled = config?.tunnelEnabled || false;

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      await onConnect(platform.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      await onDisconnect(platform.id);
    } finally {
      setActionLoading(false);
    }
  };

  const statusText: Record<string, string> = {
    disconnected: 'Not connected',
    connecting: 'Connecting...',
    awaiting_scan: 'Scan QR code',
    connected: 'Connected',
    error: config?.lastError || 'Error',
  };

  const statusColor: Record<string, string> = {
    disconnected: 'text-muted-foreground',
    connecting: 'text-yellow-500',
    awaiting_scan: 'text-yellow-500',
    connected: 'text-green-500',
    error: 'text-destructive',
  };

  return (
    <motion.div
      className={`rounded-lg border bg-card p-4 transition-colors cursor-pointer ${
        selected ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
      } ${!platform.available ? 'opacity-60' : ''}`}
      onClick={() => onSelect?.(platform.id)}
      variants={settingsVariants.fadeSlide}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={settingsTransitions.enter}
    >
      <div className="flex items-center gap-3">
        {/* Platform Icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}15` }}
        >
          {Icon && <Icon className="h-5 w-5" />}
        </div>

        {/* Platform Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{platform.name}</span>
            {!platform.available && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Coming Soon
              </span>
            )}
          </div>
          <div className={`text-xs ${statusColor[status]}`}>
            {statusText[status]}
          </div>
        </div>

        {/* Action Button */}
        {platform.available && (
          <div className="flex items-center gap-2">
            {status === 'connected' ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleDisconnect(); }}
                disabled={actionLoading}
                className="rounded-md px-3 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                Disconnect
              </button>
            ) : status === 'disconnected' || status === 'error' ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleConnect(); }}
                disabled={actionLoading}
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {actionLoading ? 'Connecting...' : 'Connect'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Expanded settings when selected and connected */}
      <AnimatePresence>
        {selected && platform.available && status === 'connected' && (
          <motion.div
            className="mt-4 space-y-3 border-t border-border pt-4"
            variants={settingsVariants.slideDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            {/* Enable integration toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Enable {platform.name}</div>
                <p className="text-xs text-muted-foreground">
                  Allow starting tasks from {platform.name} messages
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleEnabled(platform.id, !enabled); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  enabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200`}
                  style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </button>
            </div>

            {/* Tunnel toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">Remote Access (Tunnel)</div>
                <p className="text-xs text-muted-foreground">
                  Enable connecting to this machine from {platform.name}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleTunnel(platform.id, !tunnelEnabled); }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  tunnelEnabled ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200`}
                  style={{ transform: tunnelEnabled ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </button>
            </div>

            {config?.connectedAt && (
              <div className="text-xs text-muted-foreground">
                Connected since {new Date(config.connectedAt).toLocaleString()}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
