import { describe, it, expect } from 'vitest';
import { validateTaskConfig, validateAttachments } from '../../../src/utils/task-validation.js';
import type { TaskAttachment } from '../../../src/common/types/task.js';

function makeAttachment(overrides: Partial<TaskAttachment> = {}): TaskAttachment {
  return {
    type: 'screenshot',
    data: 'data:image/png;base64,iVBORw0KGgo=',
    ...overrides,
  };
}

describe('validateAttachments', () => {
  it('should return valid attachments', () => {
    const attachments = [makeAttachment(), makeAttachment({ type: 'json', data: '{"key":"val"}' })];
    const result = validateAttachments(attachments);
    expect(result).toHaveLength(2);
    expect(result![0].type).toBe('screenshot');
    expect(result![1].type).toBe('json');
  });

  it('should return undefined for empty array', () => {
    expect(validateAttachments([])).toBeUndefined();
  });

  it('should return undefined when all items are invalid', () => {
    expect(validateAttachments([null, undefined, 42, 'string'])).toBeUndefined();
  });

  it('should filter out non-object items', () => {
    const result = validateAttachments([null, makeAttachment(), undefined, 'bad']);
    expect(result).toHaveLength(1);
  });

  it('should reject attachments with invalid type', () => {
    const result = validateAttachments([makeAttachment({ type: 'video' as 'screenshot' })]);
    expect(result).toBeUndefined();
  });

  it('should reject attachments with empty data', () => {
    const result = validateAttachments([makeAttachment({ data: '' })]);
    expect(result).toBeUndefined();
  });

  it('should reject attachments with non-string data', () => {
    const result = validateAttachments([{ type: 'screenshot', data: 123 }]);
    expect(result).toBeUndefined();
  });

  it('should reject attachments with non-string type', () => {
    const result = validateAttachments([{ type: 42, data: 'valid' }]);
    expect(result).toBeUndefined();
  });

  it('should reject attachments exceeding 10MB data length', () => {
    const hugeData = 'x'.repeat(10 * 1024 * 1024 + 1);
    const result = validateAttachments([makeAttachment({ data: hugeData })]);
    expect(result).toBeUndefined();
  });

  it('should accept attachments at exactly 10MB data length', () => {
    const maxData = 'x'.repeat(10 * 1024 * 1024);
    const result = validateAttachments([makeAttachment({ data: maxData })]);
    expect(result).toHaveLength(1);
  });

  it('should truncate to max 5 attachments', () => {
    const attachments = Array.from({ length: 8 }, () => makeAttachment());
    const result = validateAttachments(attachments);
    expect(result).toHaveLength(5);
  });

  it('should allow attachments without label', () => {
    const att = makeAttachment();
    delete (att as Record<string, unknown>).label;
    const result = validateAttachments([att]);
    expect(result).toHaveLength(1);
  });

  it('should allow attachments with string label', () => {
    const result = validateAttachments([makeAttachment({ label: 'my-screenshot.png' })]);
    expect(result).toHaveLength(1);
    expect(result![0].label).toBe('my-screenshot.png');
  });

  it('should reject attachments with non-string label', () => {
    const result = validateAttachments([{ type: 'screenshot', data: 'valid', label: 42 }]);
    expect(result).toBeUndefined();
  });

  it('should filter invalid items among valid ones', () => {
    const result = validateAttachments([
      makeAttachment(),
      { type: 'bad', data: 'valid' },
      makeAttachment({ type: 'json', data: '{}' }),
      { type: 'screenshot', data: '' },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('validateTaskConfig with attachments', () => {
  it('should carry through valid attachments', () => {
    const config = {
      prompt: 'test prompt',
      attachments: [makeAttachment()],
    };
    const result = validateTaskConfig(config);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].type).toBe('screenshot');
  });

  it('should omit attachments when empty array', () => {
    const config = {
      prompt: 'test prompt',
      attachments: [],
    };
    const result = validateTaskConfig(config);
    expect(result.attachments).toBeUndefined();
  });

  it('should omit attachments when all invalid', () => {
    const config = {
      prompt: 'test prompt',
      attachments: [{ type: 'invalid' as 'screenshot', data: '' }],
    };
    const result = validateTaskConfig(config);
    expect(result.attachments).toBeUndefined();
  });

  it('should omit attachments when undefined', () => {
    const config = { prompt: 'test prompt' };
    const result = validateTaskConfig(config);
    expect(result.attachments).toBeUndefined();
  });

  it('should validate attachments alongside other config fields', () => {
    const config = {
      prompt: 'test prompt',
      sessionId: 'session-123',
      attachments: [makeAttachment({ label: 'bug.png' })],
    };
    const result = validateTaskConfig(config);
    expect(result.prompt).toBe('test prompt');
    expect(result.sessionId).toBe('session-123');
    expect(result.attachments).toHaveLength(1);
  });
});
