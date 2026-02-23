const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const desktopRoot = path.join(__dirname, '..');
const isClean = process.argv.includes('--clean');

function runStep(command, args) {
  const result = spawnSync(command, args, {
    cwd: desktopRoot,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function quoteForPowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPnpmStep(args) {
  if (isWindows) {
    const command = `& pnpm ${args.map(quoteForPowerShell).join(' ')}`;
    return runStep('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
  }
  return runStep('pnpm', args);
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

if (!isClean) {
  runStep(process.execPath, [path.join(__dirname, 'patch-electron-name.cjs')]);
  if (!isWindows) {
    runPnpmStep(['exec', 'electron-rebuild', '-f']);
  } else {
    console.log('[dev] Windows detected: skipping electron-rebuild and using prebuilt modules');
  }
  fs.rmSync(path.join(desktopRoot, 'dist-electron'), { recursive: true, force: true });
}

const env = {
  ...process.env,
  ACCOMPLISH_ROUTER_URL: process.env.ACCOMPLISH_ROUTER_URL || 'http://localhost:5173',
};

if (isClean) {
  env.CLEAN_START = '1';
}

const vite = spawnPnpm(['exec', 'vite'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env,
});

vite.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

vite.on('exit', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  if (!vite.killed) vite.kill('SIGINT');
});

process.on('SIGTERM', () => {
  if (!vite.killed) vite.kill('SIGTERM');
});
