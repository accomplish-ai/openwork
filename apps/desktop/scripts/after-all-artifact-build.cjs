#!/usr/bin/env node

/**
 * afterAllArtifactBuild hook for electron-builder
 *
 * Signs the final NSIS installer on Windows after it's been created.
 * The win.sign hook only signs files during packaging, not the final installer.
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Default keypair alias if not specified in environment
const DEFAULT_KEYPAIR_ALIAS = 'key_1444659366';

// Cache for dynamic auth availability check
let dynamicAuthAvailable = null;

// Find smctl executable
function findSmctl() {
  const possiblePaths = [
    'C:\\Program Files\\DigiCert\\DigiCert One Signing Manager Tools\\smctl.exe',
    'C:\\Program Files (x86)\\DigiCert\\DigiCert One Signing Manager Tools\\smctl.exe',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try PATH
  try {
    execSync('smctl --version', { stdio: 'pipe' });
    return 'smctl';
  } catch {
    return null;
  }
}

// Check if all required environment variables are set for CI mode
function hasEnvVarsForCI() {
  const required = [
    'SM_HOST',
    'SM_API_KEY',
    'SM_CLIENT_CERT_FILE',
    'SM_CLIENT_CERT_PASSWORD',
    'SM_KEYPAIR_ALIAS',
  ];

  return required.every((v) => process.env[v]);
}

// Check if DigiCert Trust Assistant is available for dynamic auth
function canUseDynamicAuth(smctl) {
  if (dynamicAuthAvailable !== null) {
    return dynamicAuthAvailable;
  }

  try {
    const result = spawnSync(smctl, ['keypair', 'list', '--dynamic-auth'], {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 15000,
    });
    dynamicAuthAvailable = result.status === 0;
    return dynamicAuthAvailable;
  } catch {
    dynamicAuthAvailable = false;
    return false;
  }
}

// Sign a file using DigiCert KeyLocker
function signFile(filePath, smctl, useEnvVars, useDynamicAuth) {
  const keypairAlias = process.env.SM_KEYPAIR_ALIAS || DEFAULT_KEYPAIR_ALIAS;

  const args = [
    'sign',
    '--keypair-alias',
    keypairAlias,
    '--input',
    filePath,
    '--simple',
    '--digalg',
    'SHA256',
  ];

  if (useDynamicAuth) {
    args.push('--dynamic-auth');
  }

  const authMode = useEnvVars ? 'CI' : 'dynamic-auth';
  console.log(
    `[after-all-artifact-build] Signing installer (${authMode}): ${path.basename(filePath)}`,
  );

  const result = spawnSync(smctl, args, {
    stdio: 'pipe',
    encoding: 'utf-8',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('[after-all-artifact-build] Signing failed:', result.stderr || result.stdout);
    throw new Error(`Signing failed with exit code ${result.status}`);
  }

  console.log(`[after-all-artifact-build] Successfully signed: ${path.basename(filePath)}`);
}

/**
 * afterAllArtifactBuild hook
 * @param {object} context - electron-builder context
 * @param {string[]} context.artifactPaths - Paths to all built artifacts
 */
exports.default = async function afterAllArtifactBuild(context) {
  // Only sign on Windows
  if (process.platform !== 'win32') {
    return context.artifactPaths;
  }

  const smctl = findSmctl();
  if (!smctl) {
    if (process.env.CI)
      throw new Error('[after-all-artifact-build] smctl not found - required in CI');
    console.log('[after-all-artifact-build] smctl not found - skipping installer signing');
    return context.artifactPaths;
  }

  const useEnvVars = hasEnvVarsForCI();
  const useDynamicAuth = !useEnvVars && canUseDynamicAuth(smctl);

  if (!useEnvVars && !useDynamicAuth) {
    if (process.env.CI)
      throw new Error(
        '[after-all-artifact-build] No CI env vars and dynamic auth unavailable - required in CI',
      );
    console.log(
      '[after-all-artifact-build] Skipping signing - no CI env vars and dynamic auth unavailable',
    );
    return context.artifactPaths;
  }

  // Sign all .exe installers
  for (const artifactPath of context.artifactPaths) {
    if (artifactPath.endsWith('.exe')) {
      try {
        signFile(artifactPath, smctl, useEnvVars, useDynamicAuth);
      } catch (error) {
        console.error(`[after-all-artifact-build] Failed to sign ${artifactPath}:`, error.message);
        throw error;
      }
    }
  }

  return context.artifactPaths;
};
