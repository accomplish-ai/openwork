import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';

const { mockPermissionHandler } = vi.hoisted(() => ({
  mockPermissionHandler: {
    validateFilePermissionRequest: vi.fn(),
    validateQuestionRequest: vi.fn(),
    createPermissionRequest: vi.fn(),
    createQuestionRequest: vi.fn(),
    buildFilePermissionRequest: vi.fn(),
    buildQuestionRequest: vi.fn(),
    resolvePermissionRequest: vi.fn(),
    resolveQuestionRequest: vi.fn(),
  },
}));

vi.mock('@accomplish_ai/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@accomplish_ai/agent-core')>();
  return {
    ...actual,
    createPermissionHandler: () => mockPermissionHandler,
    PERMISSION_API_PORT: 19877,
    QUESTION_API_PORT: 19878,
  };
});

import { PermissionService } from '../../src/permission-service.js';
import { RateLimiter } from '../../src/rate-limiter.js';

const TEST_AUTH_TOKEN = 'test-auth-token-123';

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

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PermissionService(TEST_AUTH_TOKEN);
  });

  afterEach(() => {
    service.close();
  });

  describe('init', () => {
    it('should store taskIdGetter and permissionRequestHandler', () => {
      const getter = vi.fn(() => 'task-1');
      const handler = vi.fn();
      service.init(getter, handler);
      expect(getter).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getPorts', () => {
    it('should return null ports before servers start', () => {
      const ports = service.getPorts();
      expect(ports.permissionPort).toBeNull();
      expect(ports.questionPort).toBeNull();
    });

    it('should return actual ports after servers start', async () => {
      await service.startPermissionApiServer();
      await service.startQuestionApiServer();
      const ports = service.getPorts();
      expect(typeof ports.permissionPort).toBe('number');
      expect(typeof ports.questionPort).toBe('number');
      expect(ports.permissionPort).toBeGreaterThan(0);
      expect(ports.questionPort).toBeGreaterThan(0);
    });
  });

  describe('isFilePermissionRequest', () => {
    it('should return true for filereq_ prefix', () => {
      expect(service.isFilePermissionRequest('filereq_abc123')).toBe(true);
    });

    it('should return false for non-filereq_ prefix', () => {
      expect(service.isFilePermissionRequest('questionreq_abc123')).toBe(false);
      expect(service.isFilePermissionRequest('abc123')).toBe(false);
    });
  });

  describe('isQuestionRequest', () => {
    it('should return true for questionreq_ prefix', () => {
      expect(service.isQuestionRequest('questionreq_abc123')).toBe(true);
    });

    it('should return false for non-questionreq_ prefix', () => {
      expect(service.isQuestionRequest('filereq_abc123')).toBe(false);
      expect(service.isQuestionRequest('abc123')).toBe(false);
    });
  });

  describe('resolvePermission', () => {
    it('should delegate to handler', () => {
      mockPermissionHandler.resolvePermissionRequest.mockReturnValue(true);
      const result = service.resolvePermission('fp_123', true);
      expect(mockPermissionHandler.resolvePermissionRequest).toHaveBeenCalledWith('fp_123', true);
      expect(result).toBe(true);
    });
  });

  describe('resolveQuestion', () => {
    it('should delegate to handler', () => {
      mockPermissionHandler.resolveQuestionRequest.mockReturnValue(true);
      const response = { selectedOptions: ['opt1'], customText: 'text', denied: false };
      const result = service.resolveQuestion('q_123', response);
      expect(mockPermissionHandler.resolveQuestionRequest).toHaveBeenCalledWith('q_123', response);
      expect(result).toBe(true);
    });
  });

  describe('Permission API server', () => {
    let permPort: number;

    beforeEach(async () => {
      await service.startPermissionApiServer();
      const ports = service.getPorts();
      permPort = ports.permissionPort!;
    });

    it('should return 204 for OPTIONS requests (CORS preflight)', async () => {
      const res = await makeRequest(permPort, '/permission', 'OPTIONS');
      expect(res.statusCode).toBe(204);
    });

    it('should return 401 for requests without auth token', async () => {
      const res = await makeRequest(permPort, '/permission', 'POST', '{}');
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('Unauthorized');
    });

    it('should return 401 for requests with wrong auth token', async () => {
      const res = await makeRequest(permPort, '/permission', 'POST', '{}', 'wrong-token');
      expect(res.statusCode).toBe(401);
    });

    it('should return 429 when rate limit is exceeded', async () => {
      service.close();
      (service as unknown as { rateLimiter: RateLimiter }).rateLimiter = new RateLimiter(60_000, 1);
      await service.startPermissionApiServer();
      permPort = service.getPorts().permissionPort!;

      const first = await makeRequest(permPort, '/permission', 'POST', '{}');
      const second = await makeRequest(permPort, '/permission', 'POST', '{}');

      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(429);
      expect(JSON.parse(second.body).error).toBe('Too many requests');
    });

    it('should return 404 for GET requests', async () => {
      const res = await makeRequest(permPort, '/permission', 'GET', undefined, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for POST to wrong path', async () => {
      const res = await makeRequest(permPort, '/wrong', 'POST', '{}', TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid JSON', async () => {
      const res = await makeRequest(permPort, '/permission', 'POST', 'not-json{', TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid JSON');
    });

    it('should return 400 for invalid permission data', async () => {
      mockPermissionHandler.validateFilePermissionRequest.mockReturnValue({
        valid: false,
        error: 'Missing required field',
      });
      const res = await makeRequest(permPort, '/permission', 'POST', JSON.stringify({ bad: true }), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Missing required field');
    });

    it('should return 503 when not initialized', async () => {
      mockPermissionHandler.validateFilePermissionRequest.mockReturnValue({ valid: true });
      const res = await makeRequest(
        permPort,
        '/permission',
        'POST',
        JSON.stringify({ operation: 'modify', filePath: '/tmp/test' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).error).toBe('Permission API not initialized');
    });

    it('should return 400 when no active task', async () => {
      mockPermissionHandler.validateFilePermissionRequest.mockReturnValue({ valid: true });
      service.init(() => null, vi.fn());
      const res = await makeRequest(
        permPort,
        '/permission',
        'POST',
        JSON.stringify({ operation: 'modify', filePath: '/tmp/test' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('No active task');
    });

    it('should create permission request and notify handler', async () => {
      mockPermissionHandler.validateFilePermissionRequest.mockReturnValue({ valid: true });
      mockPermissionHandler.createPermissionRequest.mockReturnValue({
        requestId: 'filereq_1',
        promise: Promise.resolve(true),
      });
      mockPermissionHandler.buildFilePermissionRequest.mockReturnValue({
        id: 'filereq_1',
        taskId: 'task-1',
        type: 'file',
        fileOperation: 'modify',
        filePath: '/tmp/test',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const onPermission = vi.fn();
      service.init(() => 'task-1', onPermission);

      const res = await makeRequest(
        permPort,
        '/permission',
        'POST',
        JSON.stringify({ operation: 'modify', filePath: '/tmp/test' }),
        TEST_AUTH_TOKEN,
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ allowed: true });
      expect(onPermission).toHaveBeenCalledWith({
        id: 'filereq_1',
        taskId: 'task-1',
        type: 'file',
        fileOperation: 'modify',
        filePath: '/tmp/test',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should return 408 when permission request times out', async () => {
      mockPermissionHandler.validateFilePermissionRequest.mockReturnValue({ valid: true });
      const rejectedPromise = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), 0);
      });
      rejectedPromise.catch(() => {}); // prevent unhandled rejection warning
      mockPermissionHandler.createPermissionRequest.mockReturnValue({
        requestId: 'filereq_1',
        promise: rejectedPromise,
      });
      mockPermissionHandler.buildFilePermissionRequest.mockReturnValue({
        id: 'filereq_1',
        taskId: 'task-1',
      });

      service.init(() => 'task-1', vi.fn());

      const res = await makeRequest(
        permPort,
        '/permission',
        'POST',
        JSON.stringify({ operation: 'modify', filePath: '/tmp/test' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(408);
      expect(JSON.parse(res.body).error).toBe('Request timed out');
    });

    it('should return 413 when body exceeds 1MB', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1);
      const res = await makeRequest(permPort, '/permission', 'POST', largeBody, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toBe('Request body too large');
    });
  });

  describe('Question API server', () => {
    let questionPort: number;

    beforeEach(async () => {
      await service.startQuestionApiServer();
      const ports = service.getPorts();
      questionPort = ports.questionPort!;
    });

    it('should return 204 for OPTIONS requests (CORS preflight)', async () => {
      const res = await makeRequest(questionPort, '/question', 'OPTIONS');
      expect(res.statusCode).toBe(204);
    });

    it('should return 401 for requests without auth token', async () => {
      const res = await makeRequest(questionPort, '/question', 'POST', '{}');
      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for GET requests', async () => {
      const res = await makeRequest(questionPort, '/question', 'GET', undefined, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for POST to wrong path', async () => {
      const res = await makeRequest(questionPort, '/wrong', 'POST', '{}', TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for invalid JSON', async () => {
      const res = await makeRequest(questionPort, '/question', 'POST', 'bad-json', TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid JSON');
    });

    it('should return 400 for invalid question data', async () => {
      mockPermissionHandler.validateQuestionRequest.mockReturnValue({
        valid: false,
        error: 'Missing question text',
      });
      const res = await makeRequest(questionPort, '/question', 'POST', JSON.stringify({ bad: true }), TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Missing question text');
    });

    it('should return 503 when not initialized', async () => {
      mockPermissionHandler.validateQuestionRequest.mockReturnValue({ valid: true });
      const res = await makeRequest(
        questionPort,
        '/question',
        'POST',
        JSON.stringify({ question: 'test?' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body).error).toBe('Question API not initialized');
    });

    it('should return 400 when no active task', async () => {
      mockPermissionHandler.validateQuestionRequest.mockReturnValue({ valid: true });
      service.init(() => null, vi.fn());
      const res = await makeRequest(
        questionPort,
        '/question',
        'POST',
        JSON.stringify({ question: 'test?' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('No active task');
    });

    it('should create question request and notify handler', async () => {
      mockPermissionHandler.validateQuestionRequest.mockReturnValue({ valid: true });
      const questionResponse = { selectedOptions: ['yes'], customText: '', denied: false };
      mockPermissionHandler.createQuestionRequest.mockReturnValue({
        requestId: 'questionreq_1',
        promise: Promise.resolve(questionResponse),
      });
      mockPermissionHandler.buildQuestionRequest.mockReturnValue({
        id: 'questionreq_1',
        taskId: 'task-1',
        type: 'question',
        question: 'test?',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const onPermission = vi.fn();
      service.init(() => 'task-1', onPermission);

      const res = await makeRequest(
        questionPort,
        '/question',
        'POST',
        JSON.stringify({ question: 'test?' }),
        TEST_AUTH_TOKEN,
      );

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual(questionResponse);
      expect(onPermission).toHaveBeenCalledWith({
        id: 'questionreq_1',
        taskId: 'task-1',
        type: 'question',
        question: 'test?',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    it('should return 408 when question request times out', async () => {
      mockPermissionHandler.validateQuestionRequest.mockReturnValue({ valid: true });
      const rejectedPromise = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('timeout')), 0);
      });
      rejectedPromise.catch(() => {}); // prevent unhandled rejection warning
      mockPermissionHandler.createQuestionRequest.mockReturnValue({
        requestId: 'questionreq_1',
        promise: rejectedPromise,
      });
      mockPermissionHandler.buildQuestionRequest.mockReturnValue({
        id: 'questionreq_1',
        taskId: 'task-1',
      });

      service.init(() => 'task-1', vi.fn());

      const res = await makeRequest(
        questionPort,
        '/question',
        'POST',
        JSON.stringify({ question: 'test?' }),
        TEST_AUTH_TOKEN,
      );
      expect(res.statusCode).toBe(408);
      expect(JSON.parse(res.body).error).toBe('Request timed out');
    });

    it('should return 413 when body exceeds 1MB', async () => {
      const largeBody = 'x'.repeat(1024 * 1024 + 1);
      const res = await makeRequest(questionPort, '/question', 'POST', largeBody, TEST_AUTH_TOKEN);
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toBe('Request body too large');
    });
  });

  describe('close', () => {
    it('should close both servers', async () => {
      await service.startPermissionApiServer();
      await service.startQuestionApiServer();
      service.close();
      expect(() => service.close()).not.toThrow();
    });

    it('should be safe to call without starting servers', () => {
      expect(() => service.close()).not.toThrow();
    });
  });
});
