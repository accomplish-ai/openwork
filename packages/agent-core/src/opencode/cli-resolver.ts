import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import type { CliResolverConfig, ResolvedCliPaths } from '../types.js';

function getOpenCodePlatformInfo(): { packageName: string; binaryName: string } {
  if (process.platform === 'win32') {
    return {
      packageName: 'opencode-windows-x64',
      binaryName: 'opencode.exe',
    };
  }
  return {
    packageName: 'opencode-ai',
    binaryName: 'opencode',
  };
}

function getNvmOpenCodePaths(): string[] {
  const homeDir = process.env.HOME || '';
  const nvmVersionsDir = path.join(homeDir, '.nvm/versions/node');
  const paths: string[] = [];

  try {
    if (fs.existsSync(nvmVersionsDir)) {
      const versions = fs.readdirSync(nvmVersionsDir);
      for (const version of versions) {
        const opencodePath = path.join(nvmVersionsDir, version, 'bin', 'opencode');
        if (fs.existsSync(opencodePath)) {
          paths.push(opencodePath);
        }
      }
    }
  } catch {
    // intentionally empty
  }

  return paths;
}

function getWindowsNodeModulesExeCandidates(basePath: string): string[] {
  return [
    path.join(basePath, 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
    path.join(basePath, 'node_modules', 'opencode-windows-x64-baseline', 'bin', 'opencode.exe'),
  ];
}

function resolveOpenCodeExeOnPath(): string | null {
  try {
    const output = execSync('where opencode.exe', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const candidates = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // intentionally empty
  }
  return null;
}

function isOpenCodeOnPath(): boolean {
  try {
    const command = process.platform === 'win32' ? 'where opencode' : 'which opencode';
    execSync(command, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

export function resolveCliPath(config: CliResolverConfig): ResolvedCliPaths | null {
  const { isPackaged, resourcesPath, appPath } = config;

  if (isPackaged && resourcesPath) {
    const { packageName, binaryName } = getOpenCodePlatformInfo();

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

    return null;
  }

  const preferGlobal = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE === '1';

  if (process.platform === 'win32') {
    const localExeCandidates = appPath ? getWindowsNodeModulesExeCandidates(appPath) : [];

    if (!preferGlobal) {
      for (const exePath of localExeCandidates) {
        if (fs.existsSync(exePath)) {
          console.log('[CLI Resolver] Using local OpenCode CLI executable:', exePath);
          return {
            cliPath: exePath,
            cliDir: path.dirname(exePath),
            source: 'local',
          };
        }
      }
    }

    const globalExeCandidates = [
      path.join(
        process.env.APPDATA || '',
        'npm',
        'node_modules',
        'opencode-windows-x64',
        'bin',
        'opencode.exe',
      ),
      path.join(
        process.env.APPDATA || '',
        'npm',
        'node_modules',
        'opencode-windows-x64-baseline',
        'bin',
        'opencode.exe',
      ),
      path.join(
        process.env.LOCALAPPDATA || '',
        'npm',
        'node_modules',
        'opencode-windows-x64',
        'bin',
        'opencode.exe',
      ),
      path.join(
        process.env.LOCALAPPDATA || '',
        'npm',
        'node_modules',
        'opencode-windows-x64-baseline',
        'bin',
        'opencode.exe',
      ),
    ];

    for (const exePath of globalExeCandidates) {
      if (fs.existsSync(exePath)) {
        console.log('[CLI Resolver] Using global OpenCode CLI executable:', exePath);
        return {
          cliPath: exePath,
          cliDir: path.dirname(exePath),
          source: 'global',
        };
      }
    }

    for (const exePath of localExeCandidates) {
      if (fs.existsSync(exePath)) {
        console.log('[CLI Resolver] Using local OpenCode CLI executable:', exePath);
        return {
          cliPath: exePath,
          cliDir: path.dirname(exePath),
          source: 'local',
        };
      }
    }

    const pathExe = resolveOpenCodeExeOnPath();
    if (pathExe) {
      console.log('[CLI Resolver] Using OpenCode executable on PATH:', pathExe);
      return {
        cliPath: pathExe,
        cliDir: path.dirname(pathExe),
        source: 'global',
      };
    }

    return null;
  }

  if (appPath && !preferGlobal) {
    const binName = 'opencode';
    const devCliPath = path.join(appPath, 'node_modules', '.bin', binName);
    if (fs.existsSync(devCliPath)) {
      console.log('[CLI Resolver] Using bundled CLI:', devCliPath);
      return {
        cliPath: devCliPath,
        cliDir: path.dirname(devCliPath),
        source: 'local',
      };
    }
  }

  const nvmPaths = getNvmOpenCodePaths();
  for (const opencodePath of nvmPaths) {
    console.log('[CLI Resolver] Using nvm OpenCode CLI:', opencodePath);
    return {
      cliPath: opencodePath,
      cliDir: path.dirname(opencodePath),
      source: 'global',
    };
  }

  const globalOpenCodePaths = ['/usr/local/bin/opencode', '/opt/homebrew/bin/opencode'];

  for (const opencodePath of globalOpenCodePaths) {
    if (fs.existsSync(opencodePath)) {
      console.log('[CLI Resolver] Using global OpenCode CLI:', opencodePath);
      return {
        cliPath: opencodePath,
        cliDir: path.dirname(opencodePath),
        source: 'global',
      };
    }
  }

  if (appPath) {
    const binName = 'opencode';
    const devCliPath = path.join(appPath, 'node_modules', '.bin', binName);
    if (fs.existsSync(devCliPath)) {
      console.log('[CLI Resolver] Using bundled CLI:', devCliPath);
      return {
        cliPath: devCliPath,
        cliDir: path.dirname(devCliPath),
        source: 'local',
      };
    }
  }

  if (isOpenCodeOnPath()) {
    console.log('[CLI Resolver] Using opencode command on PATH');
    return {
      cliPath: 'opencode',
      cliDir: '',
      source: 'global',
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
      const { packageName } = getOpenCodePlatformInfo();
      const packageJsonCandidates = [
        path.join(path.dirname(path.dirname(cliPath)), packageName, 'package.json'),
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
