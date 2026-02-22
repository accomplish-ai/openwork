import { describe, it, expect } from 'vitest';
import { validateTaskConfig } from '../../../src/utils/task-validation.js';

const validAttachment = {
  id: 'att-1',
  name: 'file.txt',
  path: '/tmp/file.txt',
  type: 'text' as const,
  size: 100,
};

describe('validateTaskConfig', () => {
  describe('attachments', () => {
    it('accepts valid attachments array', () => {
      const config = { prompt: 'Do something', attachments: [validAttachment] };
      const result = validateTaskConfig(config);
      expect(result.prompt).toBe('Do something');
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments![0]).toEqual(validAttachment);
    });

    it('accepts up to 5 attachments', () => {
      const attachments = Array.from({ length: 5 }, (_, i) => ({
        ...validAttachment,
        id: `att-${i}`,
        name: `file${i}.txt`,
        path: `/tmp/file${i}.txt`,
      }));
      const result = validateTaskConfig({ prompt: 'Task', attachments });
      expect(result.attachments).toHaveLength(5);
    });

    it('rejects more than 5 attachments', () => {
      const attachments = Array.from({ length: 6 }, (_, i) => ({
        ...validAttachment,
        id: `att-${i}`,
        path: `/tmp/file${i}.txt`,
      }));
      expect(() => validateTaskConfig({ prompt: 'Task', attachments })).toThrow(
        'Attachments exceed maximum of 5 files',
      );
    });

    it('rejects attachment with size over 10MB', () => {
      const att = { ...validAttachment, size: 11 * 1024 * 1024 };
      expect(() => validateTaskConfig({ prompt: 'Task', attachments: [att] })).toThrow(
        'exceeds maximum size',
      );
    });

    it('rejects attachment with path containing directory traversal', () => {
      const att = { ...validAttachment, path: '/tmp/../etc/passwd' };
      expect(() => validateTaskConfig({ prompt: 'Task', attachments: [att] })).toThrow(
        'must not contain directory traversal',
      );
    });

    it('rejects attachment with missing name', () => {
      const att = { ...validAttachment, name: '' };
      expect(() => validateTaskConfig({ prompt: 'Task', attachments: [att] })).toThrow(
        'must have a non-empty name',
      );
    });

    it('rejects attachment with missing path', () => {
      const att = { ...validAttachment, path: '' };
      expect(() => validateTaskConfig({ prompt: 'Task', attachments: [att] })).toThrow(
        'Attachment path is required',
      );
    });

    it('rejects attachment with invalid type', () => {
      const att = { ...validAttachment, type: 'invalid' };
      expect(() => validateTaskConfig({ prompt: 'Task', attachments: [att] })).toThrow(
        'must have type one of',
      );
    });

    it('normalizes attachment with missing id to att-{index}', () => {
      const att = { name: 'x.txt', path: '/tmp/x.txt', type: 'text', size: 0 };
      const result = validateTaskConfig({ prompt: 'Task', attachments: [att] });
      expect(result.attachments![0].id).toBe('att-0');
    });
  });

  describe('prompt with attachments', () => {
    it('allows empty prompt when attachments present', () => {
      const result = validateTaskConfig({ prompt: '   ', attachments: [validAttachment] });
      expect(result.prompt).toBe(' ');
      expect(result.attachments).toHaveLength(1);
    });

    it('rejects empty prompt when no attachments', () => {
      expect(() => validateTaskConfig({ prompt: '   ' })).toThrow('prompt is required');
    });
  });
});
