import type { FileAttachmentInfo } from '@accomplish_ai/agent-core/common';

export const MAX_FILES = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function getFileType(name: string): FileAttachmentInfo['type'] {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return 'image';
  }
  if (
    ['txt', 'md', 'csv', 'log', 'xml', 'html', 'yml', 'yaml', 'toml', 'ini', 'cfg'].includes(ext)
  ) {
    return 'text';
  }
  if (
    [
      'js',
      'jsx',
      'ts',
      'tsx',
      'py',
      'rb',
      'go',
      'rs',
      'java',
      'c',
      'cpp',
      'h',
      'hpp',
      'cs',
      'swift',
      'kt',
      'sh',
      'bash',
      'zsh',
      'json',
      'css',
      'scss',
      'less',
      'sql',
      'r',
      'lua',
      'php',
      'pl',
      'ex',
      'exs',
      'hs',
      'ml',
      'scala',
      'clj',
    ].includes(ext)
  ) {
    return 'code';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  return 'other';
}

export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
