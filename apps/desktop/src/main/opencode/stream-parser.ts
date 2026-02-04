import { EventEmitter } from 'events';
import type { OpenCodeMessage } from '@accomplish/shared';

export interface StreamParserEvents {
  message: [OpenCodeMessage];
  error: [Error];
}

// Maximum buffer size to prevent memory exhaustion (10MB)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Parses NDJSON (newline-delimited JSON) stream from OpenCode CLI
 *
 * Handles Windows PTY buffering issues where JSON objects may be fragmented
 * across multiple data chunks, or multiple JSON objects may arrive in a single chunk.
 * Uses brace counting to properly detect complete JSON objects.
 */
export class StreamParser extends EventEmitter<StreamParserEvents> {
  private buffer: string = '';

  /**
   * Feed raw data from stdout
   */
  feed(chunk: string): void {
    this.buffer += chunk;

    // Extract and parse complete JSON objects from buffer
    this.parseBuffer();

    // If buffer exceeds MAX_BUFFER_SIZE, it's a pathological case
    // (e.g., corrupted data). Discard to prevent memory exhaustion.
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.emit('error', new Error('Stream buffer size exceeded maximum limit'));
      this.buffer = '';
    }
  }

  /**
   * Extract complete JSON objects from the buffer using brace counting.
   * This handles cases where PTY delivers:
   * - Fragmented JSON (split across chunks)
   * - Multiple JSON objects in one chunk without newlines between them
   */
  private parseBuffer(): void {
    while (true) {
      // Find the start of a JSON object
      const startIdx = this.buffer.indexOf('{');
      if (startIdx === -1) {
        // No JSON object starts in buffer, discard non-JSON content
        this.buffer = '';
        return;
      }

      // Skip any non-JSON content before the first {
      if (startIdx > 0) {
        const skipped = this.buffer.substring(0, startIdx).trim();
        if (skipped) {
          console.log('[StreamParser] Skipping non-JSON content:', skipped.substring(0, 50));
        }
        this.buffer = this.buffer.substring(startIdx);
      }

      // Try to find a complete JSON object using brace counting
      const endIdx = this.findJsonEnd(this.buffer);
      if (endIdx === -1) {
        // Incomplete JSON, wait for more data
        return;
      }

      // Extract the complete JSON string
      const jsonStr = this.buffer.substring(0, endIdx + 1);
      this.buffer = this.buffer.substring(endIdx + 1);

      // Parse and emit the JSON
      this.parseJsonString(jsonStr);
    }
  }

  /**
   * Find the end of a JSON object using brace counting.
   * Returns the index of the closing brace, or -1 if incomplete.
   * Handles strings (including escaped quotes) properly.
   */
  private findJsonEnd(str: string): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1; // Incomplete
  }

  /**
   * Sanitize JSON string by removing control characters injected by Windows PTY.
   * Windows PTY wraps long lines by inserting raw CR/LF characters into the output,
   * which corrupts JSON when they appear inside string values.
   * Since we use brace counting for delimiting, we can safely remove these.
   */
  private sanitizeJson(str: string): string {
    // Remove carriage returns and newlines that PTY injects
    // These are invalid inside JSON strings (should be escaped as \r \n)
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\r\n]/g, '');
  }

  /**
   * Parse a JSON string and emit if valid
   */
  private parseJsonString(jsonStr: string): void {
    const trimmed = jsonStr.trim();
    if (!trimmed) return;

    // Sanitize to remove PTY-injected control characters
    const sanitized = this.sanitizeJson(trimmed);

    try {
      const message = JSON.parse(sanitized) as OpenCodeMessage;
      console.log('[StreamParser] Parsed message type:', message.type);
      this.emitMessage(message);
    } catch (e) {
      // Log parse errors for debugging
      console.log('[StreamParser] Failed to parse JSON:', sanitized.substring(0, 100), e);
    }
  }

  /**
   * Emit a parsed message with enhanced logging
   */
  private emitMessage(message: OpenCodeMessage): void {
    // Enhanced logging for MCP/Playwriter-related messages
    if (message.type === 'tool_call' || message.type === 'tool_result') {
      const part = message.part as Record<string, unknown>;
      console.log('[StreamParser] Tool message details:', {
        type: message.type,
        tool: part?.tool,
        hasInput: !!part?.input,
        hasOutput: !!part?.output,
      });

      // Check if it's a dev-browser tool
      const toolName = String(part?.tool || '').toLowerCase();
      const output = String(part?.output || '').toLowerCase();
      if (toolName.includes('dev-browser') ||
          toolName.includes('browser') ||
          toolName.includes('mcp') ||
          output.includes('dev-browser') ||
          output.includes('browser')) {
        console.log('[StreamParser] >>> DEV-BROWSER MESSAGE <<<');
        console.log('[StreamParser] Full message:', JSON.stringify(message, null, 2));
      }
    }

    this.emit('message', message);
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer.trim()) {
      // Try to parse any remaining content as JSON
      this.parseJsonString(this.buffer);
      this.buffer = '';
    }
  }

  /**
   * Reset the parser
   */
  reset(): void {
    this.buffer = '';
  }
}
