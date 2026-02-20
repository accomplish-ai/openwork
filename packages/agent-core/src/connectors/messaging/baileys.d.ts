/**
 * Type declarations for @whiskeysockets/baileys
 *
 * This is a minimal stub so TypeScript compiles the WhatsApp adapter
 * even when the package is not installed.  Baileys is dynamically
 * imported at runtime; if it's missing, the adapter will throw on
 * `connect()` rather than at load time.
 */
declare module '@whiskeysockets/baileys' {
  export interface AuthState {
    creds: unknown;
    keys: unknown;
  }

  export interface SaveCredsFunction {
    (): Promise<void>;
  }

  export interface MultiFileAuthState {
    state: AuthState;
    saveCreds: SaveCredsFunction;
  }

  export function useMultiFileAuthState(dir: string): Promise<MultiFileAuthState>;

  export function fetchLatestBaileysVersion(): Promise<{ version: number[] }>;

  export const DisconnectReason: {
    loggedOut: number;
    connectionClosed: number;
    connectionLost: number;
    connectionReplaced: number;
    timedOut: number;
    badSession: number;
    restartRequired: number;
    multideviceMismatch: number;
  };

  interface WASocket {
    ev: {
      on(event: string, handler: (...args: unknown[]) => void): void;
    };
    sendMessage(jid: string, content: { text: string }): Promise<unknown>;
    end(reason: unknown): void;
  }

  export default function makeWASocket(options: {
    version?: number[];
    auth: AuthState;
    printQRInTerminal?: boolean;
  }): WASocket;
}
