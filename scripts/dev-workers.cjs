const { spawn, execSync } = require('child_process');
const path = require('path');

/** @type {readonly ["lite", "enterprise"]} */
const VALID_TIERS = /** @type {const} */ (['lite', 'enterprise']);
/** @typedef {typeof VALID_TIERS[number]} Tier */

/** @type {string | undefined} */
const tierArg = process.argv[2];

if (!tierArg || !VALID_TIERS.includes(/** @type {Tier} */ (tierArg))) {
  console.error(`Usage: dev-workers.cjs <${VALID_TIERS.join('|')}>`);
  process.exit(1);
}

/** @type {Tier} */
const tier = /** @type {Tier} */ (tierArg);

// Kill any existing process on port 8787
try {
  execSync('lsof -ti:8787 | xargs kill -9', { stdio: 'ignore' });
  console.log('Killed existing process on port 8787');
} catch {
  // No process on port 8787, that's fine
}

const env = {
  ...process.env,
  ACCOMPLISH_ROUTER_URL: `http://localhost:8787?type=${tier}`,
};

// Start workers (build + seed + wrangler dev)
const workers = spawn('bash', ['infra/dev.sh', tier], {
  stdio: 'inherit',
  env,
  detached: true,
});

// Wait for workers to be ready, then spawn Electron
const waitOn = require(path.join(__dirname, '..', 'node_modules', 'wait-on'));
let electron;

waitOn({ resources: ['http://localhost:8787/health'], timeout: 120000 })
  .then(() => {
    console.log(`[dev:workers:${tier}] Workers ready, launching Electron...`);
    electron = spawn('pnpm', ['-F', '@accomplish/desktop', 'dev:remote'], {
      stdio: 'inherit',
      env,
      detached: true,
    });
    electron.on('exit', cleanup);
  })
  .catch((err) => {
    console.error('Failed waiting for workers:', err.message);
    cleanup();
  });

function cleanup() {
  for (const child of [workers, electron]) {
    if (!child || child.killed) continue;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
  }
  // Kill anything left on 8787
  try {
    execSync('lsof -ti:8787 | xargs kill -9', { stdio: 'ignore' });
  } catch {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
