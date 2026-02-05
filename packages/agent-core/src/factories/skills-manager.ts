/**
 * Factory function for creating SkillsManager instances
 */

import { SkillsManager } from '../internal/classes/SkillsManager.js';
import type {
  SkillsManagerAPI,
  SkillsManagerOptions,
} from '../types/skills-manager.js';

/**
 * Create a new skills manager instance
 * @param options - Configuration for the skills manager
 * @returns SkillsManagerAPI instance
 */
export function createSkillsManager(options: SkillsManagerOptions): SkillsManagerAPI {
  const manager = new SkillsManager({
    bundledSkillsPath: options.bundledSkillsPath,
    userSkillsPath: options.userSkillsPath,
    database: options.database as any, // Type assertion since database is opaque in public API
  });
  return manager;
}
