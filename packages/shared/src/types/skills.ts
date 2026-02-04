// packages/shared/src/types/skills.ts

export type SkillSource = 'official' | 'community' | 'custom';

export interface Skill {
  id: string;
  name: string;
  command: string; // e.g., "/dev-browser"
  description: string;
  source: SkillSource;
  isEnabled: boolean;
  isVerified: boolean;
  isHidden: boolean; // Hidden skills are always enabled but not shown in UI
  filePath: string; // Absolute path to SKILL.md
  githubUrl?: string; // Original URL if imported from GitHub
  updatedAt: string; // ISO date string
}

export interface SkillsState {
  skills: Skill[];
  filter: 'all' | 'active' | 'official';
  searchQuery: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  command?: string;
  verified?: boolean;
  hidden?: boolean;
}
