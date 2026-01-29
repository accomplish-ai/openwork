// FileType defined locally until added to @accomplish/shared
type FileType = 'pdf' | 'image' | 'csv' | 'code' | 'text' | 'other';

const FILE_TYPE_MAP: Record<string, FileType> = {
  // Documents
  pdf: 'pdf',
  doc: 'text',
  docx: 'text',
  txt: 'text',
  md: 'text',
  rtf: 'text',

  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',

  // Data
  csv: 'csv',
  xlsx: 'csv',
  xls: 'csv',
  json: 'csv',

  // Code
  js: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  html: 'code',
  css: 'code',
  sql: 'code',
  sh: 'code',
  yaml: 'code',
  yml: 'code',
};

export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_TYPE_MAP[ext] || 'other';
}

export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function formatFilesForPrompt(files: { path: string }[]): string {
  if (files.length === 0) return '';

  const fileList = files.map((f) => `- ${f.path}`).join('\n');
  return `[Attached files]\n${fileList}\n\n`;
}
