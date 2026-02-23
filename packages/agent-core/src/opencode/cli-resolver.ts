import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';

function getOpenCodePlatformInfo(): { packageNames: string[]; binaryName: string } {
  if (process.platform === 'win32') {
    return {
      packageNames: ['opencode-windows-x64', 'opencode-windows-x64-baseline'],
      binaryName: 'opencode.exe',
    };
  }
  return {
    packageNames: ['opencode-ai'],
    binaryName: 'opencode',
  };
}

function getCandidateAppRoots(appPath?: string): string[] {
  const roots: string[] = [];

  if (process.env.APP_ROOT) {
    roots.push(path.resolve(process.env.APP_ROOT));
  }

  if (appPath) {
    const resolvedAppPath = path.resolve(appPath);
    roots.push(resolvedAppPath);
    roots.push(path.resolve(resolvedAppPath, '..'));
    roots.push(path.resolve(resolvedAppPath, '..', '..'));
  }

  return [...new Set(roots)];
}

function resolveBundledCliPath(resourcesPath: string): ResolvedCliPaths | null {
  const { packageNames, binaryName } = getOpenCodePlatformInfo();

  for (const packageName of packageNames) {
    const cliPath = path.join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      packageName,
      'bin',
      binaryName,
    );

    if (fs.existsSync(cliPath)) {
      return {
        cliPath,
        cliDir: path.dirname(cliPath),
        source: 'bundled',
      };
    }
  }

  return null;
}

function resolveLocalCliPath(appPath?: string): ResolvedCliPaths | null {
  const appRoots = getCandidateAppRoots(appPath);
  const { packageNames, binaryName } = getOpenCodePlatformInfo();

  for (const root of appRoots) {
    if (process.platform === 'win32') {
      for (const packageName of packageNames) {
        const cliPath = path.join(root, 'node_modules', packageName, 'bin', binaryName);
        if (fs.existsSync(cliPath)) {
          console.log('[CLI Resolver] Using local OpenCode CLI executable:', cliPath);
          return {
            cliPath,
            cliDir: path.dirname(cliPath),
            source: 'local',
          };
        }
      }
      continue;
    }

    const cliPath = path.join(root, 'node_modules', '.bin', binaryName);
    if (fs.existsSync(cliPath)) {
      console.log('[CLI Resolver] Using local OpenCode CLI executable:', cliPath);
      return {
        cliPath,
        cliDir: path.dirname(cliPath),
        source: 'local',
      };
    }
  }

  return null;
}

export function resolveCliPath(config: CliResolverConfig): ResolvedCliPaths | null {
  const { isPackaged, resourcesPath, appPath } = config;

  if (isPackaged && resourcesPath) {
    return resolveBundledCliPath(resourcesPath);
  }

  if (isPackaged) {
    return null;
  }

  return resolveLocalCliPath(appPath);
}

export function isCliAvailable(config: CliResolverConfig): boolean {
  return resolveCliPath(config) !== null;
}

export async function getCliVersion(cliPath: string): Promise<string | null> {
  try {
    if (cliPath.includes('node_modules')) {
      const { packageNames } = getOpenCodePlatformInfo();
      const packageJsonCandidates = [
        ...packageNames.map((packageName) =>
          path.join(path.dirname(path.dirname(cliPath)), packageName, 'package.json'),
        ),
        path.join(path.dirname(path.dirname(cliPath)), 'package.json'),
      ];

      for (const packageJsonPath of packageJsonCandidates) {
        if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          return pkg.version;
        }
      }
    }

    const fullCommand = `"${cliPath}" --version`;

    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : output;
  } catch {
    return null;
  }
}
