declare module 'ws' {
  import type { Server as HttpServer } from 'http';
  import type { EventEmitter } from 'events';

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    static readonly CONNECTING: number;
    static readonly CLOSING: number;

    readyState: number;

    constructor(url: string, protocols?: string | string[]);

    send(data: string | Buffer, callback?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;

    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options: { server?: HttpServer; path?: string; port?: number });

    on(event: 'connection', listener: (ws: WebSocket) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    close(callback?: () => void): void;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
