import { spawn } from 'child_process';
import { resolveCliPath, type CliResolverConfig } from '@accomplish_ai/agent-core';
import { app } from 'electron';

const WARM_UP_TIMEOUT_MS = 15_000;
const TASK_START_WAIT_BUDGET_MS = 2_500;

let warmUpStarted = false;
let warmUpPromise: Promise<void> | null = null;

function getCliResolverConfig(): CliResolverConfig {
  return {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  };
}

export function warmUpCliExecutable(): void {
  if (process.platform !== 'win32') {
    warmUpPromise = Promise.resolve();
    return;
  }

  if (warmUpStarted) {
    return;
  }
  warmUpStarted = true;

  const resolved = resolveCliPath(getCliResolverConfig());
  if (!resolved) {
    console.log('[Warm-Up] CLI not found, skipping warm-up');
    warmUpPromise = Promise.resolve();
    return;
  }
  if (!resolved.cliPath.toLowerCase().endsWith('.exe')) {
    console.log('[Warm-Up] Resolved CLI path is not an .exe, skipping warm-up:', resolved.cliPath);
    warmUpPromise = Promise.resolve();
    return;
  }

  console.log('[Warm-Up] Pre-spawning CLI executable:', resolved.cliPath);
  const startTime = Date.now();

  warmUpPromise = new Promise<void>((resolve) => {
    try {
      const child = spawn(resolved.cliPath, ['--version'], {
        stdio: 'ignore',
        windowsHide: true,
      });

      let timeout: ReturnType<typeof setTimeout> | null = null;
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        if (timeout) {
          clearTimeout(timeout);
        }
        resolve();
      };

      timeout = setTimeout(() => {
        console.warn('[Warm-Up] Timed out after', WARM_UP_TIMEOUT_MS, 'ms');
        child.kill();
        finish();
      }, WARM_UP_TIMEOUT_MS);

      child.once('exit', () => {
        console.log('[Warm-Up] CLI warm-up complete in', Date.now() - startTime, 'ms');
        finish();
      });

      child.once('error', (err) => {
        console.warn('[Warm-Up] Failed to pre-spawn CLI:', err.message);
        finish();
      });
    } catch (err) {
      console.warn('[Warm-Up] Failed to initiate warm-up:', err);
      resolve();
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function awaitCliWarmUpForTaskStart(
  maxWaitMs: number = TASK_START_WAIT_BUDGET_MS,
): Promise<void> {
  if (!warmUpPromise) {
    return;
  }
  await Promise.race([warmUpPromise, delay(maxWaitMs)]);
}

export function getWarmUpPromise(): Promise<void> {
  return warmUpPromise ?? Promise.resolve();
}
