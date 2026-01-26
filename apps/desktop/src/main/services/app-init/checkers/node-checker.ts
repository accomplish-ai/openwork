import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import type { ComponentHealth, InitError } from '@accomplish/shared';
import { getBundledNodePaths } from '../../../utils/bundled-node';

const execFileAsync = promisify(execFile);

export interface NodeCheckResult {
  status: 'healthy' | 'failed';
  version: string | null;
  error: InitError | null;
}

export async function checkBundledNode(): Promise<NodeCheckResult> {
  const paths = getBundledNodePaths();

  // In development, always healthy (using system node)
  if (!paths) {
    return { status: 'healthy', version: process.version, error: null };
  }

  // Check if node binary exists
  if (!fs.existsSync(paths.nodePath)) {
    return {
      status: 'failed',
      version: null,
      error: {
        code: 'BUNDLED_NODE_NOT_FOUND',
        component: 'bundled-node',
        message: 'Bundled Node.js binary not found',
        guidance: 'The app installation may be corrupted. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: paths.nodePath,
          actualPath: null,
          env: { resourcesPath: process.resourcesPath },
        },
      },
    };
  }

  // Try to run node --version
  try {
    const { stdout } = await execFileAsync(paths.nodePath, ['--version'], {
      timeout: 5000,
    });
    const version = stdout.trim();
    return { status: 'healthy', version, error: null };
  } catch (err) {
    const error = err as Error & { code?: number; stderr?: string };
    return {
      status: 'failed',
      version: null,
      error: {
        code: 'BUNDLED_NODE_FAILED',
        component: 'bundled-node',
        message: 'Bundled Node.js failed to run',
        guidance: 'The bundled Node.js binary may be corrupted. Try reinstalling the app.',
        debugInfo: {
          platform: `${process.platform}-${process.arch}`,
          expectedPath: paths.nodePath,
          actualPath: paths.nodePath,
          stderr: error.stderr || error.message,
          exitCode: typeof error.code === 'number' ? error.code : null,
          env: {
            resourcesPath: process.resourcesPath,
            PATH: process.env.PATH || '',
          },
        },
      },
    };
  }
}

export function toComponentHealth(result: NodeCheckResult): ComponentHealth {
  return {
    name: 'bundled-node',
    displayName: 'Bundled Node.js',
    status: result.status,
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
