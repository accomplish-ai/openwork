/**
 * Custom postinstall script that rebuilds native modules for Electron.
 *
 * On Windows, we install Electron-compatible prebuilt binaries for better-sqlite3.
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
  // On Windows, we need to install Electron-compatible prebuilt binaries for better-sqlite3
  console.log('\n> Windows: Installing Electron-compatible better-sqlite3 prebuild...');

  // Get the Electron version from package.json
  const packageJson = require('../package.json');
  const electronVersion = packageJson.devDependencies?.electron?.replace('^', '') || '35.0.0';
  console.log(`> Electron version: ${electronVersion}`);

  // Find better-sqlite3 in pnpm store and install Electron prebuild
  const betterSqlite3Path = findBetterSqlite3();
  if (betterSqlite3Path) {
    console.log(`> Found better-sqlite3 at: ${betterSqlite3Path}`);
    try {
      // Remove existing build to force prebuild-install to run
      const buildPath = path.join(betterSqlite3Path, 'build');
      if (fs.existsSync(buildPath)) {
        fs.rmSync(buildPath, { recursive: true, force: true });
      }

      // Use prebuild-install to get Electron-compatible binary
      execSync(`npx prebuild-install --runtime electron --target ${electronVersion}`, {
        stdio: 'inherit',
        cwd: betterSqlite3Path,
        shell: true
      });
      console.log('> better-sqlite3 Electron prebuild installed successfully');
    } catch (error) {
      console.error('> Failed to install better-sqlite3 prebuild:', error.message);
      console.error('> The app may not work correctly in packaged mode.');
      // Don't exit - the app might still work in development
    }
  } else {
    console.warn('> Warning: better-sqlite3 not found, skipping prebuild installation');
  }
} else {
  // On macOS/Linux, run electron-rebuild normally
  runCommand('npx electron-rebuild', 'Running electron-rebuild');
}

// Skills are now part of the pnpm workspace, so no need to install separately
// They are handled by the main pnpm install command

console.log('\n> Postinstall complete!');

function findBetterSqlite3() {
  return findPackage('better-sqlite3');
}

function findPackage(packageName) {
  // Try to find package in node_modules (may be a symlink in pnpm)
  const directPath = path.join(__dirname, '..', 'node_modules', packageName);
  if (fs.existsSync(directPath)) {
    // Resolve symlink to get actual path
    const realPath = fs.realpathSync(directPath);
    return realPath;
  }

  // Look in pnpm's .pnpm directory
  const pnpmPath = path.join(__dirname, '..', '..', '..', 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmPath)) {
    const entries = fs.readdirSync(pnpmPath);
    for (const entry of entries) {
      if (entry.startsWith(`${packageName}@`)) {
        const packageDir = path.join(pnpmPath, entry, 'node_modules', packageName);
        if (fs.existsSync(packageDir)) {
          return packageDir;
        }
      }
    }
  }

  return null;
}
