import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';

const WINDOWS_X64_PACKAGES = ['opencode-windows-x64', 'opencode-windows-x64-baseline'];
const WINDOWS_ARM64_PACKAGES = ['opencode-windows-arm64', ...WINDOWS_X64_PACKAGES];

function getRuntimePlatform(config: CliResolverConfig): NodeJS.Platform {
  return config.platform ?? process.platform;
}

function getRuntimeArch(config: CliResolverConfig): string {
  return config.arch ?? process.arch;
}

function getWindowsPackageCandidates(arch: string): string[] {
  if (arch === 'arm64') {
    return WINDOWS_ARM64_PACKAGES;
  }
  return WINDOWS_X64_PACKAGES;
}

function getWindowsNodeModulesExeCandidates(basePath: string, arch: string): string[] {
  const packageCandidates = getWindowsPackageCandidates(arch);
  const candidates: string[] = [];

  for (const packageName of packageCandidates) {
    candidates.push(path.join(basePath, 'node_modules', packageName, 'bin', 'opencode.exe'));
    candidates.push(
      path.join(
        basePath,
        'node_modules',
        'opencode-ai',
        'node_modules',
        packageName,
        'bin',
        'opencode.exe',
      ),
    );
  }

  return candidates;
}

function getPackagedCliCandidates(config: CliResolverConfig): string[] {
  const resourcesPath = config.resourcesPath;
  if (!resourcesPath) {
    return [];
  }

  const platform = getRuntimePlatform(config);
  if (platform === 'win32') {
    const arch = getRuntimeArch(config);
    return getWindowsPackageCandidates(arch).map((packageName) =>
      path.join(
        resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'bin',
        'opencode.exe',
      ),
    );
  }

  return [
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'opencode-ai', 'bin', 'opencode'),
  ];
}

function getUnixNodeModulesCliCandidates(basePath: string): string[] {
  return [
    path.join(basePath, 'node_modules', '.bin', 'opencode'),
    path.join(basePath, 'node_modules', 'opencode-ai', 'bin', 'opencode'),
  ];
}

function getFirstExistingPath(paths: string[]): string | null {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function logMissingWindowsArm64LocalBinaries(candidates: string[]): void {
  const printableCandidates = candidates.map((candidate) => `"${candidate}"`).join(', ');
  console.warn(
    '[CLI Resolver] Windows ARM64 detected but no local OpenCode binary was found.',
    'Expected one of:',
    printableCandidates,
  );
  console.warn(
    '[CLI Resolver] Native opencode-windows-arm64 is currently unavailable upstream;',
    'Windows ARM64 depends on local x64 OpenCode packages. Run "pnpm install".',
  );
}

export function resolveCliPath(config: CliResolverConfig): ResolvedCliPaths | null {
  const { isPackaged, appPath } = config;
  const platform = getRuntimePlatform(config);
  const arch = getRuntimeArch(config);

  if (isPackaged) {
    const packagedCliCandidates = getPackagedCliCandidates(config);
    const packagedCliPath = getFirstExistingPath(packagedCliCandidates);

    if (packagedCliPath) {
      return {
        cliPath: packagedCliPath,
        cliDir: path.dirname(packagedCliPath),
        source: 'bundled',
      };
    }

    if (platform === 'win32' && arch === 'arm64') {
      logMissingWindowsArm64LocalBinaries(packagedCliCandidates);
    }
    return null;
  }

  if (platform === 'win32') {
    const localExeCandidates = appPath ? getWindowsNodeModulesExeCandidates(appPath, arch) : [];
    const localExePath = getFirstExistingPath(localExeCandidates);

    if (localExePath) {
      console.log('[CLI Resolver] Using local OpenCode CLI executable:', localExePath);
      return {
        cliPath: localExePath,
        cliDir: path.dirname(localExePath),
        source: 'local',
      };
    }

    if (arch === 'arm64') {
      logMissingWindowsArm64LocalBinaries(localExeCandidates);
    }
    return null;
  }

  const localCliCandidates = appPath ? getUnixNodeModulesCliCandidates(appPath) : [];
  const localCliPath = getFirstExistingPath(localCliCandidates);

  if (localCliPath) {
    console.log('[CLI Resolver] Using local OpenCode CLI:', localCliPath);
    return {
      cliPath: localCliPath,
      cliDir: path.dirname(localCliPath),
      source: 'local',
    };
  }

  return null;
}

export function isCliAvailable(config: CliResolverConfig): boolean {
  return resolveCliPath(config) !== null;
}

export async function getCliVersion(cliPath: string): Promise<string | null> {
  try {
    if (cliPath.includes('node_modules')) {
      const packageJsonCandidates = [
        path.join(path.dirname(path.dirname(cliPath)), 'package.json'),
        path.join(path.dirname(path.dirname(cliPath)), 'opencode-ai', 'package.json'),
      ];
      for (const packageJsonPath of packageJsonCandidates) {
        if (fs.existsSync(packageJsonPath)) {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (typeof pkg.version === 'string') {
            return pkg.version;
          }
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
