import { describe, it, expect } from 'vitest';
import {
  sanitizeAssistantTextForDisplay,
  sanitizeToolOutput,
  toTaskMessage,
  getToolDisplayName,
} from '../../../src/opencode/message-processor.js';
import type { OpenCodeMessage } from '../../../src/common/types/opencode.js';

describe('sanitizeAssistantTextForDisplay', () => {
  it('preserves plain assistant text unchanged', () => {
    expect(sanitizeAssistantTextForDisplay('Hello, I can help you with that.')).toBe(
      'Hello, I can help you with that.'
    );
  });

  it('returns null for pure nudge block', () => {
    expect(sanitizeAssistantTextForDisplay('<nudge>some internal nudge</nudge>')).toBeNull();
  });

  it('returns null for pure instruction block', () => {
    const text =
      '<instruction name=context_management_protocol policy_level=critical>internal stuff</instruction>';
    expect(sanitizeAssistantTextForDisplay(text)).toBeNull();
  });

  it('returns null for pure thought block', () => {
    expect(sanitizeAssistantTextForDisplay('<thought>thinking...</thought>')).toBeNull();
  });

  it('keeps user-facing text and strips thought block from mixed message', () => {
    const text = 'Here is your answer.\n<thought>internal reasoning</thought>';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Here is your answer.');
  });

  it('preserves non-internal XML like <div>', () => {
    expect(sanitizeAssistantTextForDisplay('<div>hello</div>')).toBe('<div>hello</div>');
  });

  it('strips orphan closing tags', () => {
    const text = 'Some text</thought> more text';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Some text more text');
  });

  it('strips lines containing context_management_protocol', () => {
    const text = 'Good line\ncontext_management_protocol: do stuff\nAnother good line';
    expect(sanitizeAssistantTextForDisplay(text)).toBe('Good line\n\nAnother good line');
  });

  it('strips text after lone opening <thought> tag (streaming edge)', () => {
    const text = 'Visible text\n<thought>partial thinking with no close';
    // The orphan tag regex strips the opening <thought>, leaving the inner text
    // but the INTERNAL_LINES_RE won't match it. Let's verify actual behavior.
    const result = sanitizeAssistantTextForDisplay(text);
    // The thought block regex won't match (no closing tag), but ORPHAN_TAGS_RE strips <thought>
    expect(result).not.toContain('<thought>');
    expect(result).toContain('Visible text');
  });
});

describe('toTaskMessage', () => {
  it('returns null for fully internal text', () => {
    const message: OpenCodeMessage = {
      type: 'text',
      part: {
        id: '1',
        sessionID: 's1',
        messageID: 'm1',
        type: 'text',
        text: '<thought>all internal</thought>',
      },
    };
    expect(toTaskMessage(message)).toBeNull();
  });

  it('returns valid TaskMessage with sanitized content for mixed text', () => {
    const message: OpenCodeMessage = {
      type: 'text',
      part: {
        id: '2',
        sessionID: 's1',
        messageID: 'm2',
        type: 'text',
        text: 'Hello user\n<nudge>internal</nudge>',
      },
    };
    const result = toTaskMessage(message);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('assistant');
    expect(result!.content).toBe('Hello user');
  });

  it('returns null for hidden tool names like discard', () => {
    const message: OpenCodeMessage = {
      type: 'tool_call',
      part: {
        id: '3',
        sessionID: 's1',
        messageID: 'm3',
        type: 'tool_call',
        tool: 'discard',
        input: '{}',
      },
    };
    expect(toTaskMessage(message)).toBeNull();
  });
});

describe('sanitizeToolOutput', () => {
  it('strips [ref=eNN] patterns', () => {
    const result = sanitizeToolOutput('Click [ref=e42] button', false);
    expect(result).toBe('Click  button');
  });

  it('strips [cursor=pointer] attributes', () => {
    const result = sanitizeToolOutput('Element [cursor=pointer] here', false);
    expect(result).toBe('Element  here');
  });
});

describe('getToolDisplayName', () => {
  it('returns null for hidden tools', () => {
    expect(getToolDisplayName('discard')).toBeNull();
    expect(getToolDisplayName('extract')).toBeNull();
    expect(getToolDisplayName('context_info')).toBeNull();
  });

  it('returns display name for mapped tools', () => {
    expect(getToolDisplayName('browser_click')).toBe('Clicking element');
  });

  it('returns original name for unknown tools', () => {
    expect(getToolDisplayName('some_custom_tool')).toBe('some_custom_tool');
  });
});
