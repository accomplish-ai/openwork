#!/usr/bin/env node
/**
 * Cross-platform Vite starter for desktop app
 * Sets ACCOMPLISH_ROUTER_URL environment variable and starts Vite
 */

const { spawn } = require('child_process');
const path = require('path');

// Set the environment variable for all platforms
process.env.ACCOMPLISH_ROUTER_URL = 'http://localhost:5173';

// Ensure System32 is in PATH on Windows so vite-plugin-electron can use taskkill
if (process.platform === 'win32') {
  const sys32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  if (!process.env.PATH?.includes(sys32)) {
    process.env.PATH = `${sys32};${process.env.PATH}`;
  }
}

console.log('[dev-vite] Starting Vite with ACCOMPLISH_ROUTER_URL=http://localhost:5173');

// Spawn vite process from the correct directory
const desktopDir = path.resolve(__dirname, '..');
const vite = spawn('vite', [], {
  stdio: 'inherit',
  shell: true,
  cwd: desktopDir,
  env: process.env,
});

vite.on('error', (err) => {
  console.error('[dev-vite] Failed to start Vite:', err);
  process.exit(1);
});

vite.on('exit', (code) => {
  process.exit(code || 0);
});
