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

function cleanup(codeOrError) {
  if (!electron.killed) {
    try {
      process.kill(-electron.pid, 'SIGTERM');
    } catch {}
  }
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
