/**
 * Public API interface for SkillsManager
 * Manages skill discovery, loading, and lifecycle.
 */

import type { Skill } from '../common/types/skills';

/** Options for creating a SkillsManager instance */
export interface SkillsManagerOptions {
  /** Path to bundled/official skills directory */
  bundledSkillsPath: string;
  /** Path to user-installed skills directory */
  userSkillsPath: string;
  /** Database instance for persistence (opaque type) */
  database: unknown;
}

/** Public API for skills management operations */
export interface SkillsManagerAPI {
  /**
   * Initialize the skills manager
   * Loads skills from bundled and user directories
   */
  initialize(): Promise<void>;

  /**
   * Resync skills from the filesystem
   * @returns Array of all discovered skills
   */
  resync(): Promise<Skill[]>;

  /**
   * Get all registered skills
   * @returns Array of all skills (enabled and disabled)
   */
  getAllSkills(): Skill[];

  /**
   * Get only enabled skills
   * @returns Array of enabled skills
   */
  getEnabledSkills(): Skill[];

  /**
   * Get a specific skill by ID
   * @param skillId - ID of the skill to retrieve
   * @returns Skill or null if not found
   */
  getSkillById(skillId: string): Skill | null;

  /**
   * Enable or disable a skill
   * @param skillId - ID of the skill to update
   * @param enabled - Whether the skill should be enabled
   */
  setSkillEnabled(skillId: string, enabled: boolean): void;

  /**
   * Get the content/body of a skill file
   * @param skillId - ID of the skill
   * @returns Skill content or null if not found
   */
  getSkillContent(skillId: string): string | null;

  /**
   * Add a new skill from a source path or URL
   * @param sourcePath - Local path or GitHub URL
   * @returns Added skill or null if failed
   */
  addSkill(sourcePath: string): Promise<Skill | null>;

  /**
   * Delete a skill
   * @param skillId - ID of the skill to delete
   * @returns true if skill was deleted
   */
  deleteSkill(skillId: string): boolean;
}
