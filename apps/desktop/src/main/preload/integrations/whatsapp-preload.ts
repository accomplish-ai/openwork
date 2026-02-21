// Preload for WhatsApp Web Integration
// Exposes a secure bridge for the hidden browser window to communicate with the main process

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Send data to main process (QR codes, status updates, incoming messages)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (channel: string, data: any) => {
    // Whitelist channels to prevent arbitrary IPC calls
    const validChannels = [
      'whatsapp-qr-update',
      'whatsapp-status-update',
      'whatsapp-message',
      'whatsapp-data',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // Receive data from main process (commands to send messages)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['whatsapp-command'];
    if (validChannels.includes(channel)) {
      // Strip event as it includes sender
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
});

// Also expose a unique identifier to verify the preload works
contextBridge.exposeInMainWorld('accomplishIntegration', {
  isLoaded: true,
  type: 'whatsapp',
});
