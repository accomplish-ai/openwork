import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { getIntegrationManager } from '../integrations/manager';
import { normalizeIpcError } from './validation';
import type { IntegrationPlatform } from '../integrations/types';

// IPC handlers for integration operations
// Connects renderer process to integration manager for WhatsApp and other platforms

export function registerIntegrationHandlers(): void {
  const integrationManager = getIntegrationManager();

  // Forward QR updates to renderer
  integrationManager.on('qr-update', (event) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('integration:qr', event);
      }
    }
  });

  // Get list of all configured integrations
  ipcMain.handle('integrations:list', async () => {
    try {
      return integrationManager.getIntegrations();
    } catch (error) {
      console.error('IPC handler integrations:list failed', error);
      throw normalizeIpcError(error);
    }
  });

  // Initiate connection to messaging platform with QR code
  ipcMain.handle('integrations:connect', async (_event: IpcMainInvokeEvent, platform: unknown) => {
    try {
      return await integrationManager.connect(platform as IntegrationPlatform);
    } catch (error) {
      console.error(
        '[Integrations] Connect failed:',
        error instanceof Error ? error.message : error,
      );
      throw normalizeIpcError(error);
    }
  });

  // Disconnect from messaging platform
  ipcMain.handle(
    'integrations:disconnect',
    async (_event: IpcMainInvokeEvent, platform: unknown) => {
      try {
        return await integrationManager.disconnect(platform as IntegrationPlatform);
      } catch (error) {
        console.error('IPC handler integrations:disconnect failed', error);
        throw normalizeIpcError(error);
      }
    },
  );

  // Get current connection status
  ipcMain.handle('integrations:status', async (_event: IpcMainInvokeEvent, platform: unknown) => {
    try {
      return integrationManager.getStatus(platform as IntegrationPlatform);
    } catch (error) {
      console.error('IPC handler integrations:status failed', error);
      throw normalizeIpcError(error);
    }
  });

  // Setup tunnel for receiving messages from mobile device
  // Enables triggering tasks via WhatsApp/Slack/Teams/Telegram
  ipcMain.handle(
    'integrations:setupTunnel',
    async (_event: IpcMainInvokeEvent, platform: unknown) => {
      try {
        return await integrationManager.setupTunnel(platform as IntegrationPlatform);
      } catch (error) {
        console.error('IPC handler integrations:setupTunnel failed', error);
        throw normalizeIpcError(error);
      }
    },
  );

  // Toggle tunnel mode on/off for platform
  ipcMain.handle(
    'integrations:toggleTunnel',
    async (_event: IpcMainInvokeEvent, platform: unknown, enabled: unknown) => {
      try {
        const configs = integrationManager.getIntegrations();
        const config = configs.find((c) => c.platform === (platform as IntegrationPlatform));

        if (!config) {
          throw new Error(`No ${platform} integration found`);
        }

        if (enabled && !config.tunnelEnabled) {
          // Setup tunnel when enabling — setupTunnel persists config internally
          await integrationManager.setupTunnel(platform as IntegrationPlatform);
        } else if (!enabled && config.tunnelEnabled) {
          // Disable tunnel and persist state
          config.tunnelEnabled = false;
          const store = (await import('../store/integrations')).getIntegrationsStore();
          store.update(config);
        }

        return config;
      } catch (error) {
        console.error('IPC handler integrations:toggleTunnel failed', error);
        throw normalizeIpcError(error);
      }
    },
  );
}
