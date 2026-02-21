import type { TaskFileAttachment } from '../common/types/task.js';

/**
 * Builds an enhanced prompt string by appending formatted attachment contents
 * and references to the base prompt.
 *
 * @param basePrompt - The original user prompt
 * @param attachments - The list of task file attachments
 * @returns The enhanced prompt string
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  attachments?: TaskFileAttachment[],
): string {
  if (!attachments || attachments.length === 0) {
    return basePrompt;
  }

  let finalPrompt = basePrompt;
  finalPrompt += '\n\n--- Attached Context ---\n';

  for (const file of attachments) {
    if (file.type === 'text' || file.type === 'code') {
      const language = file.name.split('.').pop() || 'text';
      finalPrompt += `\nFile: ${file.name}\n\`\`\`${language}\n${file.content || ''}\n\`\`\`\n`;
    } else {
      finalPrompt += `\nAttached File Path: ${file.path} (Please reference this file for context)\n`;
    }
  }

  return finalPrompt;
}
