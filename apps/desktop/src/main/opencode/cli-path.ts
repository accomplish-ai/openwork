import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

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
  }

  return paths;
}

export function getOpenCodeCliPath(): { command: string; args: string[] } {
  if (app.isPackaged) {
    const { packageName, binaryName } = getOpenCodePlatformInfo();

    const cliPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      packageName,
      'bin',
      binaryName
    );

    if (!fs.existsSync(cliPath)) {
      throw new Error(`OpenCode CLI not found at: ${cliPath}`);
    }

    return {
      command: cliPath,
      args: [],
    };
  } else {
    const preferGlobal = process.env.ACCOMPLISH_USE_GLOBAL_OPENCODE === '1';

    const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
    const devCliPath = path.join(app.getAppPath(), 'node_modules', '.bin', binName);
    if (!preferGlobal && fs.existsSync(devCliPath)) {
      console.log('[CLI Path] Using bundled CLI:', devCliPath);
      return { command: devCliPath, args: [] };
    }

    const nvmPaths = getNvmOpenCodePaths();
    for (const opencodePath of nvmPaths) {
      console.log('[CLI Path] Using nvm OpenCode CLI:', opencodePath);
      return { command: opencodePath, args: [] };
    }

    const globalOpenCodePaths = process.platform === 'win32'
      ? [
          path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
          path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
        ]
      : [
          '/usr/local/bin/opencode',
          '/opt/homebrew/bin/opencode',
        ];

    for (const opencodePath of globalOpenCodePaths) {
      if (fs.existsSync(opencodePath)) {
        console.log('[CLI Path] Using global OpenCode CLI:', opencodePath);
        return { command: opencodePath, args: [] };
      }
    }

    if (fs.existsSync(devCliPath)) {
      console.log('[CLI Path] Using bundled CLI:', devCliPath);
      return { command: devCliPath, args: [] };
    }

    console.log('[CLI Path] Falling back to opencode command on PATH');
    return { command: 'opencode', args: [] };
  }
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

export function isOpenCodeBundled(): boolean {
  try {
    if (app.isPackaged) {
      const { packageName, binaryName } = getOpenCodePlatformInfo();

      const cliPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'bin',
        binaryName
      );
      return fs.existsSync(cliPath);
    } else {
      const binName = process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
      const devCliPath = path.join(app.getAppPath(), 'node_modules', '.bin', binName);
      if (fs.existsSync(devCliPath)) {
        return true;
      }

      const nvmPaths = getNvmOpenCodePaths();
      if (nvmPaths.length > 0) {
        return true;
      }

      const globalOpenCodePaths = process.platform === 'win32'
        ? [
            path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
            path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
          ]
        : [
            '/usr/local/bin/opencode',
            '/opt/homebrew/bin/opencode',
          ];

      for (const opencodePath of globalOpenCodePaths) {
        if (fs.existsSync(opencodePath)) {
          return true;
        }
      }

      if (isOpenCodeOnPath()) {
        return true;
      }

      return false;
    }
  } catch {
    return false;
  }
}

export function getBundledOpenCodeVersion(): string | null {
  try {
    if (app.isPackaged) {
      const { packageName } = getOpenCodePlatformInfo();

      const packageJsonPath = path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        packageName,
        'package.json'
      );

      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return pkg.version;
      }
      return null;
    } else {
      const { command, args } = getOpenCodeCliPath();
      const fullCommand = args.length > 0
        ? `"${command}" ${args.map(a => `"${a}"`).join(' ')} --version`
        : `"${command}" --version`;

      const output = execSync(fullCommand, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();

      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : output;
    }
  } catch {
    return null;
  }
}
