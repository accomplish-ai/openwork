const { spawn, execFileSync } = require('child_process');
const path = require('path');

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const isWindows = process.platform === 'win32';
const env = { ...process.env };
const isClean = process.argv.includes('--clean') || process.env.CLEAN_START === '1';

let web;
let electron;
let cleaningUp = false;

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function spawnPnpm(args, options) {
  if (isWindows) {
    const command = `& pnpm ${args.map(quoteForPowerShell).join(' ')}`;
    return spawn(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      options,
    );
  }
  return spawn('pnpm', args, options);
}

function getPidsListeningOnPort(port) {
  try {
    if (isWindows) {
      const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      const pids = new Set();
      for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('TCP')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 5) continue;
        const localAddress = parts[1];
        const state = parts[3];
        const pid = parts[4];
        if (state === 'LISTENING' && localAddress.endsWith(`:${port}`)) {
          pids.add(pid);
        }
      }
      return [...pids];
    }

    const output = execFileSync('lsof', [`-ti:${port}`], { encoding: 'utf8' });
    return output
      .split(/\r?\n/)
      .map((pid) => pid.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    process.kill(Number(pid), 'SIGKILL');
  } catch {}
}

function killProcessesOnPort(port) {
  const pids = getPidsListeningOnPort(port);
  for (const pid of pids) {
    killPid(pid);
  }
  return pids.length;
}

function terminateChild(child) {
  if (!child || !child.pid || child.killed) return;
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    }
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
}

function cleanup(codeOrError) {
  if (cleaningUp) return;
  cleaningUp = true;

  terminateChild(web);
  terminateChild(electron);
  killProcessesOnPort(DEV_SERVER_PORT);

  const isError =
    codeOrError instanceof Error ||
    (codeOrError && typeof codeOrError === 'object') ||
    (typeof codeOrError === 'number' && codeOrError !== 0);
  process.exit(isError ? 1 : 0);
}

const killed = killProcessesOnPort(DEV_SERVER_PORT);
if (killed > 0) {
  console.log(`Killed ${killed} existing process(es) on port ${DEV_SERVER_PORT}`);
}

web = spawnPnpm(['-F', '@accomplish/web', 'dev'], {
  stdio: 'inherit',
  env,
  detached: !isWindows,
});

const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));

waitOn({ resources: [DEV_SERVER_URL], timeout: 30000 })
  .then(() => {
    const electronCmd = isClean ? 'dev:clean' : 'dev';
    electron = spawnPnpm(['-F', '@accomplish/desktop', electronCmd], {
      stdio: 'inherit',
      env,
      detached: !isWindows,
    });
    electron.on('exit', cleanup);
    electron.on('error', cleanup);
  })
  .catch((err) => {
    console.error('Failed waiting for web dev server:', err.message);
    cleanup(err);
  });

web.on('error', cleanup);

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
