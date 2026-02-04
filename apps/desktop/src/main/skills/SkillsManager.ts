// apps/desktop/src/main/skills/SkillsManager.ts

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import type { Skill, SkillSource, SkillFrontmatter } from '@accomplish/shared';
import {
  getAllSkills,
  getEnabledSkills,
  upsertSkill,
  setSkillEnabled as repoSetEnabled,
  deleteSkill as repoDeleteSkill,
  getSkillById,
} from '../store/repositories/skills';

export class SkillsManager {
  private initialized = false;

  /**
   * Get the bundled skills directory path.
   * These are user-facing skills bundled with the app.
   * In dev: apps/desktop/bundled-skills
   * In packaged: resources/bundled-skills
   */
  getBundledSkillsPath(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'bundled-skills');
    }
    return path.join(app.getAppPath(), 'bundled-skills');
  }

  getUserSkillsPath(): string {
    return path.join(app.getPath('userData'), 'skills');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[SkillsManager] Initializing...');

    const userSkillsPath = this.getUserSkillsPath();
    if (!fs.existsSync(userSkillsPath)) {
      fs.mkdirSync(userSkillsPath, { recursive: true });
    }

    await this.syncSkills();

    this.initialized = true;
    console.log('[SkillsManager] Initialized');
  }

  async resync(): Promise<void> {
    console.log('[SkillsManager] Resyncing skills...');
    await this.syncSkills();
  }

  private async syncSkills(): Promise<void> {
    const bundledPath = this.getBundledSkillsPath();
    const userPath = this.getUserSkillsPath();

    const existingSkills = getAllSkills();
    const existingById = new Map(existingSkills.map(s => [s.id, s]));
    const existingByPath = new Map(existingSkills.map(s => [s.filePath, s]));

    const bundledSkills = this.scanDirectory(bundledPath, 'official');
    const userSkills = this.scanDirectory(userPath, 'custom');

    const allFoundSkills = [...bundledSkills, ...userSkills];
    const processedPaths = new Set<string>();

    for (const skill of allFoundSkills) {
      // Skip if we've already processed this file path (prevents duplicates)
      if (processedPaths.has(skill.filePath)) {
        continue;
      }
      processedPaths.add(skill.filePath);

      // Check if skill already exists by file path
      const existingByFilePath = existingByPath.get(skill.filePath);
      if (existingByFilePath) {
        // Always preserve existing ID to prevent duplicates when name changes
        skill.id = existingByFilePath.id;
        skill.isEnabled = existingByFilePath.isEnabled;
        // Preserve GitHub-specific metadata if it was imported from GitHub
        if (existingByFilePath.githubUrl) {
          skill.source = existingByFilePath.source;
          skill.githubUrl = existingByFilePath.githubUrl;
        }
      } else {
        // Check by ID for backwards compatibility
        const existingById_ = existingById.get(skill.id);
        if (existingById_) {
          skill.isEnabled = existingById_.isEnabled;
        }
      }

      upsertSkill(skill);
    }

    // Remove stale DB entries for skills that no longer exist on disk
    for (const existingSkill of existingSkills) {
      if (!processedPaths.has(existingSkill.filePath)) {
        console.log(
          `[SkillsManager] Removing stale skill: ${existingSkill.name} (${existingSkill.filePath})`
        );
        repoDeleteSkill(existingSkill.id);
      }
    }

    console.log(`[SkillsManager] Synced ${allFoundSkills.length} skills`);
  }

  private scanDirectory(dirPath: string, defaultSource: SkillSource): Skill[] {
    const skills: Skill[] = [];

    if (!fs.existsSync(dirPath)) {
      return skills;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const frontmatter = this.parseFrontmatter(content);

        const name = frontmatter.name || entry.name;
        const source = defaultSource;
        const id = this.generateId(name, source);
        // Use sanitized name for default command to avoid spaces/special chars
        const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        skills.push({
          id,
          name,
          command: frontmatter.command || `/${safeName}`,
          description: frontmatter.description || '',
          source,
          isEnabled: true,
          isVerified: frontmatter.verified || false,
          isHidden: frontmatter.hidden || false,
          filePath: skillMdPath,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`[SkillsManager] Failed to parse ${skillMdPath}:`, err);
      }
    }

    return skills;
  }

  private parseFrontmatter(content: string): SkillFrontmatter {
    try {
      const { data } = matter(content);
      return {
        name: data.name || '',
        description: data.description || '',
        command: data.command,
        verified: data.verified,
        hidden: data.hidden,
      };
    } catch {
      return { name: '', description: '' };
    }
  }

  private generateId(name: string, source: SkillSource): string {
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${source}-${safeName}`;
  }

  /**
   * Sanitize a skill name to prevent path traversal attacks.
   * Removes dangerous characters and path components.
   */
  private sanitizeSkillName(name: string): string {
    return name
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/[\/\\]/g, '-') // Replace path separators with dashes
      .replace(/[^a-zA-Z0-9-_\s]/g, '-') // Only allow safe characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Collapse multiple dashes
      .replace(/^-|-$/g, '') // Trim leading/trailing dashes
      .trim();
  }

  /**
   * Verify that a path is within the expected directory.
   * Prevents path traversal attacks.
   */
  private isPathWithinDirectory(filePath: string, directory: string): boolean {
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(directory);
    return resolved.startsWith(resolvedDir + path.sep);
  }

  async getAll(): Promise<Skill[]> {
    return getAllSkills();
  }

  async getEnabled(): Promise<Skill[]> {
    return getEnabledSkills();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    repoSetEnabled(id, enabled);
  }

  async getContent(id: string): Promise<string | null> {
    const skill = getSkillById(id);
    if (!skill) return null;

    try {
      return fs.readFileSync(skill.filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  async addFromFile(sourcePath: string): Promise<Skill> {
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter.name) {
      throw new Error('SKILL.md must have a name in frontmatter');
    }

    // Sanitize skill name to prevent path traversal
    const safeName = this.sanitizeSkillName(frontmatter.name);
    if (!safeName) {
      throw new Error('Invalid skill name');
    }

    const userSkillsPath = this.getUserSkillsPath();
    const skillDir = path.join(userSkillsPath, safeName);

    // Verify the path stays within the skills directory
    if (!this.isPathWithinDirectory(skillDir, userSkillsPath)) {
      throw new Error('Invalid skill name: path traversal detected');
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const destPath = path.join(skillDir, 'SKILL.md');
    fs.copyFileSync(sourcePath, destPath);

    const skill: Skill = {
      id: this.generateId(safeName, 'custom'),
      name: frontmatter.name, // Keep original name for display
      command: frontmatter.command || `/${safeName}`,
      description: frontmatter.description || '',
      source: 'custom',
      isEnabled: true,
      isVerified: false,
      isHidden: false,
      filePath: destPath,
      updatedAt: new Date().toISOString(),
    };

    upsertSkill(skill);
    return skill;
  }

  async addFromGitHub(rawUrl: string): Promise<Skill> {
    // Validate URL with strict host allowlist to prevent SSRF attacks
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new Error('Invalid URL format');
    }

    const allowedHosts = ['github.com', 'raw.githubusercontent.com'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      throw new Error('URL must be from github.com or raw.githubusercontent.com');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new Error('URL must use HTTPS');
    }

    let fetchUrl = rawUrl;
    if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
      // Handle directory URLs (/tree/) - append SKILL.md
      if (rawUrl.includes('/tree/')) {
        fetchUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/tree/', '/');
        // If URL doesn't end with SKILL.md, append it
        if (!fetchUrl.endsWith('SKILL.md')) {
          fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
        }
      } else if (rawUrl.includes('/blob/')) {
        // Handle file URLs (/blob/)
        fetchUrl = rawUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      } else {
        // Try to construct a raw URL assuming it's a path
        fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com');
        if (!fetchUrl.endsWith('SKILL.md')) {
          fetchUrl = fetchUrl.replace(/\/?$/, '/SKILL.md');
        }
      }
    }

    console.log('[SkillsManager] Fetching from:', fetchUrl);

    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const content = await response.text();

    const frontmatter = this.parseFrontmatter(content);

    if (!frontmatter.name) {
      throw new Error('SKILL.md must have a name in frontmatter');
    }

    // Sanitize skill name to prevent path traversal
    const safeName = this.sanitizeSkillName(frontmatter.name);
    if (!safeName) {
      throw new Error('Invalid skill name');
    }

    const userSkillsPath = this.getUserSkillsPath();
    const skillDir = path.join(userSkillsPath, safeName);

    // Verify the path stays within the skills directory
    if (!this.isPathWithinDirectory(skillDir, userSkillsPath)) {
      throw new Error('Invalid skill name: path traversal detected');
    }

    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    const destPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(destPath, content);

    const skill: Skill = {
      id: this.generateId(safeName, 'community'),
      name: frontmatter.name, // Keep original name for display
      command: frontmatter.command || `/${safeName}`,
      description: frontmatter.description || '',
      source: 'community',
      isEnabled: true,
      isVerified: false,
      isHidden: false,
      filePath: destPath,
      githubUrl: rawUrl,
      updatedAt: new Date().toISOString(),
    };

    upsertSkill(skill);
    return skill;
  }

  async delete(id: string): Promise<void> {
    const skill = getSkillById(id);
    if (!skill) {
      throw new Error('Skill not found');
    }

    if (skill.source === 'official') {
      throw new Error('Cannot delete official skills');
    }

    const skillDir = path.dirname(skill.filePath);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true });
    }

    repoDeleteSkill(id);
  }
}

export const skillsManager = new SkillsManager();
