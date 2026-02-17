/**
 * Integration tests for the context overflow recovery flow.
 *
 * Tests the full wiring: log-watcher emits ContextOverflow error ->
 * adapter intercepts it (does NOT surface to user) -> calls compactConversation ->
 * builds continuation prompt -> retries with a new CLI session.
 *
 * Mocks ONLY external boundaries:
 *   - node-pty (native module, can't spawn real PTY in tests)
 *   - fetch (Anthropic API call inside compactConversation)
 *   - log-watcher's file I/O (returns controllable EventEmitter)
 *
 * Everything else runs for real: handleContextOverflow, surfaceError,
 * buildContinuationPrompt, event emission, retry gating.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// --- Fake PTY ---
// Minimal mock that satisfies the adapter's usage of node-pty.
// Tracks spawn calls so we can assert retry behavior.

interface FakePty {
  pid: number;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (e: { exitCode: number; signal: number }) => void) => void;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
}

const spawnCalls: Array<{ shell: string; args: string[]; opts: unknown }> = [];
let lastFakePty: FakePty | null = null;

function createFakePty(): FakePty {
  const pty: FakePty = {
    pid: 12345 + spawnCalls.length,
    onData: (_cb: (data: string) => void) => {},
    onExit: (_cb: (e: { exitCode: number; signal: number }) => void) => {},
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
  };
  lastFakePty = pty;
  return pty;
}

vi.mock('node-pty', () => ({
  default: {
    spawn: (shell: string, args: string[], opts: unknown) => {
      spawnCalls.push({ shell, args, opts });
      return createFakePty();
    },
  },
  spawn: (shell: string, args: string[], opts: unknown) => {
    spawnCalls.push({ shell, args, opts });
    return createFakePty();
  },
}));

// --- Fake log-watcher ---
// We return a real EventEmitter so the adapter's .on('error', ...) wiring works,
// but we control when errors are emitted.

let fakeLogWatcher: EventEmitter & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

function createFakeLogWatcher() {
  const emitter = new EventEmitter() as EventEmitter & {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };
  emitter.start = vi.fn().mockResolvedValue(undefined);
  emitter.stop = vi.fn().mockResolvedValue(undefined);
  fakeLogWatcher = emitter;
  return emitter;
}

vi.mock('../../../src/opencode/log-watcher.js', () => ({
  createLogWatcher: () => createFakeLogWatcher(),
  OpenCodeLogWatcher: {
    getErrorMessage: (error: { message?: string; errorName: string }) => {
      return error.message || `Error: ${error.errorName}`;
    },
  },
  // Re-export the interface name so TS import doesn't break at runtime
  OpenCodeLogError: undefined,
}));

// --- Mock fetch for compactConversation ---
// compactConversation calls fetch to the Anthropic API. We intercept globally.

let fetchMock: ReturnType<typeof vi.fn>;

// --- Import the adapter AFTER mocks are registered ---
// Dynamic import isn't needed because vi.mock is hoisted by vitest.
import { OpenCodeAdapter, buildContinuationPrompt } from '../../../src/opencode/adapter.js';
import type { OpenCodeLogError } from '../../../src/opencode/log-watcher.js';
import type { AdapterOptions } from '../../../src/opencode/adapter.js';
import type { TaskResult } from '../../../src/common/types/task.js';

// --- Helper: default adapter options ---
function makeAdapterOptions(overrides?: Partial<AdapterOptions>): AdapterOptions {
  return {
    platform: 'darwin',
    isPackaged: false,
    tempPath: '/tmp/test',
    getCliCommand: () => ({ command: 'echo', args: ['test'] }),
    buildEnvironment: async () => ({}),
    buildCliArgs: async () => [],
    getApiKey: (provider) => (provider === 'anthropic' ? 'sk-test-key' : null),
    ...overrides,
  };
}

// --- Helper: create a ContextOverflow error object ---
function makeContextOverflowError(overrides?: Partial<OpenCodeLogError>): OpenCodeLogError {
  return {
    timestamp: new Date().toISOString(),
    service: 'opencode',
    errorName: 'ContextOverflow',
    statusCode: 400,
    message: 'Context overflow: 250000 tokens exceeded 200000 token limit.',
    currentTokens: 250000,
    maxTokens: 200000,
    raw: 'ERROR prompt is too long: 250000 tokens > 200000 maximum',
    ...overrides,
  };
}

describe('context overflow recovery (integration)', () => {
  beforeEach(() => {
    // Silence console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Reset tracking arrays
    spawnCalls.length = 0;
    lastFakePty = null;

    // Set up the global fetch mock.
    // Default: return a successful compaction response.
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'GOAL: Complete the form\nPROGRESS: Steps 1-3 done\nREMAINING: Step 4',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * Helper: start a task on the adapter so that internal state (ptyProcess,
   * lastTaskConfig, hasCompleted=false) is set up. Returns the adapter.
   */
  async function startAdapterWithTask(
    adapterOpts?: Partial<AdapterOptions>,
  ): Promise<OpenCodeAdapter> {
    const adapter = new OpenCodeAdapter(makeAdapterOptions(adapterOpts));

    await adapter.startTask({
      prompt: 'Navigate to example.com and fill in the form',
      workingDirectory: '/tmp/test',
    });

    return adapter;
  }

  // ----------------------------------------------------------------
  // Test 1: First overflow triggers recovery, NOT an error to the user
  // ----------------------------------------------------------------
  it('should intercept first ContextOverflow and NOT surface error to user', async () => {
    const adapter = await startAdapterWithTask();

    // Collect events emitted by the adapter
    const completeEvents: TaskResult[] = [];
    const errorEvents: Error[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));
    adapter.on('error', (err) => errorEvents.push(err));

    // Emit the ContextOverflow error from the log watcher
    const overflowError = makeContextOverflowError();
    fakeLogWatcher.emit('error', overflowError);

    // Wait for the async handleContextOverflow to settle
    await vi.waitFor(() => {
      // Recovery should have spawned a second PTY (first was startTask, second is retry)
      expect(spawnCalls.length).toBe(2);
    });

    // The error should NOT have been surfaced as a complete-with-error event
    // (the only complete events should be absent — recovery started a new task, not an error)
    const errorCompleteEvents = completeEvents.filter((e) => e.status === 'error');
    expect(errorCompleteEvents).toHaveLength(0);

    // No raw 'error' event either
    expect(errorEvents).toHaveLength(0);

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 2: compactConversation is called with conversation messages
  // ----------------------------------------------------------------
  it('should call compactConversation (via fetch) with an Anthropic API key', async () => {
    const adapter = await startAdapterWithTask();

    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // The fetch call should be to the Anthropic messages API
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages');

    // The body should include the compaction system prompt
    const body = JSON.parse(call[1].body);
    expect(body.system).toContain('Summarize this computer-use agent conversation');
    expect(body.model).toBe('claude-3-5-haiku-latest');

    // The API key header should use our test key
    expect(call[1].headers['x-api-key']).toBe('sk-test-key');

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 3: Continuation prompt is built with the summary and used in retry
  // ----------------------------------------------------------------
  it('should retry with a continuation prompt containing the compacted summary', async () => {
    // Track ALL buildCliArgs calls (including the initial startTask call)
    const buildCliArgsCalls: unknown[] = [];
    const adapter = await startAdapterWithTask({
      buildCliArgs: async (config) => {
        buildCliArgsCalls.push(config);
        return [];
      },
    });

    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(spawnCalls.length).toBe(2);
    });

    // buildCliArgs is called once for startTask and once for the retry
    expect(buildCliArgsCalls.length).toBeGreaterThanOrEqual(2);
    const retryConfig = buildCliArgsCalls[buildCliArgsCalls.length - 1] as {
      prompt: string;
      sessionId?: string;
    };

    // The retry prompt should contain the continuation context and summary
    expect(retryConfig.prompt).toContain('Session Continuation Context');
    expect(retryConfig.prompt).toContain('GOAL: Complete the form');
    expect(retryConfig.prompt).toContain('PROGRESS: Steps 1-3 done');
    expect(retryConfig.prompt).toContain('Navigate to example.com and fill in the form');

    // sessionId should be undefined (fresh session, not reusing the old one)
    expect(retryConfig.sessionId).toBeUndefined();

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 4: Second overflow IS surfaced to the user
  // ----------------------------------------------------------------
  it('should surface error to user on second ContextOverflow (retry already attempted)', async () => {
    const adapter = await startAdapterWithTask();

    const completeEvents: TaskResult[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));

    // First overflow — triggers recovery
    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(spawnCalls.length).toBe(2);
    });

    // Clear events from the first round
    completeEvents.length = 0;

    // Second overflow — should surface error because isRetryAttempt is now true
    fakeLogWatcher.emit('error', makeContextOverflowError({
      currentTokens: 300000,
      maxTokens: 200000,
      message: 'Context overflow: 300000 tokens exceeded 200000 token limit.',
    }));

    // Give the synchronous surfaceError a tick to emit
    await vi.waitFor(() => {
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    // Now the error SHOULD be surfaced
    expect(completeEvents[0].status).toBe('error');
    expect(completeEvents[0].error).toContain('Context overflow');

    // No third PTY spawn — we gave up
    expect(spawnCalls.length).toBe(2);

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 5: PTY is killed during recovery
  // ----------------------------------------------------------------
  it('should kill the existing PTY process during recovery', async () => {
    const adapter = await startAdapterWithTask();

    // Grab the PTY that startTask created
    const firstPty = lastFakePty!;
    expect(firstPty).not.toBeNull();

    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(spawnCalls.length).toBe(2);
    });

    // The first PTY's kill method should have been called
    expect(firstPty.kill).toHaveBeenCalled();

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 6: No getApiKey -> surfaces error immediately
  // ----------------------------------------------------------------
  it('should surface error immediately when getApiKey is not available', async () => {
    const adapter = await startAdapterWithTask({ getApiKey: undefined });

    const completeEvents: TaskResult[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));

    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    expect(completeEvents[0].status).toBe('error');
    expect(completeEvents[0].error).toContain('Context overflow');

    // No retry spawn (only the initial startTask spawn)
    expect(spawnCalls.length).toBe(1);

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 7: Compaction failure -> surfaces original error
  // ----------------------------------------------------------------
  it('should surface original error when compaction returns null', async () => {
    // Make fetch return a failed response so compactConversation returns null
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const adapter = await startAdapterWithTask();

    const completeEvents: TaskResult[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));

    fakeLogWatcher.emit('error', makeContextOverflowError());

    await vi.waitFor(() => {
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    expect(completeEvents[0].status).toBe('error');
    expect(completeEvents[0].error).toContain('Context overflow');

    // No retry spawn
    expect(spawnCalls.length).toBe(1);

    adapter.dispose();
  });

  // ----------------------------------------------------------------
  // Test 8: Non-ContextOverflow errors are NOT intercepted
  // ----------------------------------------------------------------
  it('should NOT intercept non-ContextOverflow errors (they surface normally)', async () => {
    const adapter = await startAdapterWithTask();

    const completeEvents: TaskResult[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));

    // Emit a different error type
    const authError: OpenCodeLogError = {
      timestamp: new Date().toISOString(),
      service: 'opencode',
      errorName: 'AuthenticationError',
      statusCode: 403,
      message: 'Authentication failed.',
      raw: 'ERROR AccessDeniedException',
    };
    fakeLogWatcher.emit('error', authError);

    await vi.waitFor(() => {
      expect(completeEvents.length).toBeGreaterThan(0);
    });

    // Should be surfaced immediately as an error
    expect(completeEvents[0].status).toBe('error');

    // compactConversation should NOT have been called
    expect(fetchMock).not.toHaveBeenCalled();

    // No retry spawn
    expect(spawnCalls.length).toBe(1);

    adapter.dispose();
  });
});
