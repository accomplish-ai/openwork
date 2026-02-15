import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type { AwsAgentCoreConfig, BedrockCredentials } from '@accomplish_ai/agent-core';
import { validateBedrockCredentials } from '@accomplish_ai/agent-core';

/**
 * Registers IPC handlers for cloud browser functionality.
 * 
 * @param handle - The electron ipcMain.handle function
 */
export function registerCloudBrowserHandlers(
  handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any) => void
) {
  /**
   * Handler for testing AWS connection credentials.
   * Maps the provided config to BedrockCredentials and uses the shared validation logic.
   * 
   * @param event - IPC event
   * @param config - The AWS configuration to test
   * @returns Promise<boolean> - True if connection successful, false otherwise
   */
  handle('cloud-browser:test-connection', async (_event: IpcMainInvokeEvent, config: AwsAgentCoreConfig) => {
    try {
      console.log('[CloudBrowser] Testing AWS connection:', { region: config.region, profile: config.profile });

      let bedrockCreds: BedrockCredentials;

      if (config.profile) {
        bedrockCreds = {
          authType: 'profile',
          profileName: config.profile,
          region: config.region,
        };
      } else if (config.accessKeyId && config.secretAccessKey) {
        bedrockCreds = {
          authType: 'accessKeys',
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          region: config.region,
        };
      } else {
        // Fallback to default chain if no explicit creds provided?
        // Actually, validateBedrockCredentials expects one of the specific types.
        // For now, let's assume if no explicit creds, we can't easily validate via this helper without constructing a client.
        // However, the helper supports 'profile' (fromIni) and 'accessKeys'.
        // If neither are present, we fail validation for now as the UI enforces input.
        console.warn('[CloudBrowser] No valid credentials provided for testing');
        return false;
      }

      const result = await validateBedrockCredentials(JSON.stringify(bedrockCreds));
      
      if (result.valid) {
        console.log('[CloudBrowser] AWS connection successful');
        return true;
      } else {
        console.error('[CloudBrowser] AWS connection failed:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[CloudBrowser] AWS connection failed:', error);
      return false;
    }
  }); 
}
