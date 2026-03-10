import fs from 'fs';
import path from 'path';
import { readFile } from 'fs/promises';
import type { TaskInputAttachment } from '@accomplish_ai/agent-core';

const TEXT_TYPES = new Set(['text', 'document']);
const ENCODING = 'utf-8';

function isTextOrCode(type: TaskInputAttachment['type']): boolean {
  return TEXT_TYPES.has(type);
}

function safeReadFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, ENCODING);
    return content;
  } catch {
    return null;
  }
}

async function extractPdfText(filePath: string): Promise<string | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = await readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Composes the final prompt by appending content from text/code attachments
 * and adding path references for images and other files.
 * PDF is treated as path-only for now (no extraction).
 */
export function composePromptWithAttachments(
  prompt: string,
  attachments: TaskInputAttachment[] | undefined,
): string {
  if (!attachments || attachments.length === 0) {
    return prompt;
  }

  const parts: string[] = [prompt.trim()];

  for (const att of attachments) {
    const ext = path.extname(att.name).toLowerCase();
    const isPdf = ext === '.pdf';

    if (isTextOrCode(att.type) && !isPdf) {
      const content = safeReadFile(att.path);
      if (content !== null) {
        parts.push(`\n\n--- Contents of ${att.name} ---\n${content}\n--- End ${att.name} ---`);
      } else {
        parts.push(`\n\n[User attached file (could not read): ${att.path}]`);
      }
    } else if (att.type === 'image') {
      parts.push(`\n\n[User attached image: ${att.path}]`);
    } else {
      parts.push(`\n\n[The user attached exactly this file. Use this path: ${att.path}]`);
    }
  }

  return parts.join('');
}

/**
 * Async version that extracts PDF text and inlines it so the agent can analyze
 * PDF content. Falls back to path-only if extraction fails.
 */
const ATTACHMENTS_PREAMBLE =
  'The user has already attached the file(s) below. Use the content or path provided; do not ask the user for a file path or URL.\n\n';

export async function composePromptWithAttachmentsAsync(
  prompt: string,
  attachments: TaskInputAttachment[] | undefined,
): Promise<string> {
  if (!attachments || attachments.length === 0) {
    return prompt;
  }

  const parts: string[] = [ATTACHMENTS_PREAMBLE, prompt.trim()];

  for (const att of attachments) {
    const ext = path.extname(att.name).toLowerCase();
    const isPdf = ext === '.pdf';

    if (isTextOrCode(att.type) && !isPdf) {
      const content = safeReadFile(att.path);
      if (content !== null) {
        parts.push(`\n\n--- Contents of ${att.name} ---\n${content}\n--- End ${att.name} ---`);
      } else {
        parts.push(`\n\n[User attached file (could not read): ${att.path}]`);
      }
    } else if (isPdf) {
      const text = await extractPdfText(att.path);
      if (text) {
        parts.push(
          `\n\n--- Contents of ${att.name} (extracted text) ---\n${text}\n--- End ${att.name} ---`,
        );
      } else {
        parts.push(`\n\n[The user attached exactly this file. Use this path: ${att.path}]`);
      }
    } else if (att.type === 'image') {
      parts.push(`\n\n[User attached image: ${att.path}]`);
    } else {
      parts.push(`\n\n[The user attached exactly this file. Use this path: ${att.path}]`);
    }
  }

  return parts.join('');
}
