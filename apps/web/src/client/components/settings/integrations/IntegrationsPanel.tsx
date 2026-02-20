import { useTranslation } from 'react-i18next';
import { WhatsAppCard } from './WhatsAppCard';
import { useWhatsAppIntegration } from './useWhatsAppIntegration';

export function IntegrationsPanel() {
  const { t } = useTranslation('settings');
  const whatsApp = useWhatsAppIntegration();

  return (
    <div className="flex flex-col gap-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground">{t('integrations.description')}</p>

      {/* WhatsApp integration */}
      <WhatsAppCard
        status={whatsApp.status}
        qrCode={whatsApp.qrCode}
        tunnelEnabled={whatsApp.tunnelEnabled}
        loading={whatsApp.loading}
        onConnect={whatsApp.connect}
        onDisconnect={whatsApp.disconnect}
        onTunnelToggle={whatsApp.setTunnelEnabled}
      />

      {/* Placeholder for future integrations */}
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
        <p className="text-sm text-muted-foreground text-center">{t('integrations.comingSoon')}</p>
      </div>
    </div>
  );
}
