// apps/desktop/scripts/test-skills-manager.ts
// Run with: npx tsx apps/desktop/scripts/test-skills-manager.ts

import path from 'path';
import fs from 'fs';
import os from 'os';
import matter from 'gray-matter';

// ============ MOCK ELECTRON APP ============
const TEST_DIR = path.join(os.tmpdir(), 'skills-test-' + Date.now());
const BUNDLED_SKILLS_PATH = path.join(TEST_DIR, 'bundled-skills');
const USER_SKILLS_PATH = path.join(TEST_DIR, 'user-skills');

// Create test directories
fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(BUNDLED_SKILLS_PATH, { recursive: true });
fs.mkdirSync(USER_SKILLS_PATH, { recursive: true });

console.log('Test directory:', TEST_DIR);

// ============ CREATE TEST SKILLS ============
function createTestSkill(dir: string, name: string, frontmatter: Record<string, unknown>, content: string) {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const skillContent = `---
${Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join('\n')}
---

${content}`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
  console.log(`Created test skill: ${name}`);
}

// Create bundled skills
createTestSkill(BUNDLED_SKILLS_PATH, 'test-browser', {
  name: 'test-browser',
  description: 'Test browser automation skill',
  verified: true,
}, '# Test Browser\n\nThis is a test browser skill.');

createTestSkill(BUNDLED_SKILLS_PATH, 'test-file-ops', {
  name: 'test-file-ops',
  description: 'Test file operations skill',
}, '# Test File Ops\n\nThis is a test file operations skill.');

// ============ IN-MEMORY DATABASE MOCK ============
// This simulates the SQLite database behavior without requiring native modules
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

// In-memory store simulating the database
const skillsStore: Map<string, Skill> = new Map();

console.log('In-memory database initialized');

// ============ SIMPLIFIED SKILLS MANAGER ============
function getAllSkills(): Skill[] {
  return Array.from(skillsStore.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function getEnabledSkills(): Skill[] {
  return getAllSkills().filter(s => s.isEnabled);
}

function upsertSkill(skill: Skill): void {
  skillsStore.set(skill.id, { ...skill });
}

function setSkillEnabled(id: string, enabled: boolean): void {
  const skill = skillsStore.get(id);
  if (skill) {
    skill.isEnabled = enabled;
  }
}

function deleteSkillFromDb(id: string): void {
  skillsStore.delete(id);
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

// ============ SQL GENERATION TEST ============
// Test that the SQL statements we would generate are correct
function generateCreateTableSQL(): string {
  return `
  CREATE TABLE skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    description TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('official', 'community', 'custom')),
    is_enabled INTEGER NOT NULL DEFAULT 1,
    is_verified INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    github_url TEXT,
    updated_at TEXT NOT NULL
  )`;
}

function generateUpsertSQL(skill: Skill): { sql: string; params: unknown[] } {
  return {
    sql: `
    INSERT INTO skills (id, name, command, description, source, is_enabled, is_verified, file_path, github_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      command = excluded.command,
      description = excluded.description,
      is_enabled = excluded.is_enabled,
      is_verified = excluded.is_verified,
      file_path = excluded.file_path,
      github_url = excluded.github_url,
      updated_at = excluded.updated_at
    `,
    params: [
      skill.id,
      skill.name,
      skill.command,
      skill.description,
      skill.source,
      skill.isEnabled ? 1 : 0,
      skill.isVerified ? 1 : 0,
      skill.filePath,
      skill.githubUrl || null,
      skill.updatedAt
    ]
  };
}

// ============ TESTS ============
console.log('\n========== RUNNING TESTS ==========\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  try {
    if (fn()) {
      console.log(`PASS: ${name}`);
      passed++;
    } else {
      console.log(`FAIL: ${name}`);
      failed++;
    }
  } catch (err) {
    console.log(`FAIL: ${name}: ${err}`);
    failed++;
  }
}

// Test 1
test('Scan bundled skills directory', () => {
  const bundledSkills = scanDirectory(BUNDLED_SKILLS_PATH, 'official');
  return bundledSkills.length === 2;
});

// Test 2
test('Insert skills to database', () => {
  const bundledSkills = scanDirectory(BUNDLED_SKILLS_PATH, 'official');
  for (const skill of bundledSkills) {
    upsertSkill(skill);
  }
  return getAllSkills().length === 2;
});

// Test 3
test('Toggle skill enabled state', () => {
  const allSkills = getAllSkills();
  setSkillEnabled(allSkills[0].id, false);
  return getEnabledSkills().length === 1;
});

// Test 4
test('Re-enable skill', () => {
  const allSkills = getAllSkills();
  setSkillEnabled(allSkills[0].id, true);
  return getEnabledSkills().length === 2;
});

// Test 5
test('Add custom skill from file', () => {
  createTestSkill(USER_SKILLS_PATH, 'my-custom-skill', {
    name: 'my-custom-skill',
    description: 'A custom test skill',
  }, '# My Custom Skill');

  const userSkills = scanDirectory(USER_SKILLS_PATH, 'custom');
  for (const skill of userSkills) {
    upsertSkill(skill);
  }
  return getAllSkills().length === 3;
});

// Test 6
test('Delete custom skill', () => {
  const customSkill = getAllSkills().find(s => s.source === 'custom');
  if (customSkill) {
    deleteSkillFromDb(customSkill.id);
    fs.rmSync(path.dirname(customSkill.filePath), { recursive: true });
  }
  return getAllSkills().length === 2;
});

// Test 7
test('Official skills marked correctly', () => {
  const officialSkill = getAllSkills().find(s => s.source === 'official');
  return officialSkill !== undefined && officialSkill.source === 'official';
});

// Test 8
test('Build system prompt section', () => {
  const enabled = getEnabledSkills();
  let skillsSection = '';
  if (enabled.length > 0) {
    skillsSection = `<available-skills>\n${enabled.map(s => `- ${s.name}`).join('\n')}\n</available-skills>`;
  }
  return skillsSection.includes('test-browser');
});

// Test 9
test('Frontmatter parsing', () => {
  const testContent = `---
name: test-skill
description: A test description
command: /test
verified: true
---
# Test Content`;
  const parsed = parseFrontmatter(testContent);
  return parsed.name === 'test-skill' && parsed.verified === true;
});

// Test 10: SQL generation tests
test('SQL CREATE TABLE statement is valid', () => {
  const sql = generateCreateTableSQL();
  return sql.includes('CREATE TABLE skills') &&
         sql.includes('id TEXT PRIMARY KEY') &&
         sql.includes('source TEXT NOT NULL CHECK');
});

// Test 11
test('SQL UPSERT statement generates correct params', () => {
  const testSkill: Skill = {
    id: 'test-id',
    name: 'Test Skill',
    command: '/test',
    description: 'A test',
    source: 'official',
    isEnabled: true,
    isVerified: true,
    filePath: '/path/to/skill',
    updatedAt: '2024-01-01T00:00:00Z'
  };
  const { sql, params } = generateUpsertSQL(testSkill);
  return sql.includes('INSERT INTO skills') &&
         sql.includes('ON CONFLICT(id) DO UPDATE') &&
         params.length === 10 &&
         params[0] === 'test-id' &&
         params[5] === 1 && // isEnabled as 1
         params[6] === 1;   // isVerified as 1
});

// Test 12: Verified skill detection
test('Verified skill is correctly parsed', () => {
  const bundledSkills = scanDirectory(BUNDLED_SKILLS_PATH, 'official');
  const browserSkill = bundledSkills.find(s => s.name === 'test-browser');
  return browserSkill !== undefined && browserSkill.isVerified === true;
});

// Test 13: Non-verified skill detection
test('Non-verified skill defaults to false', () => {
  const bundledSkills = scanDirectory(BUNDLED_SKILLS_PATH, 'official');
  const fileOpsSkill = bundledSkills.find(s => s.name === 'test-file-ops');
  return fileOpsSkill !== undefined && fileOpsSkill.isVerified === false;
});

// Test 14: ID generation
test('ID generation creates safe identifiers', () => {
  const id1 = generateId('My Cool Skill!', 'official');
  const id2 = generateId('test-browser', 'custom');
  return id1 === 'official-my-cool-skill-' && id2 === 'custom-test-browser';
});

// Test 15: Command defaults to slash + name
test('Command defaults to slash prefix', () => {
  const bundledSkills = scanDirectory(BUNDLED_SKILLS_PATH, 'official');
  const browserSkill = bundledSkills.find(s => s.name === 'test-browser');
  return browserSkill !== undefined && browserSkill.command === '/test-browser';
});

// Cleanup
console.log('\n========== CLEANUP ==========');
fs.rmSync(TEST_DIR, { recursive: true });
console.log('Test directory cleaned up');

console.log(`\n========== RESULTS: ${passed} passed, ${failed} failed ==========\n`);
process.exit(failed > 0 ? 1 : 0);
