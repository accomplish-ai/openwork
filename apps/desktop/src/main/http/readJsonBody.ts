import type { IncomingMessage } from 'http';

/**
 * Represents an HTTP error with a status code.
 * Thrown by readJsonBody when the request is invalid or too large.
 */
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/**
 * Reads and parses the JSON body of an incoming HTTP request.
 *
 * Security hardening:
 * - Enforces a configurable maximum body size (default: 1 MB) to prevent
 *   memory exhaustion from oversized payloads.
 * - Destroys the request stream immediately when the limit is exceeded.
 * - Returns a typed, parsed result or throws an HttpError with the
 *   appropriate status code (413 Payload Too Large, 400 Bad Request).
 *
 * @param req     The incoming Node.js HTTP request.
 * @param options Optional configuration.
 * @returns       Parsed JSON body cast to type T.
 * @throws        HttpError(413) if the body exceeds maxBytes.
 * @throws        HttpError(400) if the body is empty or not valid JSON.
 * @throws        Error for underlying stream errors.
 */
export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
  options: { maxBytes?: number } = {},
): Promise<T> {
  const maxBytes = options.maxBytes ?? 1 * 1024 * 1024; // default: 1 MB

  return new Promise<T>((resolve, reject) => {
    let received = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      received += chunk.length;

      if (received > maxBytes) {
        // Immediately stop reading and signal the client.
        req.destroy();
        reject(new HttpError(413, 'Payload too large'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');

        if (!raw.trim()) {
          reject(new HttpError(400, 'Empty body'));
          return;
        }

        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}
