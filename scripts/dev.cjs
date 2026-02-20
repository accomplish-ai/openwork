const { spawn, execSync } = require('child_process');
const path = require('path');

try {
  execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  console.log('Killed existing process on port 5173');
} catch {
  // No process on port 5173
}

const env = { ...process.env };
const isClean = process.env.CLEAN_START === '1';

const web = spawn('pnpm', ['-F', '@accomplish/web', 'dev'], {
  stdio: 'inherit',
  env,
  detached: true,
});

const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));
let electron;

waitOn({ resources: ['http://localhost:5173'], timeout: 30000 })
  .then(() => {
    const electronCmd = isClean ? 'dev:clean' : 'dev';
    electron = spawn('pnpm', ['-F', '@accomplish/desktop', electronCmd], {
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

function cleanup(codeOrError) {
  for (const child of [web, electron]) {
    if (!child || child.killed) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  try {
    execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  } catch {}
  const isError = codeOrError instanceof Error || (codeOrError && typeof codeOrError === 'object');
  process.exit(isError ? 1 : 0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', (err) => {
  console.error(err);
  cleanup(err);
});
process.on('unhandledRejection', (err) => {
  console.error(err);
  cleanup(err);
});
