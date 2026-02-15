#!/usr/bin/env node

/**
 * Windows Code Signing Script for electron-builder
 *
 * Uses DigiCert KeyLocker (cloud HSM) with smctl CLI for signing.
 * Supports two authentication modes:
 *
 * 1. Dynamic Auth (local builds): Uses DigiCert Trust Assistant running on the machine.
 *    Requires: smctl installed and DigiCert Trust Assistant configured.
 *
 * 2. Environment Variables (CI builds): Uses certificate-based authentication.
 *    Requires: SM_HOST, SM_API_KEY, SM_CLIENT_CERT_FILE, SM_CLIENT_CERT_PASSWORD, SM_KEYPAIR_ALIAS
 *
 * Dual-signing behavior:
 * electron-builder calls this hook twice for dual-hash signing (SHA1 + SHA256).
 * The first call has isNest=false (primary signature), the second has isNest=true
 * (appended signature). Since smctl's --simple mode doesn't support appending
 * signatures (like signtool's /as flag), we only sign once with the primary hash.
 * SHA256-only signatures are sufficient for Windows 8.1+ and updated Win7/8 systems.
 *
 * The smctl tool must be installed (DigiCert One Signing Manager Tools).
 */

const { execSync, spawnSync } = require('child_process');
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
  // Use cached result if available (checked once per build)
  if (dynamicAuthAvailable !== null) {
    return dynamicAuthAvailable;
  }

  try {
    // Try to list keypairs with dynamic auth - if it works, we can use it
    const result = spawnSync(smctl, ['keypair', 'list', '--dynamic-auth'], {
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 15000,
    });
    dynamicAuthAvailable = result.status === 0;
    if (dynamicAuthAvailable) {
      console.log('[sign-win] DigiCert Trust Assistant detected - using dynamic auth');
    }
    return dynamicAuthAvailable;
  } catch {
    dynamicAuthAvailable = false;
    return false;
  }
}

/**
 * Sign a Windows executable using DigiCert KeyLocker
 * @param {object} configuration - electron-builder sign configuration
 * @param {string} configuration.path - Path to the file to sign
 * @param {string} [configuration.hash] - Hash algorithm (sha1, sha256, etc.)
 * @param {boolean} [configuration.isNest] - Whether this is an appended/nested signature
 */
exports.default = async function sign(configuration) {
  const filePath = configuration.path;
  const hash = configuration.hash || 'sha256';
  const isNest = configuration.isNest || false;

  console.log(`[sign-win] Signing: ${filePath} (hash: ${hash}, isNest: ${isNest})`);

  // Skip nested/appended signatures - smctl --simple mode doesn't support appending
  // signatures like signtool's /as flag. The primary SHA256 signature is sufficient
  // for Windows 8.1+ and updated Windows 7/8 systems.
  if (isNest) {
    return;
  }

  const smctl = findSmctl();
  if (!smctl) {
    console.log('[sign-win] smctl not found - skipping signing');
    return;
  }

  // Determine authentication mode
  const useEnvVars = hasEnvVarsForCI();
  const useDynamicAuth = !useEnvVars && canUseDynamicAuth(smctl);

  if (!useEnvVars && !useDynamicAuth) {
    console.log('[sign-win] Skipping signing - no CI env vars and dynamic auth unavailable');
    return;
  }

  const keypairAlias = process.env.SM_KEYPAIR_ALIAS || DEFAULT_KEYPAIR_ALIAS;

  // Always use SHA256 for the primary signature (modern Windows standard)
  // electron-builder passes SHA1 first, but SHA256 is preferred for security
  const digalg = 'SHA256';

  try {
    // Use --simple mode which doesn't require signtool in PATH
    const args = [
      'sign',
      '--keypair-alias', keypairAlias,
      '--input', filePath,
      '--simple',
      '--digalg', digalg,
    ];

    // Add dynamic-auth flag for local builds using DigiCert Trust Assistant
    if (useDynamicAuth) {
      args.push('--dynamic-auth');
    }

    const authMode = useEnvVars ? 'CI' : 'dynamic-auth';
    console.log(`[sign-win] Running (${authMode}): smctl ${args.join(' ')}`);

    const result = spawnSync(smctl, args, {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: process.env,
    });

    if (result.status !== 0) {
      console.error('[sign-win] Signing failed:', result.stderr || result.stdout);
      throw new Error(`Signing failed with exit code ${result.status}`);
    }

    console.log(`[sign-win] Successfully signed: ${path.basename(filePath)} (${digalg})`);
  } catch (error) {
    console.error('[sign-win] Signing error:', error.message);
    throw error;
  }
};
