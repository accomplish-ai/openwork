declare module 'ws' {
  import type { EventEmitter } from 'events';

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;

    readyState: number;

    constructor(url: string);

    send(data: string | Buffer, callback?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;

    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: 'open', listener: () => void): this;
  }

  export default WebSocket;
  export { WebSocket };
}
