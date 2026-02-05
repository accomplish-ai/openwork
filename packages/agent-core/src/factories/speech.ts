/**
 * Factory function for creating SpeechService instances
 */

import { SpeechService } from '../internal/classes/SpeechService.js';
import type {
  SpeechServiceAPI,
  SpeechServiceOptions,
} from '../types/speech.js';

/**
 * Create a new speech service instance
 * @param options - Configuration including secure storage for API key management
 * @returns SpeechServiceAPI instance
 */
export function createSpeechService(options: SpeechServiceOptions): SpeechServiceAPI {
  const service = new SpeechService(options.storage as any); // Type assertion since storage is opaque
  return service;
}
