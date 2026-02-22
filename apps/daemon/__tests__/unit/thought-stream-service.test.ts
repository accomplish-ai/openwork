import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';

const { mockThoughtStreamHandler } = vi.hoisted(() => ({
  mockThoughtStreamHandler: {
    registerTask: vi.fn(),
    unregisterTask: vi.fn(),
    isTaskActive: vi.fn(),
  },
}));

vi.mock('@accomplish_ai/agent-core', () => ({
  createThoughtStreamHandler: () => mockThoughtStreamHandler,
  THOUGHT_STREAM_PORT: 19876,
}));

import { ThoughtStreamService } from '../../src/thought-stream-service.js';
import { RateLimiter } from '../../src/rate-limiter.js';

const TEST_AUTH_TOKEN = 'test-auth-token-456';

function makeRequest(
  port: number,
  path: string,
  method: string,
  body?: string,
  authToken?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode!, body: data });
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

describe('ThoughtStreamService', () => {
  let service: ThoughtStreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ThoughtStreamService(TEST_AUTH_TOKEN);
  });

  afterEach(() => {
    service.close();
  });

  describe('setEventHandlers', () => {
    it('should store callbacks', () => {
      const onThought = vi.fn();
      const onCheckpoint = vi.fn();
      service.setEventHandlers(onThought, onCheckpoint);
      expect((service as unknown as { onThought: unknown }).onThought).toBe(onThought);
      expect((service as unknown as { onCheckpoint: unknown }).onCheckpoint).toBe(onCheckpoint);
    });
  });

  describe('getPort', () => {
    it('should return null before server starts', () => {
      expect(service.getPort()).toBeNull();
    });

    it('should return actual port after server starts', async () => {
      await service.start();
      const port = service.getPort();
      expect(typeof port).toBe('number');
      expect(port).toBeGreaterThan(0);
    });
  });

  describe('registerTask / unregisterTask', () => {
    it('should delegate registerTask to handler', () => {
      service.registerTask('task-1');
      expect(mockThoughtStreamHandler.registerTask).toHaveBeenCalledWith('task-1');
    });

    it('should delegate unregisterTask to handler', () => {
      service.unregisterTask('task-1');
      expect(mockThoughtStreamHandler.unregisterTask).toHaveBeenCalledWith('task-1');
    });
  });

  describe('start', () => {
    it('should return an HTTP server from the promise', async () => {
      const server = await service.start();
      expect(server).toBeInstanceOf(http.Server);
    });
  });

  describe('HTTP server', () => {
    let serverPort: number;

    beforeEach(async () => {
      await service.start();
      serverPort = service.getPort()!;
    });

    it('should return 401 for requests without auth token', async () => {
      const res = await makeRequest(serverPort, '/thought', 'POST', '{}');
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('Unauthorized');
    });

    it('should return 401 for requests with wrong auth token', async () => {
      const res = await makeRequest(serverPort, '/thought', 'POST', '{}', 'wrong-token');
      expect(res.statusCode).toBe(401);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      service.close();
      (service as unknown as { rateLimiter: RateLimiter }).rateLimiter = new RateLimiter(60_000, 1);
      await service.start();
      serverPort = service.getPort()!;

      const first = await makeRequest(serverPort, '/thought', 'POST', '{}');
      const second = await makeRequest(serverPort, '/thought', 'POST', '{}');

      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(429);
      expect(JSON.parse(second.body).error).toBe('Too many requests');
    });

    it('should return 404 for non-POST requests', async () => {
      const res = await makeRequest(serverPort, '/thought', 'GET', undefined, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(404);
    });

    it('should return 204 for OPTIONS requests (CORS preflight)', async () => {
      const res = await makeRequest(serverPort, '/thought', 'OPTIONS');
      expect(res.statusCode).toBe(204);
    });

    it('should return 400 for invalid JSON', async () => {
      const res = await makeRequest(serverPort, '/thought', 'POST', 'not-json{', TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid JSON');
    });

    it('should return 400 for invalid thought event (Zod validation)', async () => {
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);
      // Missing required fields: content, category, agentName, timestamp
      const invalidEvent = { taskId: 'task-1' };
      const res = await makeRequest(serverPort, '/thought', 'POST', JSON.stringify(invalidEvent), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid thought event');
    });

    it('should return 400 for invalid checkpoint event (Zod validation)', async () => {
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);
      // Missing required fields: status, summary, agentName, timestamp
      const invalidEvent = { taskId: 'task-1' };
      const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(invalidEvent), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid checkpoint event');
    });

    it('should return 200 silently for inactive taskId on /thought', async () => {
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(false);
      const event = {
        taskId: 'inactive-task',
        content: 'thinking...',
        category: 'observation',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/thought', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('');
    });

    it('should return 200 silently for inactive taskId on /checkpoint', async () => {
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(false);
      const event = {
        taskId: 'inactive-task',
        status: 'progress',
        summary: 'Working on it',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('');
    });

    it('should forward POST /thought to onThought callback for active tasks', async () => {
      const onThought = vi.fn();
      const onCheckpoint = vi.fn();
      service.setEventHandlers(onThought, onCheckpoint);
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);

      const event = {
        taskId: 'task-1',
        content: 'thinking...',
        category: 'observation',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/thought', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);

      expect(res.statusCode).toBe(200);
      expect(onThought).toHaveBeenCalledWith(event);
      expect(onCheckpoint).not.toHaveBeenCalled();
    });

    it('should forward POST /checkpoint to onCheckpoint callback for active tasks', async () => {
      const onThought = vi.fn();
      const onCheckpoint = vi.fn();
      service.setEventHandlers(onThought, onCheckpoint);
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);

      const event = {
        taskId: 'task-1',
        status: 'progress',
        summary: 'Working on it',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);

      expect(res.statusCode).toBe(200);
      expect(onCheckpoint).toHaveBeenCalledWith(event);
      expect(onThought).not.toHaveBeenCalled();
    });

    it('should return 404 for unknown POST paths', async () => {
      const res = await makeRequest(
        serverPort,
        '/unknown',
        'POST',
        JSON.stringify({ taskId: 'task-1' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(404);
    });

    it('should return 413 when body exceeds 1MB', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1);
      const res = await makeRequest(serverPort, '/thought', 'POST', largeBody, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toBe('Request body too large');
    });

    it('should accept valid thought event with all categories', async () => {
      const onThought = vi.fn();
      service.setEventHandlers(onThought, vi.fn());
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);

      const categories = ['observation', 'reasoning', 'decision', 'action'] as const;
      for (const category of categories) {
        const event = {
          taskId: 'task-1',
          content: `${category} event`,
          category,
          agentName: 'test-agent',
          timestamp: Date.now(),
        };
        const res = await makeRequest(serverPort, '/thought', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
        expect(res.statusCode).toBe(200);
      }
      expect(onThought).toHaveBeenCalledTimes(4);
    });

    it('should accept valid checkpoint event with all statuses', async () => {
      const onCheckpoint = vi.fn();
      service.setEventHandlers(vi.fn(), onCheckpoint);
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);

      const statuses = ['progress', 'complete', 'stuck'] as const;
      for (const status of statuses) {
        const event = {
          taskId: 'task-1',
          status,
          summary: `${status} checkpoint`,
          agentName: 'test-agent',
          timestamp: Date.now(),
        };
        const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
        expect(res.statusCode).toBe(200);
      }
      expect(onCheckpoint).toHaveBeenCalledTimes(3);
    });

    it('should reject thought event with invalid category', async () => {
      const event = {
        taskId: 'task-1',
        content: 'test',
        category: 'invalid_category',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/thought', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid thought event');
    });

    it('should reject checkpoint event with invalid status', async () => {
      const event = {
        taskId: 'task-1',
        status: 'invalid_status',
        summary: 'test',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid checkpoint event');
    });

    it('should accept checkpoint event with optional fields', async () => {
      const onCheckpoint = vi.fn();
      service.setEventHandlers(vi.fn(), onCheckpoint);
      mockThoughtStreamHandler.isTaskActive.mockReturnValue(true);

      const event = {
        taskId: 'task-1',
        status: 'stuck',
        summary: 'Blocked on something',
        nextPlanned: 'retry later',
        blocker: 'API rate limit',
        agentName: 'test-agent',
        timestamp: Date.now(),
      };
      const res = await makeRequest(serverPort, '/checkpoint', 'POST', JSON.stringify(event), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(200);
      expect(onCheckpoint).toHaveBeenCalledWith(event);
    });
  });

  describe('close', () => {
    it('should close the server', async () => {
      await service.start();
      service.close();
      expect(() => service.close()).not.toThrow();
    });

    it('should be safe to call without starting', () => {
      expect(() => service.close()).not.toThrow();
    });
  });
});
