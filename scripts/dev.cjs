const { spawn, execSync } = require('child_process');
const path = require('path');
const pnpmCmd = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'pnpm.cmd')
  : 'pnpm';
const isWin = process.platform === 'win32';

function runPnpm(args, options = {}) {
  if (isWin) {
    
    return spawn('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
      stdio: 'inherit',
      env: options.env || process.env,
      windowsVerbatimArguments: true,
    });
  }

  return spawn('pnpm', args, {
    stdio: 'inherit',
    env: options.env || process.env,
  });
}

try {
  execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  console.log('Killed existing process on port 5173');
} catch {
  // No process on port 5173
}

const env = { ...process.env };
const isClean = process.env.CLEAN_START === '1';

const web = runPnpm(['-F', '@accomplish/web', 'dev'], { env });


const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));
let electron;

waitOn({ resources: ['http://localhost:5173'], timeout: 30000 })
  .then(() => {
    const electronCmd = isClean ? 'dev:clean' : 'dev';
    electron = runPnpm(['-F', '@accomplish/desktop', electronCmd], { env });
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
