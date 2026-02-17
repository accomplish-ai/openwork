export { IntegrationManager, getIntegrationManager, disposeIntegrationManager } from './integration-manager';
export { WhatsAppProvider } from './whatsapp-provider';
export { TunnelService } from './tunnel-service';
export type {
  MessagingPlatformId,
  MessagingIntegrationConfig,
  MessagingProvider,
  IncomingMessage,
  OutgoingMessage,
  QRCodeData,
  IntegrationConnectionStatus,
  TunnelState,
  TaskProgressUpdate,
  IntegrationEvents,
} from './types';
