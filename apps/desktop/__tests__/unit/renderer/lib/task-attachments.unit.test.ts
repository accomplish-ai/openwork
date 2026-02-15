import { describe, it, expect, vi } from 'vitest';
import {
  type FileAttachment,
  buildPromptWithAttachments,
  getAttachmentPath,
  getAttachmentType,
  toTaskConfigAttachment,
  toTaskConfigAttachments,
} from '../../../../src/renderer/lib/task-attachments';

describe('task-attachments', () => {
  it('maps text attachments to task config with preview', () => {
    const attachment: FileAttachment = {
      id: 'att-text',
      name: 'notes.md',
      path: 'C:\\work\\notes.md',
      type: 'text',
      size: 256,
      preview: '# Notes',
    };

    expect(toTaskConfigAttachment(attachment)).toEqual({
      name: 'notes.md',
      path: 'C:\\work\\notes.md',
      type: 'text',
      size: 256,
      preview: '# Notes',
    });
  });

  it('maps image attachments to task config without preview payload', () => {
    const attachment: FileAttachment = {
      id: 'att-image',
      name: 'photo.png',
      path: 'C:\\work\\photo.png',
      type: 'image',
      size: 2048,
      preview: 'data:image/png;base64,AAA',
    };

    expect(toTaskConfigAttachment(attachment)).toEqual({
      name: 'photo.png',
      path: 'C:\\work\\photo.png',
      type: 'image',
      size: 2048,
    });
  });

  it('maps multiple attachments for task config', () => {
    const attachments: FileAttachment[] = [
      {
        id: 'a',
        name: 'one.txt',
        path: 'C:\\one.txt',
        type: 'text',
        size: 100,
        preview: 'one',
      },
      {
        id: 'b',
        name: 'two.jpg',
        path: 'C:\\two.jpg',
        type: 'image',
        size: 200,
      },
    ];

    expect(toTaskConfigAttachments(attachments)).toHaveLength(2);
    expect(toTaskConfigAttachments(attachments)[1]).toEqual({
      name: 'two.jpg',
      path: 'C:\\two.jpg',
      type: 'image',
      size: 200,
    });
  });

  it('builds prompt sections for image and document attachments', () => {
    const attachments: FileAttachment[] = [
      {
        id: 'img',
        name: 'diagram.png',
        path: 'C:\\diagram.png',
        type: 'image',
        size: 1024,
      },
      {
        id: 'pdf',
        name: 'spec.pdf',
        path: 'C:\\spec.pdf',
        type: 'document',
        size: 4096,
        preview: 'Extracted summary',
      },
    ];

    const prompt = buildPromptWithAttachments('Review these files', attachments);
    expect(prompt).toContain('Attached files:');
    expect(prompt).toContain('Image guidance: Image is attached as a file for vision-capable models.');
    expect(prompt).toContain('Extracted content:');
    expect(prompt).toContain('Extracted summary');
  });

  it('classifies common file types correctly', () => {
    const imageFile = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const textFile = new File(['x'], 'readme.md', { type: 'text/markdown' });
    const pdfFile = new File(['x'], 'spec.pdf', { type: 'application/pdf' });
    const otherFile = new File(['x'], 'archive.bin', { type: 'application/octet-stream' });

    expect(getAttachmentType(imageFile)).toBe('image');
    expect(getAttachmentType(textFile)).toBe('text');
    expect(getAttachmentType(pdfFile)).toBe('document');
    expect(getAttachmentType(otherFile)).toBe('other');
  });

  it('resolves attachment path through preload API when available', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const getPathForFile = vi.fn().mockReturnValue('C:\\temp\\notes.txt');
    vi.stubGlobal('window', {
      accomplish: { getPathForFile },
    });

    try {
      expect(getAttachmentPath(file)).toBe('C:\\temp\\notes.txt');
      expect(getPathForFile).toHaveBeenCalledWith(file);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to file name when no path information is available', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    vi.stubGlobal('window', {});
    try {
      expect(getAttachmentPath(file)).toBe('notes.txt');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
