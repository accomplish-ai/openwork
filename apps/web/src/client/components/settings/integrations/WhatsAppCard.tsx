import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { WhatsAppConnectionStatus } from './useWhatsAppIntegration';

interface WhatsAppCardProps {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  tunnelEnabled: boolean;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onTunnelToggle: (enabled: boolean) => void;
}

const statusDotClass: Record<WhatsAppConnectionStatus, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-muted-foreground',
  connecting: 'bg-yellow-500 animate-pulse',
  error: 'bg-destructive',
};

const statusTextClass: Record<WhatsAppConnectionStatus, string> = {
  connected: 'text-green-600',
  disconnected: 'text-muted-foreground',
  connecting: 'text-yellow-600',
  error: 'text-destructive',
};

export const WhatsAppCard = memo(function WhatsAppCard({
  status,
  qrCode,
  tunnelEnabled,
  loading,
  onConnect,
  onDisconnect,
  onTunnelToggle,
}: WhatsAppCardProps) {
  const { t } = useTranslation('settings');

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* WhatsApp icon */}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#25D366]/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#25D366]" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t('integrations.whatsapp.title')}
            </h3>
            <span
              className={`flex items-center gap-1 text-[11px] mt-0.5 ${statusTextClass[status]}`}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusDotClass[status]}`} />
              {t(`integrations.whatsapp.status.${status}`)}
            </span>
          </div>
        </div>

        {/* Connect / Disconnect button */}
        <div>
          {status === 'connected' ? (
            <button
              onClick={onDisconnect}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {t('integrations.whatsapp.disconnect')}
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={status === 'connecting'}
              className="rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#25D366]/90 transition-colors disabled:opacity-50"
            >
              {status === 'connecting'
                ? t('integrations.whatsapp.connecting')
                : t('integrations.whatsapp.connect')}
            </button>
          )}
        </div>
      </div>

      {/* QR Code section */}
      {(status === 'connecting' || qrCode) && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground text-center">
            {t('integrations.whatsapp.scanQr')}
          </p>
          {qrCode ? (
            <div className="bg-white p-3 rounded-lg">
              {/* QR code is a data string; we render it using a simple img fallback.
                  In production you'd use a QR rendering library like qrcode.react */}
              <div className="flex items-center justify-center h-48 w-48">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(qrCode)}`}
                  alt="WhatsApp QR Code"
                  className="h-48 w-48"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 w-48 rounded-lg bg-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#25D366] border-t-transparent" />
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center max-w-[280px]">
            {t('integrations.whatsapp.scanQrHelp')}
          </p>
        </div>
      )}

      {/* Connected state — show tunnel toggle */}
      {status === 'connected' && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('integrations.whatsapp.tunnelLabel')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('integrations.whatsapp.tunnelDescription')}
              </p>
            </div>
            <button
              onClick={() => onTunnelToggle(!tunnelEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                tunnelEnabled ? 'bg-primary' : 'bg-muted'
              }`}
              title={
                tunnelEnabled
                  ? t('integrations.whatsapp.disableTunnel')
                  : t('integrations.whatsapp.enableTunnel')
              }
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  tunnelEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('integrations.whatsapp.connectedHelp')}
          </p>
        </div>
      )}
    </div>
  );
});
