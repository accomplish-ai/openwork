import { spawn } from 'child_process';
import { resolveCliPath, type CliResolverConfig } from '@accomplish_ai/agent-core';
import { app } from 'electron';

const WARM_UP_TIMEOUT_MS = 60_000;

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

  const resolved = resolveCliPath(getCliResolverConfig());
  if (!resolved) {
    console.log('[Warm-Up] CLI not found, skipping warm-up');
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

      const timeout = setTimeout(() => {
        console.warn('[Warm-Up] Timed out after', WARM_UP_TIMEOUT_MS, 'ms');
        child.kill();
        resolve();
      }, WARM_UP_TIMEOUT_MS);

      child.on('exit', () => {
        clearTimeout(timeout);
        console.log('[Warm-Up] CLI warm-up complete in', Date.now() - startTime, 'ms');
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('[Warm-Up] Failed to pre-spawn CLI:', err.message);
        resolve();
      });
    } catch (err) {
      console.warn('[Warm-Up] Failed to initiate warm-up:', err);
      resolve();
    }
  });
}

export function getWarmUpPromise(): Promise<void> {
  return warmUpPromise ?? Promise.resolve();
}
