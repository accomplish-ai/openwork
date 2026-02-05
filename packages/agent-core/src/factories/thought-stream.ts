/**
 * Factory function for creating ThoughtStreamHandler instances
 */

import { ThoughtStreamHandler } from '../internal/classes/ThoughtStreamHandler.js';
import type {
  ThoughtStreamAPI,
  ThoughtStreamOptions,
} from '../types/thought-stream.js';

/**
 * Create a new thought stream handler instance
 * @param options - Optional configuration (currently unused, for future extensibility)
 * @returns ThoughtStreamAPI instance
 */
export function createThoughtStreamHandler(
  options?: ThoughtStreamOptions
): ThoughtStreamAPI {
  // options currently unused but accepted for API consistency
  void options;
  const handler = new ThoughtStreamHandler();
  return handler;
}
