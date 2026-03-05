import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { composePromptWithAttachments } from '../../../../src/main/opencode/compose-prompt-with-attachments';

describe('composePromptWithAttachments', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `compose-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('returns prompt unchanged when no attachments', () => {
    expect(composePromptWithAttachments('Hello', undefined)).toBe('Hello');
    expect(composePromptWithAttachments('Hello', [])).toBe('Hello');
  });

  it('appends text file contents for type text', () => {
    const filePath = path.join(testDir, 'note.txt');
    fs.writeFileSync(filePath, 'Line one\nLine two', 'utf-8');
    const result = composePromptWithAttachments('Do this:', [
      { id: '1', name: 'note.txt', path: filePath, type: 'text', size: 100 },
    ]);
    expect(result).toContain('Do this:');
    expect(result).toContain('--- Contents of note.txt ---');
    expect(result).toContain('Line one\nLine two');
    expect(result).toContain('--- End note.txt ---');
  });

  it('appends path for image type', () => {
    const result = composePromptWithAttachments('Analyze', [
      { id: '1', name: 'img.png', path: '/tmp/img.png', type: 'image', size: 1000 },
    ]);
    expect(result).toContain('Analyze');
    expect(result).toContain('[User attached image: /tmp/img.png]');
  });

  it('appends path for other type', () => {
    const result = composePromptWithAttachments('Use this', [
      { id: '1', name: 'data.bin', path: '/tmp/data.bin', type: 'other', size: 500 },
    ]);
    expect(result).toContain('Use this path: /tmp/data.bin');
  });

  it('appends path for document (PDF) without reading content in sync version', () => {
    const result = composePromptWithAttachments('Review', [
      { id: '1', name: 'doc.pdf', path: '/tmp/doc.pdf', type: 'document', size: 10000 },
    ]);
    expect(result).toContain('Use this path: /tmp/doc.pdf');
  });

  it('handles missing file for text type by appending path note', () => {
    const result = composePromptWithAttachments('Task', [
      {
        id: '1',
        name: 'missing.txt',
        path: path.join(testDir, 'missing.txt'),
        type: 'text',
        size: 0,
      },
    ]);
    expect(result).toContain('(could not read)');
    expect(result).toContain('missing.txt');
  });
});
