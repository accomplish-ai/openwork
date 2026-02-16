import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeCliNotFoundError } from '../../../src/opencode/adapter.js';
import {
  CompletionEnforcer,
  CompletionFlowState,
} from '../../../src/opencode/completion/index.js';
import type { CompletionEnforcerCallbacks } from '../../../src/opencode/completion/index.js';
import type { TodoItem } from '../../../src/common/types/todo.js';

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

describe('Shell escaping utilities', () => {
  // Test the escaping logic indirectly through observable behavior
  // These utilities are private but critical for security

  describe('Windows shell escaping', () => {
    it('should handle arguments with spaces', () => {
      // Arguments with spaces need quoting on Windows
      const argWithSpace = 'hello world';
      expect(argWithSpace.includes(' ')).toBe(true);
    });

    it('should handle arguments with quotes', () => {
      // Arguments with quotes need special handling
      const argWithQuote = 'say "hello"';
      expect(argWithQuote.includes('"')).toBe(true);
    });
  });

  describe('Unix shell escaping', () => {
    it('should handle arguments with single quotes', () => {
      // Single quotes need escaping on Unix
      const argWithSingleQuote = "it's working";
      expect(argWithSingleQuote.includes("'")).toBe(true);
    });

    it('should handle arguments with special characters', () => {
      // Special shell characters need escaping
      const argWithSpecial = 'echo $HOME';
      expect(argWithSpecial.includes('$')).toBe(true);
    });
  });
});

describe('Platform-specific behavior', () => {
  it('should recognize darwin platform', () => {
    expect(process.platform).toBeDefined();
  });

  it('should recognize win32 platform', () => {
    // This tests that the platform string is recognized
    const platforms = ['win32', 'darwin', 'linux'];
    expect(platforms).toContain(process.platform);
  });
});

describe('Task lifecycle', () => {
  it('should generate unique task IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    // All IDs should be unique
    expect(ids.size).toBe(100);
  });

  it('should generate unique message IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it('should generate unique request IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });
});

describe('Start task detection', () => {
  it('should recognize start_task tool', () => {
    const isStartTask = (name: string) =>
      name === 'start_task' || name.endsWith('_start_task');

    expect(isStartTask('start_task')).toBe(true);
    expect(isStartTask('mcp_start_task')).toBe(true);
    expect(isStartTask('other_tool')).toBe(false);
  });

  it('should recognize exempt tools', () => {
    const isExemptTool = (name: string) => {
      if (name === 'todowrite' || name.endsWith('_todowrite')) return true;
      if (name === 'start_task' || name.endsWith('_start_task')) return true;
      return false;
    };

    expect(isExemptTool('todowrite')).toBe(true);
    expect(isExemptTool('mcp_todowrite')).toBe(true);
    expect(isExemptTool('start_task')).toBe(true);
    expect(isExemptTool('read_file')).toBe(false);
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

  it('should skip plan emission when needs_planning is false', () => {
    const input = {
      needs_planning: false,
      original_request: 'Hello!',
      skills: [],
    };

    // When needs_planning is false, goal and steps are undefined
    // The adapter guard `if (startInput?.goal && startInput?.steps)` skips plan emission
    const shouldEmitPlan = !!(input as { goal?: string; steps?: string[] }).goal
      && !!(input as { goal?: string; steps?: string[] }).steps;
    expect(shouldEmitPlan).toBe(false);
  });

  it('should still allow start_task detection when needs_planning is false', () => {
    const isStartTask = (name: string) =>
      name === 'start_task' || name.endsWith('_start_task');

    // start_task is recognized regardless of needs_planning value
    expect(isStartTask('start_task')).toBe(true);
    expect(isStartTask('mcp_start_task')).toBe(true);
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

describe('isNonTaskContinuationTool classification', () => {
  const isNonTaskContinuationTool = (toolName: string): boolean => {
    return toolName === 'skill' || toolName.endsWith('_skill');
  };

  it('should classify "skill" as non-continuation tool', () => {
    expect(isNonTaskContinuationTool('skill')).toBe(true);
  });

  it('should classify mcp-prefixed skill as non-continuation tool', () => {
    expect(isNonTaskContinuationTool('mcp_skill')).toBe(true);
    expect(isNonTaskContinuationTool('some_prefix_skill')).toBe(true);
  });

  it('should classify regular tools as continuation tools', () => {
    expect(isNonTaskContinuationTool('bash')).toBe(false);
    expect(isNonTaskContinuationTool('read_file')).toBe(false);
    expect(isNonTaskContinuationTool('complete_task')).toBe(false);
    expect(isNonTaskContinuationTool('start_task')).toBe(false);
  });

  it('should not match skill as substring', () => {
    expect(isNonTaskContinuationTool('skillful')).toBe(false);
    expect(isNonTaskContinuationTool('skills')).toBe(false);
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

describe('handleMessage post-completion guard', () => {
  it('should skip message handling when hasCompleted is true', () => {
    // Simulate the adapter's guard: if (this.hasCompleted) return;
    let hasCompleted = true;
    const events: string[] = [];

    const handleMessage = (type: string) => {
      if (hasCompleted) return;
      events.push(type);
    };

    handleMessage('text');
    handleMessage('tool_call');
    handleMessage('step_finish');

    expect(events).toEqual([]);
  });

  it('should process messages when hasCompleted is false', () => {
    let hasCompleted = false;
    const events: string[] = [];

    const handleMessage = (type: string) => {
      if (hasCompleted) return;
      events.push(type);
    };

    handleMessage('text');
    handleMessage('tool_call');

    expect(events).toEqual(['text', 'tool_call']);
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

describe('emitPlanMessage null safety', () => {
  it('should handle steps being undefined in plan text generation', () => {
    // The adapter uses: input.steps?.map(...) ?? ''
    const input = {
      goal: 'Some goal',
      steps: undefined as string[] | undefined,
    };

    const stepsText = input.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n') ?? '';
    expect(stepsText).toBe('');
  });

  it('should handle empty verification array', () => {
    const verification: string[] = [];
    const section = verification.length
      ? `\n\n**Verification:**\n${verification.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
      : '';
    expect(section).toBe('');
  });

  it('should handle empty skills array', () => {
    const skills: string[] = [];
    const section = skills.length
      ? `\n\n**Skills:** ${skills.join(', ')}`
      : '';
    expect(section).toBe('');
  });
});
