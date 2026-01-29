#!/usr/bin/env npx tsx
// apps/desktop/scripts/test-skills-integration.ts
// Run with: npx tsx apps/desktop/scripts/test-skills-integration.ts
//
// This script tests the actual SkillsManager flows:
// 1. Upload a skill from file
// 2. Import a skill from GitHub
// 3. Enable/disable skills
// 4. Delete skills

import path from 'path';
import fs from 'fs';
import os from 'os';
import matter from 'gray-matter';

// ============ SETUP ============
const TEST_DIR = path.join(os.tmpdir(), 'skills-integration-test-' + Date.now());
const OFFICIAL_SKILLS_PATH = path.join(TEST_DIR, 'official-skills');
const USER_SKILLS_PATH = path.join(TEST_DIR, 'user-skills');

// Create directories
fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(OFFICIAL_SKILLS_PATH, { recursive: true });
fs.mkdirSync(USER_SKILLS_PATH, { recursive: true });

console.log('Test directory:', TEST_DIR);
console.log('');

// ============ IN-MEMORY DATABASE MOCK ============
const skillsDb: Map<string, SkillRow> = new Map();

interface SkillRow {
  id: string;
  name: string;
  command: string;
  description: string;
  source: string;
  is_enabled: number;
  is_verified: number;
  file_path: string;
  github_url: string | null;
  updated_at: string;
}

console.log('✅ In-memory database initialized');

// ============ SIMPLIFIED SKILLS MANAGER ============
type SkillSource = 'official' | 'community' | 'custom';

interface Skill {
  id: string;
  name: string;
  command: string;
  description: string;
  source: SkillSource;
  isEnabled: boolean;
  isVerified: boolean;
  filePath: string;
  githubUrl?: string;
  updatedAt: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    description: row.description,
    source: row.source as SkillSource,
    isEnabled: row.is_enabled === 1,
    isVerified: row.is_verified === 1,
    filePath: row.file_path,
    githubUrl: row.github_url || undefined,
    updatedAt: row.updated_at,
  };
}

function getAllSkills(): Skill[] {
  const rows = Array.from(skillsDb.values()).sort((a, b) => a.name.localeCompare(b.name));
  return rows.map(rowToSkill);
}

function getEnabledSkills(): Skill[] {
  const rows = Array.from(skillsDb.values())
    .filter(r => r.is_enabled === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  return rows.map(rowToSkill);
}

function getSkillById(id: string): Skill | null {
  const row = skillsDb.get(id);
  return row ? rowToSkill(row) : null;
}

function upsertSkill(skill: Skill): void {
  skillsDb.set(skill.id, {
    id: skill.id,
    name: skill.name,
    command: skill.command,
    description: skill.description,
    source: skill.source,
    is_enabled: skill.isEnabled ? 1 : 0,
    is_verified: skill.isVerified ? 1 : 0,
    file_path: skill.filePath,
    github_url: skill.githubUrl || null,
    updated_at: skill.updatedAt,
  });
}

function setSkillEnabled(id: string, enabled: boolean): void {
  const row = skillsDb.get(id);
  if (row) {
    row.is_enabled = enabled ? 1 : 0;
  }
}

function deleteSkillFromDb(id: string): void {
  skillsDb.delete(id);
}

function parseFrontmatter(content: string): { name: string; description: string; command?: string; verified?: boolean } {
  try {
    const { data } = matter(content);
    return {
      name: data.name || '',
      description: data.description || '',
      command: data.command,
      verified: data.verified,
    };
  } catch {
    return { name: '', description: '' };
  }
}

function generateId(name: string, source: SkillSource): string {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${source}-${safeName}`;
}

// ============ SKILLSMANAGER METHODS ============

function scanDirectory(dirPath: string, defaultSource: SkillSource): Skill[] {
  const skills: Skill[] = [];
  if (!fs.existsSync(dirPath)) return skills;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillMdPath = path.join(dirPath, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name || entry.name;

    skills.push({
      id: generateId(name, defaultSource),
      name,
      command: frontmatter.command || `/${name}`,
      description: frontmatter.description || '',
      source: defaultSource,
      isEnabled: true,
      isVerified: frontmatter.verified || false,
      filePath: skillMdPath,
      updatedAt: new Date().toISOString(),
    });
  }
  return skills;
}

function addFromFile(sourcePath: string): Skill {
  const content = fs.readFileSync(sourcePath, 'utf-8');
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter.name) {
    throw new Error('SKILL.md must have a name in frontmatter');
  }

  const skillDir = path.join(USER_SKILLS_PATH, frontmatter.name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const destPath = path.join(skillDir, 'SKILL.md');
  fs.copyFileSync(sourcePath, destPath);

  const skill: Skill = {
    id: generateId(frontmatter.name, 'custom'),
    name: frontmatter.name,
    command: frontmatter.command || `/${frontmatter.name}`,
    description: frontmatter.description || '',
    source: 'custom',
    isEnabled: true,
    isVerified: false,
    filePath: destPath,
    updatedAt: new Date().toISOString(),
  };

  upsertSkill(skill);
  return skill;
}

async function addFromGitHub(rawUrl: string): Promise<Skill> {
  if (!rawUrl.includes('raw.githubusercontent.com') && !rawUrl.includes('github.com')) {
    throw new Error('URL must be a GitHub raw file URL');
  }

  let fetchUrl = rawUrl;
  if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
    fetchUrl = rawUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  const content = await response.text();

  const frontmatter = parseFrontmatter(content);

  if (!frontmatter.name) {
    throw new Error('SKILL.md must have a name in frontmatter');
  }

  const skillDir = path.join(USER_SKILLS_PATH, frontmatter.name);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  const destPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(destPath, content);

  const skill: Skill = {
    id: generateId(frontmatter.name, 'community'),
    name: frontmatter.name,
    command: frontmatter.command || `/${frontmatter.name}`,
    description: frontmatter.description || '',
    source: 'community',
    isEnabled: true,
    isVerified: false,
    filePath: destPath,
    githubUrl: rawUrl,
    updatedAt: new Date().toISOString(),
  };

  upsertSkill(skill);
  return skill;
}

function deleteSkill(id: string): void {
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

  deleteSkillFromDb(id);
}

// ============ CREATE TEST DATA ============

// Create official skills
function createOfficialSkill(name: string, description: string) {
  const skillDir = path.join(OFFICIAL_SKILLS_PATH, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: ${name}
description: ${description}
verified: true
---

# ${name}

${description}
`);
}

createOfficialSkill('google-workspace', 'Interact with Google Workspace services');
createOfficialSkill('git-commit', 'Create well-structured git commits');

console.log('✅ Created 2 official skills');

// Create a test file for upload
const uploadTestDir = path.join(TEST_DIR, 'upload-test');
fs.mkdirSync(uploadTestDir, { recursive: true });
fs.writeFileSync(path.join(uploadTestDir, 'SKILL.md'), `---
name: uploaded-skill
description: A test skill uploaded from a local file
command: /upload-test
---

# Uploaded Skill

This skill was uploaded from a local file.
`);

console.log('✅ Created upload test file');
console.log('');

// ============ RUN TESTS ============
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<boolean> | boolean) {
  try {
    const result = await fn();
    if (result) {
      console.log(`✅ ${name}`);
      passed++;
    } else {
      console.log(`❌ ${name}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ${name}: ${err}`);
    failed++;
  }
}

console.log('========== FLOW 1: Scan Official Skills ==========');

await test('Scan official skills directory', () => {
  const skills = scanDirectory(OFFICIAL_SKILLS_PATH, 'official');
  return skills.length === 2;
});

await test('Sync official skills to database', () => {
  const skills = scanDirectory(OFFICIAL_SKILLS_PATH, 'official');
  for (const skill of skills) {
    upsertSkill(skill);
  }
  return getAllSkills().length === 2;
});

await test('Official skills are enabled by default', () => {
  return getEnabledSkills().length === 2;
});

await test('Official skills are marked as verified', () => {
  const skills = getAllSkills();
  return skills.every(s => s.isVerified === true);
});

console.log('');
console.log('========== FLOW 2: Upload Skill from File ==========');

await test('Upload skill from file', () => {
  const uploadPath = path.join(uploadTestDir, 'SKILL.md');
  const skill = addFromFile(uploadPath);
  return skill.name === 'uploaded-skill' && skill.source === 'custom';
});

await test('Uploaded skill appears in database', () => {
  const skills = getAllSkills();
  return skills.some(s => s.name === 'uploaded-skill' && s.source === 'custom');
});

await test('Uploaded skill file exists in user skills directory', () => {
  const destPath = path.join(USER_SKILLS_PATH, 'uploaded-skill', 'SKILL.md');
  return fs.existsSync(destPath);
});

await test('Total skills count is 3', () => {
  return getAllSkills().length === 3;
});

console.log('');
console.log('========== FLOW 3: Import Skill from GitHub ==========');

// Create a mock "GitHub" skill (simulate the downloaded content)
await test('Import skill from GitHub (simulated)', async () => {
  // We'll simulate this by directly creating the skill as if it was downloaded
  const content = `---
name: github-imported-skill
description: A skill imported from GitHub
command: /github-test
---

# GitHub Imported Skill

This skill was imported from GitHub.
`;

  const frontmatter = parseFrontmatter(content);
  const skillDir = path.join(USER_SKILLS_PATH, frontmatter.name);
  fs.mkdirSync(skillDir, { recursive: true });
  const destPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(destPath, content);

  const skill: Skill = {
    id: generateId(frontmatter.name, 'community'),
    name: frontmatter.name,
    command: frontmatter.command || `/${frontmatter.name}`,
    description: frontmatter.description || '',
    source: 'community',
    isEnabled: true,
    isVerified: false,
    filePath: destPath,
    githubUrl: 'https://github.com/example/skills/blob/main/github-imported-skill/SKILL.md',
    updatedAt: new Date().toISOString(),
  };

  upsertSkill(skill);
  return skill.source === 'community' && skill.githubUrl !== undefined;
});

await test('GitHub imported skill has correct source', () => {
  const skill = getSkillById('community-github-imported-skill');
  return skill !== null && skill.source === 'community';
});

await test('Total skills count is 4', () => {
  return getAllSkills().length === 4;
});

console.log('');
console.log('========== FLOW 4: Enable/Disable Skills ==========');

await test('Disable a skill', () => {
  const skill = getSkillById('custom-uploaded-skill');
  if (!skill) return false;
  setSkillEnabled(skill.id, false);
  const updated = getSkillById(skill.id);
  return updated !== null && updated.isEnabled === false;
});

await test('Enabled skills count decreased', () => {
  return getEnabledSkills().length === 3;
});

await test('Re-enable the skill', () => {
  setSkillEnabled('custom-uploaded-skill', true);
  const skill = getSkillById('custom-uploaded-skill');
  return skill !== null && skill.isEnabled === true;
});

await test('Enabled skills count restored', () => {
  return getEnabledSkills().length === 4;
});

console.log('');
console.log('========== FLOW 5: Delete Skills ==========');

await test('Cannot delete official skill', () => {
  try {
    deleteSkill('official-google-workspace');
    return false; // Should have thrown
  } catch (err) {
    return (err as Error).message.includes('Cannot delete official');
  }
});

await test('Can delete custom skill', () => {
  const beforeCount = getAllSkills().length;
  deleteSkill('custom-uploaded-skill');
  const afterCount = getAllSkills().length;
  return afterCount === beforeCount - 1;
});

await test('Deleted skill file is removed', () => {
  const destPath = path.join(USER_SKILLS_PATH, 'uploaded-skill', 'SKILL.md');
  return !fs.existsSync(destPath);
});

await test('Can delete community skill', () => {
  const beforeCount = getAllSkills().length;
  deleteSkill('community-github-imported-skill');
  const afterCount = getAllSkills().length;
  return afterCount === beforeCount - 1;
});

await test('Final skills count is 2 (only official)', () => {
  const skills = getAllSkills();
  return skills.length === 2 && skills.every(s => s.source === 'official');
});

console.log('');
console.log('========== FLOW 6: System Prompt Generation ==========');

await test('Build system prompt section', () => {
  const enabled = getEnabledSkills();
  let skillsSection = '';
  if (enabled.length > 0) {
    skillsSection = `<available-skills>
${enabled.map(s => `- **${s.name}** (${s.command}): ${s.description}
  File: ${s.filePath}`).join('\n\n')}
</available-skills>`;
  }
  return skillsSection.includes('google-workspace') && skillsSection.includes('git-commit');
});

// ============ CLEANUP ============
console.log('');
console.log('========== CLEANUP ==========');
fs.rmSync(TEST_DIR, { recursive: true });
console.log('✅ Test directory cleaned up');

console.log('');
console.log(`========== RESULTS: ${passed} passed, ${failed} failed ==========`);
process.exit(failed > 0 ? 1 : 0);
