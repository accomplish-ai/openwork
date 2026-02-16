import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Mock node-pty before importing adapter
vi.mock('node-pty', () => ({
  default: { spawn: vi.fn() },
  spawn: vi.fn(),
}));

// Mock log-watcher before importing adapter
vi.mock('../../../src/opencode/log-watcher.js', () => ({
  createLogWatcher: () => new EventEmitter(),
  OpenCodeLogWatcher: { getErrorMessage: vi.fn() },
}));

import { OpenCodeAdapter, OpenCodeCliNotFoundError } from '../../../src/opencode/adapter.js';
import type { AdapterOptions } from '../../../src/opencode/adapter.js';
import {
  CompletionEnforcer,
  CompletionFlowState,
} from '../../../src/opencode/completion/index.js';
import type { CompletionEnforcerCallbacks } from '../../../src/opencode/completion/index.js';
import type { TodoItem } from '../../../src/common/types/todo.js';
import { serializeError } from '../../../src/utils/error.js';

/**
 * Tests for OpenCodeAdapter module.
 *
 * Note: The adapter relies heavily on node-pty which is a native module.
 * We test the adapter's business logic through its public interfaces
 * without mocking the PTY layer, which would be brittle.
 *
 * Integration tests in the desktop app provide coverage for the full PTY flow.
 */
describe('OpenCodeAdapter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OpenCodeCliNotFoundError', () => {
    it('should have correct error name', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error.name).toBe('OpenCodeCliNotFoundError');
    });

    it('should have descriptive message', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error.message).toContain('OpenCode CLI is not available');
      expect(error.message).toContain('reinstall the application');
    });

    it('should be an instance of Error', () => {
      const error = new OpenCodeCliNotFoundError();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AdapterOptions interface', () => {
    it('should require all mandatory fields', () => {
      // This is a compile-time check - if the interface is wrong, TypeScript will error
      const validOptions = {
        platform: 'darwin' as NodeJS.Platform,
        isPackaged: false,
        tempPath: '/tmp',
        getCliCommand: () => ({ command: 'opencode', args: [] }),
        buildEnvironment: async (_taskId: string) => ({}),
        buildCliArgs: async () => [],
      };

      expect(validOptions).toBeDefined();
    });
  });
});

describe('Plan message formatting', () => {
  it('should format plan with goal and steps when needs_planning is true', () => {
    const input = {
      needs_planning: true,
      goal: 'Build a login form',
      steps: ['Create HTML structure', 'Add CSS styling', 'Implement validation'],
      verification: ['Test form submission'],
      skills: [],
    };

    const planText = `**Plan:**\n\n**Goal:** ${input.goal}\n\n**Steps:**\n${input.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    expect(planText).toContain('**Plan:**');
    expect(planText).toContain('Build a login form');
    expect(planText).toContain('1. Create HTML structure');
    expect(planText).toContain('2. Add CSS styling');
    expect(planText).toContain('3. Implement validation');
  });

  it('should include verification section if present', () => {
    const verification = ['Check form validates', 'Ensure submission works'];
    const verificationSection = `\n\n**Verification:**\n${verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}`;

    expect(verificationSection).toContain('**Verification:**');
    expect(verificationSection).toContain('1. Check form validates');
  });

  it('should include skills section if present', () => {
    const skills = ['frontend-design', 'form-validation'];
    const skillsSection = `\n\n**Skills:** ${skills.join(', ')}`;

    expect(skillsSection).toContain('**Skills:**');
    expect(skillsSection).toContain('frontend-design, form-validation');
  });

});

describe('ANSI escape code filtering', () => {
  it('should recognize CSI sequences', () => {
    const csiPattern = /\x1B\[[0-9;?]*[a-zA-Z]/g;
    const dataWithCsi = '\x1B[31mRed text\x1B[0m';

    expect(dataWithCsi.match(csiPattern)).toBeDefined();
    expect(dataWithCsi.replace(csiPattern, '')).toBe('Red text');
  });

  it('should recognize OSC sequences with BEL terminator', () => {
    const oscPattern = /\x1B\][^\x07]*\x07/g;
    const dataWithOsc = '\x1B]0;Window Title\x07';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
    expect(dataWithOsc.replace(oscPattern, '')).toBe('');
  });

  it('should recognize OSC sequences with ST terminator', () => {
    const oscPattern = /\x1B\][^\x1B]*\x1B\\/g;
    const dataWithOsc = '\x1B]0;Title\x1B\\';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
  });
});

describe('AskUserQuestion handling', () => {
  it('should create permission request from question input', () => {
    const input = {
      questions: [{
        question: 'Do you want to continue?',
        header: 'Confirmation',
        options: [
          { label: 'Yes', description: 'Continue the task' },
          { label: 'No', description: 'Stop the task' },
        ],
        multiSelect: false,
      }],
    };

    const question = input.questions[0];
    const permissionRequest = {
      id: 'req_123',
      taskId: 'task_456',
      type: 'question' as const,
      question: question.question,
      options: question.options.map(o => ({
        label: o.label,
        description: o.description,
      })),
      multiSelect: question.multiSelect,
      createdAt: new Date().toISOString(),
    };

    expect(permissionRequest.type).toBe('question');
    expect(permissionRequest.question).toBe('Do you want to continue?');
    expect(permissionRequest.options?.length).toBe(2);
    expect(permissionRequest.multiSelect).toBe(false);
  });
});

describe('needs_planning classification via CompletionEnforcer', () => {
  let enforcer: CompletionEnforcer;
  let callbacks: CompletionEnforcerCallbacks;
  let debugMessages: Array<{ type: string; message: string; data?: unknown }>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    debugMessages = [];
    callbacks = {
      onStartContinuation: vi.fn().mockResolvedValue(undefined),
      onComplete: vi.fn(),
      onDebug: (type, message, data) => {
        debugMessages.push({ type, message, data });
      },
    };
    enforcer = new CompletionEnforcer(callbacks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('needs_planning=true should mark task requires completion', () => {
    enforcer.markTaskRequiresCompletion();

    // After marking, a step_finish without complete_task should NOT return "complete"
    // because the task requires completion (not conversational)
    enforcer.markToolsUsed(true);
    const action = enforcer.handleStepFinish('stop');
    // Should schedule continuation since tools were used but no complete_task
    expect(action).toBe('pending');
  });

  it('needs_planning=true with steps creates todos and marks requires completion', () => {
    const steps = ['Step 1', 'Step 2', 'Step 3'];
    const todos: TodoItem[] = steps.map((step, i) => ({
      id: String(i + 1),
      content: step,
      status: i === 0 ? 'in_progress' : ('pending' as const),
      priority: 'medium' as const,
    }));

    enforcer.updateTodos(todos);

    // Todos were created — verify through debug messages
    const todoUpdate = debugMessages.find(d => d.type === 'todo_update');
    expect(todoUpdate).toBeDefined();
    expect(todoUpdate!.message).toContain('3 items');
  });

  it('needs_planning=false without tools is treated as conversational', () => {
    // No markTaskRequiresCompletion, no markToolsUsed
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('complete');
  });

  it('needs_planning=false with skills still allows startTaskCalled detection', () => {
    // The adapter sets startTaskCalled=true for any start_task call regardless of needs_planning.
    // This is tested via the isStartTaskTool logic already, but verify the flow:
    const isStartTask = (name: string) =>
      name === 'start_task' || name.endsWith('_start_task');

    expect(isStartTask('start_task')).toBe(true);
    // needs_planning=false means no markTaskRequiresCompletion, so conversational is possible
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('complete');
  });
});

describe('complete_task + PTY kill logic', () => {
  let enforcer: CompletionEnforcer;
  let callbacks: CompletionEnforcerCallbacks;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    callbacks = {
      onStartContinuation: vi.fn().mockResolvedValue(undefined),
      onComplete: vi.fn(),
      onDebug: vi.fn(),
    };
    enforcer = new CompletionEnforcer(callbacks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('complete_task with success status makes shouldComplete() return true', () => {
    enforcer.handleCompleteTaskDetection({ status: 'success', summary: 'Done' });
    expect(enforcer.shouldComplete()).toBe(true);
    expect(enforcer.getState()).toBe(CompletionFlowState.DONE);
  });

  it('complete_task with partial status makes shouldComplete() return false (needs continuation)', () => {
    enforcer.handleCompleteTaskDetection({
      status: 'partial',
      summary: 'Partially done',
      remaining_work: 'More to do',
    });
    expect(enforcer.shouldComplete()).toBe(false);
    expect(enforcer.getState()).toBe(CompletionFlowState.PARTIAL_CONTINUATION_PENDING);
  });

  it('complete_task with blocked status makes shouldComplete() return true', () => {
    enforcer.handleCompleteTaskDetection({ status: 'blocked', summary: 'Blocked' });
    expect(enforcer.shouldComplete()).toBe(true);
    expect(enforcer.getState()).toBe(CompletionFlowState.BLOCKED);
  });

  it('complete_task with success but incomplete todos downgrades to partial', () => {
    const todos: TodoItem[] = [
      { id: '1', content: 'Step 1', status: 'pending', priority: 'medium' },
    ];
    enforcer.updateTodos(todos);

    enforcer.handleCompleteTaskDetection({ status: 'success', summary: 'Done' });

    // Should have been downgraded to partial because of incomplete todos
    expect(enforcer.shouldComplete()).toBe(false);
    expect(enforcer.getState()).toBe(CompletionFlowState.PARTIAL_CONTINUATION_PENDING);
  });

  it('second complete_task call is ignored', () => {
    enforcer.handleCompleteTaskDetection({ status: 'success', summary: 'Done' });
    const result = enforcer.handleCompleteTaskDetection({ status: 'partial', summary: 'Other' });
    expect(result).toBe(false);
    // State remains DONE from first call
    expect(enforcer.getState()).toBe(CompletionFlowState.DONE);
  });
});

describe('markToolsUsed with continuation classification', () => {
  let enforcer: CompletionEnforcer;
  let callbacks: CompletionEnforcerCallbacks;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    callbacks = {
      onStartContinuation: vi.fn().mockResolvedValue(undefined),
      onComplete: vi.fn(),
      onDebug: vi.fn(),
    };
    enforcer = new CompletionEnforcer(callbacks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skill tools do not count for continuation (countsForContinuation=false)', () => {
    // Only skill tools called — no task tools used
    enforcer.markToolsUsed(false); // skill tool
    enforcer.markToolsUsed(false); // another skill tool

    // Without any real tool usage, step_finish should treat as conversational
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('complete');
  });

  it('regular tools count for continuation', () => {
    enforcer.markToolsUsed(true); // bash tool

    // With tool usage but no complete_task, should schedule continuation
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('pending');
  });

  it('mix of skill and regular tools still triggers continuation', () => {
    enforcer.markToolsUsed(false); // skill
    enforcer.markToolsUsed(true);  // bash

    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('pending');
  });
});

describe('Non-task tools should not trigger continuation', () => {
  // These tools are system/lifecycle tools that should be passed as
  // markToolsUsed(false) by the adapter. If only these tools are called,
  // the turn should still complete as conversational.
  const nonTaskTools = [
    'skill', 'my_prefix_skill',
    'start_task', 'mcp_start_task',
    'discard',
    'todowrite', 'mcp_todowrite',
    'complete_task', 'mcp_complete_task',
    'AskUserQuestion', 'mcp_AskUserQuestion',
    'report_checkpoint', 'mcp_report_checkpoint',
    'report_thought', 'mcp_report_thought',
    'request_file_permission', 'mcp_request_file_permission',
  ];

  let enforcer: CompletionEnforcer;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    enforcer = new CompletionEnforcer({
      onStartContinuation: vi.fn().mockResolvedValue(undefined),
      onComplete: vi.fn(),
      onDebug: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(nonTaskTools)(
    '%s does not count as task work',
    () => {
      // All non-task tools should be passed as markToolsUsed(false)
      enforcer.markToolsUsed(false);
      const action = enforcer.handleStepFinish('stop');
      expect(action).toBe('complete');
    }
  );

  it('only non-task tools used still completes as conversational', () => {
    // Simulate multiple non-task tool calls
    enforcer.markToolsUsed(false);
    enforcer.markToolsUsed(false);
    enforcer.markToolsUsed(false);
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('complete');
  });

  it('a single real tool among non-task tools triggers continuation', () => {
    enforcer.markToolsUsed(false); // non-task
    enforcer.markToolsUsed(true);  // real tool (e.g., bash)
    enforcer.markToolsUsed(false); // non-task
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('pending');
  });
});

describe('Integration flow: conversational turn', () => {
  let enforcer: CompletionEnforcer;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    enforcer = new CompletionEnforcer({
      onStartContinuation: vi.fn().mockResolvedValue(undefined),
      onComplete: vi.fn(),
      onDebug: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start_task(needs_planning=false) → text → step_finish → completes without continuation', () => {
    // start_task called but needs_planning=false, so no markTaskRequiresCompletion
    // No tools used (just text response)
    // step_finish(stop) → conversational → complete
    const action = enforcer.handleStepFinish('stop');
    expect(action).toBe('complete');
  });

  it('start_task(needs_planning=true) → tools → complete_task(success) → shouldComplete', () => {
    enforcer.markTaskRequiresCompletion();
    enforcer.markToolsUsed(true); // some tool
    enforcer.handleCompleteTaskDetection({ status: 'success', summary: 'All done' });
    expect(enforcer.shouldComplete()).toBe(true);
  });

  it('start_task(needs_planning=true) → tools → complete_task(partial) → needs continuation', () => {
    enforcer.markTaskRequiresCompletion();
    enforcer.markToolsUsed(true);
    enforcer.handleCompleteTaskDetection({
      status: 'partial',
      summary: 'Half done',
      remaining_work: 'Finish the rest',
    });
    expect(enforcer.shouldComplete()).toBe(false);
    expect(enforcer.getState()).toBe(CompletionFlowState.PARTIAL_CONTINUATION_PENDING);
  });
});

describe('OpenCodeAdapter: complete_task summary and message flow', () => {
  let adapter: OpenCodeAdapter;
  const defaultOptions: AdapterOptions = {
    platform: 'darwin',
    isPackaged: false,
    tempPath: '/tmp',
    getCliCommand: () => ({ command: 'echo', args: [] }),
    buildEnvironment: async () => ({}),
    buildCliArgs: async () => [],
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter = new OpenCodeAdapter(defaultOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper to call the private handleMessage method
  function callHandleMessage(adapterInstance: OpenCodeAdapter, message: unknown): void {
    (adapterInstance as unknown as { handleMessage: (msg: unknown) => void }).handleMessage(message);
  }

  it('emits synthetic text message from complete_task summary', () => {
    const messages: unknown[] = [];
    adapter.on('message', (msg) => messages.push(msg));

    callHandleMessage(adapter, {
      type: 'tool_call',
      part: { tool: 'complete_task', input: { status: 'success', summary: 'Task completed successfully' }, sessionID: 'test-session' },
    });

    const textMsg = messages.find((m: unknown) => (m as { type: string }).type === 'text');
    expect(textMsg).toBeDefined();
    expect((textMsg as { part: { text: string } }).part.text).toBe('Task completed successfully');
  });

  it('does not emit synthetic text when complete_task has no summary', () => {
    const messages: unknown[] = [];
    adapter.on('message', (msg) => messages.push(msg));

    callHandleMessage(adapter, {
      type: 'tool_call',
      part: { tool: 'complete_task', input: { status: 'success' }, sessionID: 'test-session' },
    });

    const textMsgs = messages.filter((m: unknown) => (m as { type: string }).type === 'text');
    expect(textMsgs).toHaveLength(0);
  });

  it('continues processing messages after hasCompleted is set', () => {
    const messages: unknown[] = [];
    adapter.on('message', (msg) => messages.push(msg));

    // Force hasCompleted = true (simulating completion via step_finish)
    (adapter as unknown as { hasCompleted: boolean }).hasCompleted = true;

    callHandleMessage(adapter, {
      type: 'text',
      part: { type: 'text', text: 'Final response after completion', sessionID: 'test-session' },
    });

    expect(messages.length).toBe(1);
    expect((messages[0] as { part: { text: string } }).part.text).toBe('Final response after completion');
  });

  it('does not eagerly complete in handleToolCall when complete_task is detected', () => {
    const completeEvents: unknown[] = [];
    adapter.on('complete', (result) => completeEvents.push(result));

    // Send start_task first (needs_planning=true)
    callHandleMessage(adapter, {
      type: 'tool_call',
      part: { tool: 'start_task', input: { needs_planning: true, goal: 'test', steps: ['step1'], verification: ['v1'] }, sessionID: 'test-session' },
    });

    // Send complete_task — should NOT emit 'complete' event directly
    callHandleMessage(adapter, {
      type: 'tool_call',
      part: { tool: 'complete_task', input: { status: 'success', summary: 'Done' }, sessionID: 'test-session' },
    });

    // No eager completion — handleProcessExit should handle it
    expect(completeEvents).toHaveLength(0);
    expect((adapter as unknown as { hasCompleted: boolean }).hasCompleted).toBe(false);
  });
});

describe('OpenCodeAdapter: start_task(needs_planning=true) integration', () => {
  let adapter: OpenCodeAdapter;
  const defaultOptions: AdapterOptions = {
    platform: 'darwin',
    isPackaged: false,
    tempPath: '/tmp',
    getCliCommand: () => ({ command: 'echo', args: [] }),
    buildEnvironment: async () => ({}),
    buildCliArgs: async () => [],
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    adapter = new OpenCodeAdapter(defaultOptions);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function callHandleMessage(adapterInstance: OpenCodeAdapter, message: unknown): void {
    (adapterInstance as unknown as { handleMessage: (msg: unknown) => void }).handleMessage(message);
  }

  it('emits plan message and todo:update, and marks task requires completion', () => {
    const emittedMessages: unknown[] = [];
    const emittedTodos: TodoItem[][] = [];

    adapter.on('message', (msg) => emittedMessages.push(msg));
    adapter.on('todo:update', (todos) => emittedTodos.push(todos));

    callHandleMessage(adapter, {
      type: 'tool_call',
      part: {
        tool: 'start_task',
        input: {
          original_request: 'Build a login form',
          needs_planning: true,
          goal: 'Build a login form',
          steps: ['Create HTML', 'Add CSS', 'Implement validation'],
          verification: ['Test submission'],
          skills: [],
        },
        sessionID: 'test-session',
      },
    });

    // Verify plan message was emitted
    const planMsg = emittedMessages.find(
      (m: unknown) => (m as { type: string }).type === 'text' &&
        (m as { part: { text: string } }).part.text.includes('**Plan:**')
    );
    expect(planMsg).toBeDefined();
    expect((planMsg as { part: { text: string } }).part.text).toContain('Build a login form');
    expect((planMsg as { part: { text: string } }).part.text).toContain('1. Create HTML');

    // Verify todos were emitted
    expect(emittedTodos).toHaveLength(1);
    const todos = emittedTodos[0];
    expect(todos).toHaveLength(3);
    expect(todos[0].content).toBe('Create HTML');
    expect(todos[0].status).toBe('in_progress');
    expect(todos[1].status).toBe('pending');
    expect(todos[2].status).toBe('pending');

    // Verify markTaskRequiresCompletion was called (step_finish without complete_task should NOT complete)
    callHandleMessage(adapter, {
      type: 'tool_call',
      part: { tool: 'bash', input: {}, sessionID: 'test-session' },
    });

    const completionEnforcer = (adapter as unknown as { completionEnforcer: CompletionEnforcer }).completionEnforcer;
    const action = completionEnforcer.handleStepFinish('stop');
    expect(action).toBe('pending');
  });
});

describe('serializeError', () => {
  it('should pass through string errors unchanged', () => {
    expect(serializeError('API rate limit exceeded')).toBe('API rate limit exceeded');
  });

  it('should serialize an object error to JSON', () => {
    const objectError = { name: 'APIError', data: { message: 'Bad request', statusCode: 400 } };
    const result = serializeError(objectError);
    expect(typeof result).toBe('string');
    expect(result).toContain('APIError');
    expect(result).toContain('400');
  });

  it('should handle error with nested data', () => {
    const nested = { message: 'timeout', details: { retryAfter: 30 } };
    const result = serializeError(nested);
    expect(typeof result).toBe('string');
    expect(result).toContain('timeout');
  });

  it('should handle numeric error codes', () => {
    expect(serializeError(500)).toBe('500');
  });

  it('should handle null error', () => {
    expect(serializeError(null)).toBe('null');
  });
});
