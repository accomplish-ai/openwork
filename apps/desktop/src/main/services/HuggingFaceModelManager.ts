import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';
import type { HuggingFaceModel, ModelDownloadProgress } from '../../../../../packages/agent-core/src/common/types/provider';

export class HuggingFaceModelManager extends EventEmitter {
  private cacheDir: string;
  private modelsConfigPath: string;
  private installedModels: Map<string, HuggingFaceModel> = new Map();

  constructor() {
    super();
    this.cacheDir = path.join(app.getPath('userData'), 'hf-models');
    this.modelsConfigPath = path.join(this.cacheDir, 'models.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await this.loadInstalledModels();
  }

  private async loadInstalledModels(): Promise<void> {
    try {
      const data = await fs.readFile(this.modelsConfigPath, 'utf-8');
      const models = JSON.parse(data) as HuggingFaceModel[];
      this.installedModels = new Map(models.map(m => [m.id, m]));
    } catch {
      // File doesn't exist yet, that's okay
      this.installedModels = new Map();
    }
  }

  private async saveInstalledModels(): Promise<void> {
    const models = Array.from(this.installedModels.values());
    await fs.writeFile(
      this.modelsConfigPath,
      JSON.stringify(models, null, 2),
      'utf-8'
    );
  }

  async searchModels(query: string, limit: number = 20): Promise<HuggingFaceModel[]> {
    try {
      // Search HuggingFace Hub API
      const response = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${limit}&filter=text-generation&sort=downloads`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HuggingFace API error: ${response.statusText}`);
      }

      const models = await response.json();
      
      return models.map((model: any) => ({
        id: model.id || model.modelId,
        name: model.id || model.modelId,
        description: model.description || '',
        size: this.estimateModelSize(model.tags || []),
        quantizations: this.detectQuantizations(model.tags || []),
        tags: model.tags || [],
        downloads: model.downloads || 0,
      }));
    } catch (error) {
      console.error('Error searching models:', error);
      return [];
    }
  }

  async getModelInfo(modelId: string): Promise<HuggingFaceModel | null> {
    try {
      const response = await fetch(
        `https://huggingface.co/api/models/${modelId}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const model = await response.json();
      
      return {
        id: model.id || model.modelId,
        name: model.id || model.modelId,
        description: model.description || '',
        size: this.estimateModelSize(model.tags || []),
        quantizations: this.detectQuantizations(model.tags || []),
        tags: model.tags || [],
        downloads: model.downloads || 0,
      };
    } catch (error) {
      console.error('Error getting model info:', error);
      return null;
    }
  }

  getInstalledModels(): HuggingFaceModel[] {
    return Array.from(this.installedModels.values());
  }

  isModelInstalled(modelId: string): boolean {
    return this.installedModels.has(modelId);
  }

  async markModelAsInstalled(model: HuggingFaceModel): Promise<void> {
    this.installedModels.set(model.id, model);
    await this.saveInstalledModels();
  }

  async removeModel(modelId: string): Promise<void> {
    const modelPath = path.join(this.cacheDir, modelId);
    await fs.rm(modelPath, { recursive: true, force: true });
    this.installedModels.delete(modelId);
    await this.saveInstalledModels();
  }

  async getModelCacheSize(modelId: string): Promise<number> {
    try {
      const modelPath = path.join(this.cacheDir, modelId);
      const size = await this.getDirectorySize(modelPath);
      return size;
    } catch {
      return 0;
    }
  }

  async getTotalCacheSize(): Promise<number> {
    try {
      return await this.getDirectorySize(this.cacheDir);
    } catch {
      return 0;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
    
    return size;
  }

  private estimateModelSize(tags: string[]): number {
    // Estimate model size based on tags and model name
    // This is a rough estimation
    const sizeTag = tags.find(t => t.includes('GB') || t.includes('MB'));
    
    if (sizeTag) {
      const match = sizeTag.match(/(\d+(?:\.\d+)?)(GB|MB)/);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
      }
    }

    // Default estimates based on common model sizes
    if (tags.includes('1b') || tags.includes('1B')) return 1 * 1024 * 1024 * 1024;
    if (tags.includes('3b') || tags.includes('3B')) return 3 * 1024 * 1024 * 1024;
    if (tags.includes('7b') || tags.includes('7B')) return 7 * 1024 * 1024 * 1024;
    
    return 2 * 1024 * 1024 * 1024; // Default 2GB
  }

  private detectQuantizations(tags: string[]): string[] {
    const quantizations: string[] = [];
    
    if (tags.some(t => t.includes('q4') || t.includes('int4'))) quantizations.push('q4');
    if (tags.some(t => t.includes('q8') || t.includes('int8'))) quantizations.push('q8');
    if (tags.some(t => t.includes('fp16') || t.includes('float16'))) quantizations.push('fp16');
    if (tags.some(t => t.includes('fp32') || t.includes('float32'))) quantizations.push('fp32');
    
    // Default quantizations if none detected
    if (quantizations.length === 0) {
      quantizations.push('q4', 'q8', 'fp16');
    }
    
    return quantizations;
  }

  getCacheDirectory(): string {
    return this.cacheDir;
  }

  // Recommended models for initial support
  getRecommendedModels(): Array<{ id: string; name: string; description: string }> {
    return [
      {
        id: 'Xenova/gpt2',
        name: 'GPT-2',
        description: 'OpenAI\'s GPT-2 model - small and fast',
      },
      {
        id: 'Xenova/distilgpt2',
        name: 'DistilGPT-2',
        description: 'Smaller, faster version of GPT-2',
      },
      {
        id: 'Xenova/LaMini-Flan-T5-783M',
        name: 'LaMini-Flan-T5 783M',
        description: 'Instruction-tuned T5 model for chat',
      },
      {
        id: 'Xenova/flan-t5-small',
        name: 'Flan-T5 Small',
        description: 'Google\'s Flan-T5 small model',
      },
    ];
  }
}