// packages/shared/src/types/skills.ts

export type SkillSource = 'official' | 'community' | 'custom';

export interface Skill {
  id: string;
  name: string;
  command: string; // e.g., "/skill-creator"
  description: string;
  source: SkillSource;
  isEnabled: boolean;
  isVerified: boolean;
  updatedAt: string; // ISO date string
}

export interface SkillsState {
  skills: Skill[];
  filter: 'all' | 'active' | 'official';
  searchQuery: string;
}
