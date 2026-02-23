import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';

function getOpenCodePlatformInfo(): { packageNames: string[]; binaryNames: string[] } {
  if (process.platform === 'win32') {
    return {
      // Prefer baseline first for maximum CPU compatibility.
      packageNames: ['opencode-windows-x64-baseline', 'opencode-windows-x64', 'opencode-ai'],
      // opencode-ai publishes a JS launcher at bin/opencode on Windows.
      binaryNames: ['opencode.exe', 'opencode'],
    };
  }
  return {
    packageNames: ['opencode-ai'],
    binaryNames: ['opencode'],
  };
}

const WINDOWS_NATIVE_PACKAGE_NAMES = ['opencode-windows-x64-baseline', 'opencode-windows-x64'];
const WINDOWS_NATIVE_BINARY_NAME = 'opencode.exe';

function findWindowsNativeCliInNodeModules(nodeModulesDir: string): string | null {
  for (const packageName of WINDOWS_NATIVE_PACKAGE_NAMES) {
    const cliPath = path.join(nodeModulesDir, packageName, 'bin', WINDOWS_NATIVE_BINARY_NAME);
    if (fs.existsSync(cliPath)) {
      return cliPath;
    }
  }
  return null;
}

function findWindowsNativeCliFromPnpmStore(root: string): string | null {
  const pnpmDir = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    for (const packageName of WINDOWS_NATIVE_PACKAGE_NAMES) {
      const packageEntries = entries.filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`),
      );
      for (const packageEntry of packageEntries) {
        const cliPath = path.join(
          pnpmDir,
          packageEntry.name,
          'node_modules',
          packageName,
          'bin',
          WINDOWS_NATIVE_BINARY_NAME,
        );
        if (fs.existsSync(cliPath)) {
          return cliPath;
        }
      }
    }
  } catch {
    // ignore pnpm store scanning failures and continue fallback resolution
  }

  return null;
}

function findWindowsNativeCliFromWrapper(wrapperPath: string): string | null {
  let current = path.dirname(wrapperPath);

  for (;;) {
    const nodeModulesDir = path.join(current, 'node_modules');
    const nativeCli = findWindowsNativeCliInNodeModules(nodeModulesDir);
    if (nativeCli) {
      return nativeCli;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
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
  const { packageNames, binaryNames } = getOpenCodePlatformInfo();

  for (const packageName of packageNames) {
    for (const binaryName of binaryNames) {
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
  }

  return null;
}

function resolveLocalCliPath(appPath?: string): ResolvedCliPaths | null {
  const appRoots = getCandidateAppRoots(appPath);
  const { packageNames, binaryNames } = getOpenCodePlatformInfo();

  for (const root of appRoots) {
    if (process.platform === 'win32') {
      // 1) Prefer direct native Windows binaries.
      const nativeFromNodeModules = findWindowsNativeCliInNodeModules(path.join(root, 'node_modules'));
      if (nativeFromNodeModules) {
        console.log('[CLI Resolver] Using local OpenCode CLI executable:', nativeFromNodeModules);
        return {
          cliPath: nativeFromNodeModules,
          cliDir: path.dirname(nativeFromNodeModules),
          source: 'local',
        };
      }

      // 2) Try pnpm store layout.
      const nativeFromPnpmStore = findWindowsNativeCliFromPnpmStore(root);
      if (nativeFromPnpmStore) {
        console.log('[CLI Resolver] Using local OpenCode CLI executable:', nativeFromPnpmStore);
        return {
          cliPath: nativeFromPnpmStore,
          cliDir: path.dirname(nativeFromPnpmStore),
          source: 'local',
        };
      }

      // 3) Wrapper fallback: resolve native binary from wrapper location if possible.
      for (const binaryName of binaryNames) {
        const wrapperPath = path.join(root, 'node_modules', 'opencode-ai', 'bin', binaryName);
        if (!fs.existsSync(wrapperPath)) {
          continue;
        }

        const nativeFromWrapper = findWindowsNativeCliFromWrapper(wrapperPath);
        if (nativeFromWrapper) {
          console.log('[CLI Resolver] Using local OpenCode CLI executable:', nativeFromWrapper);
          return {
            cliPath: nativeFromWrapper,
            cliDir: path.dirname(nativeFromWrapper),
            source: 'local',
          };
        }

        console.log('[CLI Resolver] Using local OpenCode CLI executable:', wrapperPath);
        return {
          cliPath: wrapperPath,
          cliDir: path.dirname(wrapperPath),
          source: 'local',
        };
      }
      continue;
    }

    const cliPath = path.join(root, 'node_modules', '.bin', binaryNames[0]);
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
