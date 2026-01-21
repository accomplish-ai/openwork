/**
 * Custom postinstall script that handles Windows-specific node-pty build issues.
 *
 * On Windows, we skip electron-rebuild because:
 * 1. node-pty has prebuilt binaries that work with Electron's ABI
 * 2. Building from source has issues with batch file path handling and Spectre mitigation
 * 3. The pnpm patch creates paths that exceed Windows' 260 character limit
 *
 * On macOS/Linux, we run electron-rebuild normally.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const isWindows = process.platform === 'win32';

function runCommand(command, description) {
  console.log(`\n> ${description}...`);
  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      shell: true
    });
  } catch (error) {
    console.error(`Failed: ${description}`);
    process.exit(1);
  }
}

if (isWindows) {
  // On Windows, skip electron-rebuild and use prebuilt binaries
  console.log('\n> Skipping electron-rebuild on Windows (using prebuilt binaries)');

  // Verify node-pty prebuilds exist
  const pnpmNodePty = findNodePty();
  if (pnpmNodePty) {
    const prebuildsPath = path.join(pnpmNodePty, 'prebuilds', 'win32-x64');
    if (fs.existsSync(prebuildsPath)) {
      console.log('> node-pty prebuilds found, setup complete');
    } else {
      console.warn('> Warning: node-pty prebuilds not found at', prebuildsPath);
    }
  }
} else {
  // On macOS/Linux, run electron-rebuild first (matches original behavior)
  runCommand('npx electron-rebuild', 'Running electron-rebuild');
}

// Install skill dependencies (works on all platforms)
const skills = ['dev-browser', 'dev-browser-mcp', 'file-permission', 'ask-user-question', 'complete-task'];
for (const skill of skills) {
  runCommand(`npm --prefix skills/${skill} install`, `Installing ${skill} dependencies`);
}

console.log('\n> Postinstall complete!');

function findNodePty() {
  // Try to find node-pty in node_modules
  const directPath = path.join(__dirname, '..', 'node_modules', 'node-pty');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // Look in pnpm's .pnpm directory
  const pnpmPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmPath)) {
    const entries = fs.readdirSync(pnpmPath);
    for (const entry of entries) {
      if (entry.startsWith('node-pty@')) {
        const nodePtyDir = path.join(pnpmPath, entry, 'node_modules', 'node-pty');
        if (fs.existsSync(nodePtyDir)) {
          return nodePtyDir;
        }
      }
    }
  }

  return null;
}
