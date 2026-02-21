const { spawn, execSync } = require('child_process');
const path = require('path');
const treeKill = require('tree-kill');

const isWin = process.platform === 'win32';
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm';

try {
  if (isWin) {
    execSync(
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %a`,
      { stdio: 'ignore', shell: true },
    );
  } else {
    execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
  }
  console.log('Killed existing process on port 5173');
} catch {
  // No process on port 5173
}

const env = { ...process.env };
const isClean = process.env.CLEAN_START === '1';

const web = spawn(pnpmCmd, ['-F', '@accomplish/web', 'dev'], {
  stdio: 'inherit',
  env,
  detached: !isWin,
  shell: isWin,
});

const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));
let electron;

waitOn({ resources: ['http://localhost:5173'], timeout: 30000 })
  .then(() => {
    const electronCmd = isClean ? 'dev:clean' : 'dev';
    electron = spawn(pnpmCmd, ['-F', '@accomplish/desktop', electronCmd], {
      stdio: 'inherit',
      env,
      detached: !isWin,
      shell: isWin,
    });
    electron.on('exit', (code, signal) =>
      cleanup(signal ? new Error(`Electron exited with ${signal}`) : code),
    );
  })
  .catch((err) => {
    console.error('Failed waiting for web dev server:', err.message);
    cleanup(err);
  });

function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return Promise.resolve();
  if (!isWin) {
    try {
      process.kill(-pid, signal);
    } catch {}
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    treeKill(pid, signal, () => resolve());
  });
}

function killPort5173() {
  return new Promise((resolve) => {
    try {
      if (isWin) {
        execSync(
          `for /f "tokens=5" %a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %a`,
          { stdio: 'ignore', shell: true },
        );
      } else {
        execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
      }
    } catch {}
    resolve();
  });
}

let cleaningUp = false;
async function cleanup(codeOrError) {
  if (cleaningUp) return;
  cleaningUp = true;
  await Promise.all(
    [web, electron]
      .filter((c) => c && !c.killed && c.pid)
      .map((c) => killTree(c.pid, 'SIGTERM')),
  );
  await killPort5173();
  const isError = codeOrError instanceof Error || (typeof codeOrError === 'number' && codeOrError !== 0) || (codeOrError && typeof codeOrError === 'object');
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
