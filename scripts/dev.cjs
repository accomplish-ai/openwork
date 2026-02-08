const { spawn, execSync } = require('child_process');
const path = require('path');

// Kill any existing process on port 5173
try {
  execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  console.log('Killed existing process on port 5173');
} catch {
  // No process on port 5173, that's fine
}

const env = { ...process.env };
const isClean = process.env.CLEAN_START === '1';

// Start web dev server — detached + process group for clean kills
const web = spawn('pnpm', ['-F', '@accomplish/web', 'dev'], {
  stdio: 'inherit',
  env,
  detached: true,
});

// Wait for port 5173 in-process, then spawn electron (no shell: true)
const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));
let electron;

waitOn({ resources: ['http://localhost:5173'], timeout: 30000 })
  .then(() => {
    const electronCmd = isClean ? 'dev:clean' : 'dev';
    electron = spawn('pnpm', ['-F', '@accomplish/electron', electronCmd], {
      stdio: 'inherit',
      env,
      detached: true,
    });
    electron.on('exit', cleanup);
  })
  .catch((err) => {
    console.error('Failed waiting for web dev server:', err.message);
    cleanup();
  });

function cleanup() {
  // Kill entire process groups (negative PID) to catch all grandchildren
  for (const child of [web, electron]) {
    if (!child || child.killed) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  // Also kill anything left on 5173
  try {
    execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  } catch {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
