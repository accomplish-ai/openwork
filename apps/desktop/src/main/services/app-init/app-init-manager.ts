import { EventEmitter } from 'events';
import { app, BrowserWindow } from 'electron';
import path from 'path';
import type { SystemHealth, ComponentHealth } from '@accomplish/shared';
import {
  checkBundledNode,
  nodeToHealth,
  checkMCPServer,
  mcpToHealth,
  detectChrome,
  chromeToHealth,
} from './checkers';

const MCP_SERVERS = [
  { name: 'file-permission', displayName: 'File Permission MCP' },
  { name: 'ask-user-question', displayName: 'Ask User Question MCP' },
  { name: 'dev-browser-mcp', displayName: 'Browser Automation MCP' },
  { name: 'complete-task', displayName: 'Complete Task MCP' },
];

const MAX_AUTO_RETRIES = 3;

export class AppInitManager extends EventEmitter {
  private health: SystemHealth;
  private autoRetryCount = 0;
  private focusListener: (() => void) | null = null;
  private focusWindow: BrowserWindow | null = null;

  constructor() {
    super();
    this.health = {
      overall: 'pending',
      components: [],
      lastFullCheck: null,
      isChecking: false,
      checkingComponent: null,
    };
  }

  getHealth(): SystemHealth {
    return { ...this.health };
  }

  private getSkillsDir(): string {
    if (app.isPackaged) {
      // In packaged app, skills are unpacked to resources/skills
      // Must match getSkillsPath() in config-generator.ts
      return path.join(process.resourcesPath, 'skills');
    }
    // Development: skills are in apps/desktop/skills
    return path.join(app.getAppPath(), 'skills');
  }

  private getMCPEntryPath(mcpName: string): string {
    if (app.isPackaged) {
      // In packaged app, skills are pre-bundled to dist/index.cjs (CommonJS)
      return path.join(this.getSkillsDir(), mcpName, 'dist', 'index.cjs');
    }
    // Development: TypeScript source files, run via `npx tsx` by OpenCode
    return path.join(this.getSkillsDir(), mcpName, 'src', 'index.ts');
  }

  private updateComponent(component: ComponentHealth): void {
    const index = this.health.components.findIndex(c => c.name === component.name);
    if (index >= 0) {
      this.health.components[index] = component;
    } else {
      this.health.components.push(component);
    }
    this.recalculateOverall();
    this.emit('health:changed', this.getHealth());
  }

  private recalculateOverall(): void {
    const statuses = this.health.components.map(c => c.status);

    if (statuses.some(s => s === 'failed')) {
      this.health.overall = 'failed';
    } else if (statuses.some(s => s === 'degraded')) {
      this.health.overall = 'degraded';
    } else if (statuses.some(s => s === 'checking' || s === 'pending')) {
      this.health.overall = 'checking';
    } else {
      this.health.overall = 'healthy';
      // Reset auto-retry counter when all checks pass
      this.autoRetryCount = 0;
    }
  }

  async runChecks(): Promise<SystemHealth> {
    if (this.health.isChecking) {
      return this.getHealth();
    }

    this.health.isChecking = true;
    this.health.components = [];
    this.emit('health:check-started');

    try {
      // Check bundled Node
      this.health.checkingComponent = 'Validating bundled Node...';
      this.emit('health:progress', this.health.checkingComponent);
      const nodeResult = await checkBundledNode();
      this.updateComponent(nodeToHealth(nodeResult));

      // Only check MCPs if Node is healthy
      if (nodeResult.status === 'healthy') {
        for (const mcp of MCP_SERVERS) {
          this.health.checkingComponent = `Checking ${mcp.displayName}...`;
          this.emit('health:progress', this.health.checkingComponent);

          const entryPath = this.getMCPEntryPath(mcp.name);
          const mcpResult = await checkMCPServer(mcp.name, entryPath);
          this.updateComponent(mcpToHealth(mcp.name, mcp.displayName, mcpResult));
        }
      } else {
        // Mark all MCPs as failed if Node fails
        for (const mcp of MCP_SERVERS) {
          this.updateComponent({
            name: `mcp:${mcp.name}`,
            displayName: mcp.displayName,
            status: 'failed',
            lastCheck: Date.now(),
            error: {
              code: 'MCP_BLOCKED_BY_NODE',
              component: `mcp:${mcp.name}`,
              message: 'Cannot check MCP - bundled Node.js is not working',
              guidance: 'Fix the bundled Node.js issue first.',
              debugInfo: { platform: `${process.platform}-${process.arch}` },
            },
            retryCount: 0,
          });
        }
      }

      // Check Chrome
      this.health.checkingComponent = 'Detecting Chrome...';
      this.emit('health:progress', this.health.checkingComponent);
      const chromeResult = await detectChrome();
      this.updateComponent(chromeToHealth(chromeResult));

    } finally {
      this.health.isChecking = false;
      this.health.checkingComponent = null;
      this.health.lastFullCheck = Date.now();
      this.emit('health:check-complete', this.getHealth());
    }

    return this.getHealth();
  }

  async retryFailed(): Promise<SystemHealth> {
    const failedComponents = this.health.components.filter(c => c.status === 'failed');

    if (failedComponents.length === 0) {
      return this.getHealth();
    }

    this.health.isChecking = true;
    this.emit('health:check-started');

    try {
      for (const component of failedComponents) {
        component.retryCount++;

        if (component.name === 'bundled-node') {
          this.health.checkingComponent = 'Retrying bundled Node...';
          this.emit('health:progress', this.health.checkingComponent);
          const result = await checkBundledNode();
          this.updateComponent({ ...nodeToHealth(result), retryCount: component.retryCount });
        } else if (component.name === 'chrome') {
          this.health.checkingComponent = 'Retrying Chrome detection...';
          this.emit('health:progress', this.health.checkingComponent);
          const result = await detectChrome();
          this.updateComponent({ ...chromeToHealth(result), retryCount: component.retryCount });
        } else if (component.name.startsWith('mcp:')) {
          const mcpName = component.name.replace('mcp:', '');
          this.health.checkingComponent = `Retrying ${component.displayName}...`;
          this.emit('health:progress', this.health.checkingComponent);
          const entryPath = this.getMCPEntryPath(mcpName);
          const result = await checkMCPServer(mcpName, entryPath);
          this.updateComponent({ ...mcpToHealth(mcpName, component.displayName, result), retryCount: component.retryCount });
        }
      }
    } finally {
      this.health.isChecking = false;
      this.health.checkingComponent = null;
      this.emit('health:check-complete', this.getHealth());
    }

    return this.getHealth();
  }

  setupAutoRetryOnFocus(window: BrowserWindow): void {
    if (this.focusListener) return;

    this.focusWindow = window;
    this.focusListener = () => {
      const hasFailures = this.health.components.some(c => c.status === 'failed');
      if (hasFailures && this.autoRetryCount < MAX_AUTO_RETRIES && !this.health.isChecking) {
        this.autoRetryCount++;
        console.log(`[AppInitManager] Auto-retry on focus (attempt ${this.autoRetryCount}/${MAX_AUTO_RETRIES})`);
        this.retryFailed();
      }
    };

    window.on('focus', this.focusListener);
  }

  dispose(): void {
    // Remove focus listener from window to prevent memory leak
    if (this.focusListener && this.focusWindow && !this.focusWindow.isDestroyed()) {
      this.focusWindow.off('focus', this.focusListener);
    }
    this.focusListener = null;
    this.focusWindow = null;
    this.removeAllListeners();
  }
}

// Singleton instance
let instance: AppInitManager | null = null;

export function getAppInitManager(): AppInitManager {
  if (!instance) {
    instance = new AppInitManager();
  }
  return instance;
}

export function disposeAppInitManager(): void {
  if (instance) {
    instance.dispose();
    instance = null;
  }
}
