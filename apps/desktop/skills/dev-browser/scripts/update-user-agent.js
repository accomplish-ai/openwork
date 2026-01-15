#!/usr/bin/env node
/**
 * Fetch the latest Chrome stable user agent and update index.ts
 * Run during CI builds to keep user agent current
 */

import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getLatestChromeUserAgent() {
  try {
    // Fetch Chrome stable version from Chrome for Testing API
    const response = await fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json');
    const data = await response.json();
    const version = data.channels.Stable.version;
    
    // Chrome version format: 131.0.6778.86
    const majorVersion = version.split('.')[0];
    
    // Build realistic user agent for macOS (most common dev platform)
    const userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
    
    console.log(`✓ Latest Chrome Stable: ${version}`);
    console.log(`✓ User Agent: ${userAgent}`);
    
    return { version, userAgent };
  } catch (error) {
    console.warn('⚠ Failed to fetch Chrome version, using fallback');
    console.warn(error.message);
    return null;
  }
}

async function updateIndexFile(userAgent) {
  const indexPath = join(__dirname, '../src/index.ts');
  let content = readFileSync(indexPath, 'utf8');
  
  // Replace the BROWSER_USER_AGENT constant
  const userAgentRegex = /const BROWSER_USER_AGENT = ".*";/;
  const replacement = `const BROWSER_USER_AGENT = "${userAgent}";`;
  
  if (!userAgentRegex.test(content)) {
    console.error('✗ Could not find BROWSER_USER_AGENT constant in index.ts');
    process.exit(1);
  }
  
  content = content.replace(userAgentRegex, replacement);
  writeFileSync(indexPath, content, 'utf8');
  
  console.log('✓ Updated apps/desktop/skills/dev-browser/src/index.ts');
}

async function main() {
  console.log('Fetching latest Chrome user agent...');
  
  const result = await getLatestChromeUserAgent();
  
  if (!result) {
    console.log('Skipping update (using existing user agent)');
    process.exit(0);
  }
  
  await updateIndexFile(result.userAgent);
  
  console.log('');
  console.log('User agent updated successfully!');
  console.log('Commit this change if running locally, or it will be included in the build.');
}

main().catch((error) => {
  console.error('✗ Error:', error.message);
  process.exit(1);
});
