import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import type { TaskInputAttachment } from '@accomplish_ai/agent-core/common';

export type FileAttachmentType = 'image' | 'text' | 'document' | 'other';

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  type: FileAttachmentType;
  preview?: string;
  size: number;
}

export const MAX_ATTACHMENTS_PER_TASK = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const PREVIEW_MAX_CHARS = 1600;
const PROMPT_CONTENT_MAX_CHARS_PER_FILE = 12000;
const MIN_EXTRACTED_PDF_CHARS = 24;
const PDF_PREVIEW_MAX_PAGES = 5;

type PdfJsModule = typeof import('pdfjs-dist');
let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
let pdfWorkerUrlPromise: Promise<string> | null = null;

async function getPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('pdfjs-dist');
  }
  const pdfJs = await pdfJsModulePromise;

  if (!pdfJs.GlobalWorkerOptions.workerSrc) {
    if (!pdfWorkerUrlPromise) {
      pdfWorkerUrlPromise = import('pdfjs-dist/build/pdf.worker.mjs?url')
        .then((module) => module.default);
    }
    pdfJs.GlobalWorkerOptions.workerSrc = await pdfWorkerUrlPromise;
  }

  return pdfJs;
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
]);

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.yml',
  '.yaml',
  '.sh',
  '.sql',
]);

function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0) {
    return '';
  }
  return fileName.slice(dotIndex).toLowerCase();
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n[Truncated to fit limits]`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not create image preview'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

async function readTextPreview(file: File, maxChars: number): Promise<string | undefined> {
  try {
    const text = (await file.text()).replace(/\r\n/g, '\n').trim();
    if (!text) {
      return undefined;
    }
    return truncateText(text, maxChars);
  } catch {
    return undefined;
  }
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isReadableExtractedText(value: string): boolean {
  if (!value) {
    return false;
  }

  const sample = value.slice(0, 1200);
  const alnumChars = (sample.match(/[A-Za-z0-9]/g) ?? []).length;
  const replacementChars = (sample.match(/\uFFFD/g) ?? []).length;
  const alnumRatio = alnumChars / sample.length;
  const replacementRatio = replacementChars / sample.length;
  return alnumRatio >= 0.18 && replacementRatio <= 0.05;
}

async function extractPdfPreview(file: File, maxChars: number): Promise<string | undefined> {
  let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
  try {
    const pdfJs = await getPdfJsModule();
    const buffer = await file.arrayBuffer();
    loadingTask = pdfJs.getDocument({
      data: new Uint8Array(buffer),
      stopAtErrors: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;

    const chunks: string[] = [];
    let capturedChars = 0;
    const maxPages = Math.min(pdf.numPages, PDF_PREVIEW_MAX_PAGES);

    for (let pageNumber = 1; pageNumber <= maxPages && capturedChars < maxChars * 2; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      if (!pageText) {
        continue;
      }

      chunks.push(pageText);
      capturedChars += pageText.length;
    }

    await pdf.destroy();

    const joined = normalizePdfText(chunks.join('\n'));
    if (joined.length < MIN_EXTRACTED_PDF_CHARS || !isReadableExtractedText(joined)) {
      return undefined;
    }

    return truncateText(joined, maxChars);
  } catch {
    return undefined;
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // no-op: cleanup best effort
      }
    }
  }
}

function getPathFromAccomplishApi(file: File): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const resolvedPath = window.accomplish?.getPathForFile?.(file);
  if (typeof resolvedPath === 'string' && resolvedPath.trim()) {
    return resolvedPath;
  }

  return undefined;
}

export function getAttachmentPath(file: File): string {
  const path = (file as File & { path?: string }).path;
  if (typeof path === 'string' && path.trim()) {
    return path;
  }
  const resolvedPath = getPathFromAccomplishApi(file);
  if (resolvedPath) {
    return resolvedPath;
  }
  return file.name;
}

export function getAttachmentType(file: File): FileAttachmentType {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();

  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType.includes('javascript') ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return 'text';
  }

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return 'document';
  }

  return 'other';
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function getAttachmentTypeLabel(type: FileAttachmentType): string {
  switch (type) {
    case 'image':
      return 'Image';
    case 'text':
      return 'Text/Code';
    case 'document':
      return 'Document';
    default:
      return 'File';
  }
}

export async function createFileAttachment(file: File): Promise<FileAttachment> {
  const type = getAttachmentType(file);
  let preview: string | undefined;

  if (type === 'image') {
    try {
      preview = await readFileAsDataUrl(file);
    } catch {
      preview = undefined;
    }
  } else if (type === 'text') {
    preview = await readTextPreview(file, PREVIEW_MAX_CHARS);
  } else if (type === 'document') {
    preview = await extractPdfPreview(file, PREVIEW_MAX_CHARS);
  }

  return {
    id: createAttachmentId(),
    name: file.name,
    path: getAttachmentPath(file),
    type,
    preview,
    size: file.size,
  };
}

export function toAttachmentKey(path: string, size: number): string {
  return `${path}::${size}`;
}

export function toTaskConfigAttachment(attachment: FileAttachment): TaskInputAttachment {
  if (attachment.type === 'text' || attachment.type === 'document') {
    return {
      name: attachment.name,
      path: attachment.path,
      type: attachment.type,
      size: attachment.size,
      preview: attachment.preview,
    };
  }

  return {
    name: attachment.name,
    path: attachment.path,
    type: attachment.type,
    size: attachment.size,
  };
}

export function toTaskConfigAttachments(
  attachments: FileAttachment[]
): TaskInputAttachment[] {
  return attachments.map(toTaskConfigAttachment);
}

function buildAttachmentBlock(
  attachment: FileAttachment,
  index: number,
  maxContentChars: number
): string {
  const lines = [
    `[Attachment ${index}]`,
    `Name: ${attachment.name}`,
    `Type: ${getAttachmentTypeLabel(attachment.type)}`,
    `Path: ${attachment.path}`,
    `Size: ${formatAttachmentSize(attachment.size)}`,
  ];

  if ((attachment.type === 'text' || attachment.type === 'document') && maxContentChars > 0) {
    if (attachment.preview) {
      const content = truncateText(attachment.preview, maxContentChars);
      lines.push('Extracted content:');
      lines.push('<file_content>');
      lines.push(content);
      lines.push('</file_content>');
    } else if (attachment.type === 'document') {
      lines.push('Extracted content: [No text extracted from PDF, use the path above]');
    } else {
      lines.push('Extracted content: [Could not read text, use the path above]');
    }
  } else if (attachment.type === 'image') {
    lines.push('Image guidance: Image is attached as a file for vision-capable models.');
    lines.push('Use the file path above for file-based tools and references.');
  } else if (attachment.type === 'other') {
    lines.push('File guidance: Use the file path above for processing.');
  }

  return lines.join('\n');
}

export function buildPromptWithAttachments(
  prompt: string,
  attachments: FileAttachment[]
): string {
  const basePrompt = prompt.trim();
  if (attachments.length === 0) {
    return basePrompt;
  }

  const header = `${basePrompt}\n\nAttached files:\n`;
  let result = header;
  let remaining = PROMPT_DEFAULT_MAX_LENGTH - header.length;
  let droppedEntries = 0;

  for (let i = 0; i < attachments.length; i += 1) {
    if (remaining <= 0) {
      droppedEntries += 1;
      continue;
    }

    const attachment = attachments[i];
    const contentBudget = Math.max(
      0,
      Math.min(PROMPT_CONTENT_MAX_CHARS_PER_FILE, remaining - 300)
    );

    let block = buildAttachmentBlock(attachment, i + 1, contentBudget);
    if (block.length > remaining) {
      block = buildAttachmentBlock(attachment, i + 1, 0);
    }

    if (block.length > remaining) {
      droppedEntries += 1;
      continue;
    }

    result += `${block}\n\n`;
    remaining -= block.length + 2;
  }

  if (droppedEntries > 0 && remaining > 80) {
    result += `[${droppedEntries} attachment(s) omitted due prompt length limits]`;
  }

  return result.trim();
}
