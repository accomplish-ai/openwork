import { WhatsAppService } from './WhatsAppService';
import type { TaskBridge } from './taskBridge';

let whatsAppService: WhatsAppService | null = null;
let activeWhatsAppBridge: TaskBridge | null = null;

export function getOrCreateWhatsAppService(): WhatsAppService {
  if (!whatsAppService) {
    whatsAppService = new WhatsAppService();
  }
  return whatsAppService;
}

export function getWhatsAppService(): WhatsAppService | null {
  return whatsAppService;
}

export function clearWhatsAppService(): void {
  whatsAppService = null;
}

export function disposeWhatsAppService(): void {
  if (activeWhatsAppBridge) {
    activeWhatsAppBridge.dispose();
    activeWhatsAppBridge = null;
  }
  if (whatsAppService) {
    whatsAppService.dispose();
    whatsAppService = null;
  }
}

export function setActiveWhatsAppBridge(bridge: TaskBridge | null): void {
  if (activeWhatsAppBridge && activeWhatsAppBridge !== bridge) {
    activeWhatsAppBridge.dispose();
  }
  activeWhatsAppBridge = bridge;
}

export function getActiveWhatsAppBridge(): TaskBridge | null {
  return activeWhatsAppBridge;
}
