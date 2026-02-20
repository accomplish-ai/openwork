import { WhatsAppCard } from './WhatsAppCard';

export function IntegrationsPanel() {
  return (
    <div className="flex flex-col gap-4" data-testid="integrations-panel">
      <p className="text-sm text-muted-foreground">
        Connect messaging services to interact with your AI agent from external platforms.
      </p>
      <WhatsAppCard />
    </div>
  );
}
