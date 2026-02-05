/**
 * Factory function for creating PermissionHandler instances
 */

import { PermissionRequestHandler } from '../internal/classes/PermissionRequestHandler.js';
import type {
  PermissionHandlerAPI,
  PermissionHandlerOptions,
} from '../types/permission-handler.js';

/**
 * Create a new permission handler instance
 * @param options - Optional configuration for the handler
 * @returns PermissionHandlerAPI instance
 */
export function createPermissionHandler(
  options?: PermissionHandlerOptions
): PermissionHandlerAPI {
  const handler = new PermissionRequestHandler(options?.defaultTimeoutMs);
  return handler;
}
