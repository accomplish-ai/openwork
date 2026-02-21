import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { IntegrationConfig } from '../integrations/types';

// Integrations configuration storage wrapper
// Manages persistence of integration settings independently from main database
export class IntegrationsStore {
  private filePath: string;
  private data: IntegrationConfig[] = [];

  constructor() {
    const fileName = app.isPackaged ? 'integrations.json' : 'integrations-dev.json';
    this.filePath = path.join(app.getPath('userData'), fileName);
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        this.data = JSON.parse(content) as IntegrationConfig[];
      } else {
        this.data = [];
      }
    } catch (error) {
      console.warn('Failed to load integrations config:', error);
      this.data = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save integrations config:', error);
    }
  }

  getAll(): IntegrationConfig[] {
    return [...this.data];
  }

  set(configs: IntegrationConfig[]): void {
    this.data = [...configs];
    this.save();
  }

  get(platform: string): IntegrationConfig | undefined {
    return this.data.find((c) => c.platform === platform);
  }

  update(config: IntegrationConfig): void {
    const index = this.data.findIndex((c) => c.platform === config.platform);
    if (index >= 0) {
      this.data[index] = config;
    } else {
      this.data.push(config);
    }
    this.save();
  }

  delete(platform: string): void {
    this.data = this.data.filter((c) => c.platform !== platform);
    this.save();
  }

  clear(): void {
    this.data = [];
    this.save();
  }
}

// Singleton instance for application-wide use
let integrationsStoreInstance: IntegrationsStore | null = null;

export function getIntegrationsStore(): IntegrationsStore {
  if (!integrationsStoreInstance) {
    integrationsStoreInstance = new IntegrationsStore();
  }
  return integrationsStoreInstance;
}

export function resetIntegrationsStore(): void {
  integrationsStoreInstance = null;
}
