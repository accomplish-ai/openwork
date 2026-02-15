const { spawn } = require('child_process');

const url = process.argv[2];
if (!url) {
  console.error('Usage: pnpm dev:remote <url>');
  console.error(
    'Example: pnpm dev:remote https://accomplish-app-preview-42.accomplish.workers.dev',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  ACCOMPLISH_ROUTER_URL: url,
};

console.log('[dev:remote] Launching Electron → ' + url);

const electron = spawn('pnpm', ['-F', '@accomplish/desktop', 'dev:remote'], {
  stdio: 'inherit',
  env,
  detached: true,
});

electron.on('exit', () => process.exit());

function cleanup() {
  if (!electron.killed) {
    try {
      process.kill(-electron.pid, 'SIGTERM');
    } catch {}
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
