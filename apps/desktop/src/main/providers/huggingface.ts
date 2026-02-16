import type { TextGenerationPipeline, ProgressCallback } from '@xenova/transformers';
import { env } from '@xenova/transformers';
import type { ChatMessage, ChatOptions } from '../../../preload/electronTypes';
import { Transform, type TransformCallback } from 'stream';
import { createReadStream, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { promisify } from 'util';

// Set up transformers.js environment
env.allowLocalModels = true;
env.cacheDir = join(app.getPath('userData'), 'huggingface-cache');

export interface HuggingFaceConfig {
  modelId: string;
  quantized?: boolean;
  device?: 'cpu' | 'webgpu';
  dtype?: 'fp32' | 'fp16' | 'int8' | 'int4';
  contextLength?: number;
  temperature?: number;
  maxNewTokens?: number;
}

export interface ModelDownloadProgress {
  modelId: string;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
  message?: string;
}

class HuggingFaceAdapter {
  private pipelinePromise: Promise<TextGenerationPipeline> | null = null;
  private config: HuggingFaceConfig;
  private static instance: HuggingFaceAdapter | null = null;

  constructor(config: HuggingFaceConfig) {
    this.config = config;
  }

  static getInstance(config: HuggingFaceConfig): HuggingFaceAdapter {
    if (!HuggingFaceAdapter.instance) {
      HuggingFaceAdapter.instance = new HuggingFaceAdapter(config);
    } else {
      // Update config if different
      HuggingFaceAdapter.instance.config = config;
    }
    return HuggingFaceAdapter.instance;
  }

  async initializePipeline(): Promise<TextGenerationPipeline> {
    if (this.pipelinePromise) {
      return this.pipelinePromise;
    }

    // Dynamically import the pipeline function to avoid bundling issues
    const { pipeline } = await import('@xenova/transformers');
    
    this.pipelinePromise = pipeline(
      'text-generation',
      this.config.modelId,
      {
        cache_dir: env.cacheDir,
        quantized: this.config.quantized ?? true,
        device: this.config.device || 'cpu',
        dtype: this.config.dtype || 'int8',
        progress_callback: (progress: ProgressCallback) => {
          console.log(`Loading model ${this.config.modelId}:`, progress);
        },
      }
    );

    return this.pipelinePromise;
  }

  async generateText(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<AsyncIterableIterator<string>> {
    const pipe = await this.initializePipeline();

    // Format messages for the model
    const formattedMessages = this.formatMessages(messages);

    // Prepare generation arguments
    const generationArgs = {
      inputs: formattedMessages,
      max_new_tokens: options?.maxTokens || this.config.maxNewTokens || 512,
      temperature: options?.temperature || this.config.temperature || 0.7,
      do_sample: true,
      top_k: 50,
      top_p: 0.95,
      repetition_penalty: 1.2,
      return_full_text: false,
    };

    // Generate text
    const output = await pipe(generationArgs);
    
    // Convert output to stream of tokens
    const text = Array.isArray(output) ? output[0]?.generated_text || '' : output.generated_text || '';
    
    return this.createTokenIterator(text);
  }

  private formatMessages(messages: ChatMessage[]): string {
    // Simple chat template - could be enhanced based on the specific model
    return messages.map(msg => {
      if (msg.role === 'user') {
        return `[INST] ${msg.content} [/INST]`;
      } else if (msg.role === 'assistant') {
        return msg.content;
      } else if (msg.role === 'system') {
        return `<SYS>${msg.content}<\SYS>`;
      }
      return msg.content;
    }).join('\n');
  }

  private async *createTokenIterator(text: string): AsyncIterableIterator<string> {
    // Split text into chunks to simulate streaming
    const chunkSize = 10;
    for (let i = 0; i < text.length; i += chunkSize) {
      yield text.slice(i, i + chunkSize);
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  async validateModelAccess(modelId: string): Promise<boolean> {
    try {
      // Check if model exists by attempting to load its config
      const { AutoTokenizer, AutoModel } = await import('@xenova/transformers');
      
      // This is a simplified check - in practice, we might want to check if the model exists on HF hub
      // For now, we'll just return true as the pipeline initialization will handle actual validation
      return true;
    } catch (error) {
      console.error(`Failed to validate model access for ${modelId}:`, error);
      return false;
    }
  }

  async getModelDetails(modelId: string): Promise<{ size: number; quantized: boolean; capabilities: string[] }> {
    try {
      const cacheDir = env.cacheDir;
      const modelPath = join(cacheDir, 'models--' + modelId.replace('/', '--'));
      
      // Calculate model size from cached files
      let totalSize = 0;
      try {
        const files = await readdir(modelPath);
        for (const file of files) {
          const filePath = join(modelPath, file);
          const stats = await stat(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
          }
        }
      } catch (err) {
        // Model not cached yet, return estimated size
        totalSize = this.estimateModelSize(modelId);
      }
      
      return {
        size: totalSize,
        quantized: this.config.quantized ?? true,
        capabilities: ['text-generation'] // Basic capabilities
      };
    } catch (error) {
      console.error(`Failed to get model details for ${modelId}:`, error);
      return {
        size: this.estimateModelSize(modelId),
        quantized: this.config.quantized ?? true,
        capabilities: ['text-generation']
      };
    }
  }

  private estimateModelSize(modelId: string): number {
    // Rough estimates for common models
    if (modelId.toLowerCase().includes('phi-3')) return 3.8 * 1024 * 1024 * 1024; // ~3.8GB
    if (modelId.toLowerCase().includes('llama-3.2')) return 1.2 * 1024 * 1024 * 1024; // ~1.2GB for 1B
    if (modelId.toLowerCase().includes('gemma-2b')) return 2.4 * 1024 * 1024 * 1024; // ~2.4GB
    if (modelId.toLowerCase().includes('qwen2')) return 2.8 * 1024 * 1024 * 1024; // ~2.8GB for 1.5B
    
    // Default to 2GB if unknown
    return 2 * 1024 * 1024 * 1024;
  }

  async listAvailableModels(): Promise<Array<{
    id: string;
    displayName: string;
    size: number;
    quantization: string;
    toolSupport?: 'supported' | 'unsupported' | 'unknown';
  }>> {
    // This would typically connect to the Hugging Face Hub API to list models
    // For now, we'll return a predefined list of supported models
    const models = [
      {
        id: 'microsoft/Phi-3-mini-4k-instruct',
        displayName: 'Phi-3 Mini (4K)',
        size: 3.8 * 1024 * 1024 * 1024,
        quantization: 'int8',
      },
      {
        id: 'meta-llama/Llama-3.2-1B-Instruct',
        displayName: 'Llama 3.2 1B (Instruct)',
        size: 1.2 * 1024 * 1024 * 1024,
        quantization: 'int8',
      },
      {
        id: 'meta-llama/Llama-3.2-3B-Instruct',
        displayName: 'Llama 3.2 3B (Instruct)',
        size: 2.8 * 1024 * 1024 * 1024,
        quantization: 'int8',
      },
      {
        id: 'google/gemma-2b-it',
        displayName: 'Gemma 2B (IT)',
        size: 2.4 * 1024 * 1024 * 1024,
        quantization: 'int8',
      },
      {
        id: 'Qwen/Qwen2-1.5B-Instruct',
        displayName: 'Qwen2 1.5B (Instruct)',
        size: 2.8 * 1024 * 1024 * 1024,
        quantization: 'int8',
      },
    ];

    // Enhance with actual sizes if available
    const detailedModels = [];
    for (const model of models) {
      const details = await this.getModelDetails(model.id);
      detailedModels.push({
        ...model,
        size: details.size,
      });
    }

    return detailedModels;
  }

  async downloadModel(modelId: string, onProgress?: (progress: ModelDownloadProgress) => void): Promise<void> {
    try {
      if (onProgress) {
        onProgress({ modelId, progress: 0, status: 'downloading', message: 'Starting download...' });
      }

      // Dynamically import the pipeline function to avoid bundling issues
      const { pipeline } = await import('@xenova/transformers');

      // Initialize pipeline to trigger download
      const pipe = await pipeline(
        'text-generation',
        modelId,
        {
          cache_dir: env.cacheDir,
          quantized: this.config.quantized ?? true,
          device: this.config.device || 'cpu',
          dtype: this.config.dtype || 'int8',
          progress_callback: (progress: ProgressCallback) => {
            if (onProgress) {
              onProgress({
                modelId,
                progress: progress.download_count ? (progress.download_completed / progress.download_count) * 100 : 0,
                status: 'downloading',
                message: `Downloading: ${progress.file || 'model files'}`
              });
            }
          },
        }
      );

      // Warm up the model by running a simple test
      await pipe('Hello, world!', { max_new_tokens: 5 });

      if (onProgress) {
        onProgress({ modelId, progress: 100, status: 'completed', message: 'Download completed!' });
      }
    } catch (error) {
      console.error(`Failed to download model ${modelId}:`, error);
      if (onProgress) {
        onProgress({ modelId, progress: 0, status: 'failed', message: `Error: ${(error as Error).message}` });
      }
      throw error;
    }
  }

  async checkModelDownloaded(modelId: string): Promise<boolean> {
    const cacheDir = env.cacheDir;
    const modelPath = join(cacheDir, 'models--' + modelId.replace('/', '--'));
    
    try {
      await stat(modelPath);
      return true;
    } catch {
      return false;
    }
  }

  async getCacheStats(): Promise<{ totalSize: number; modelCount: number }> {
    const cacheDir = env.cacheDir;
    let totalSize = 0;
    let modelCount = 0;

    try {
      const items = await readdir(cacheDir);
      for (const item of items) {
        if (item.startsWith('models--')) {
          modelCount++;
          const itemPath = join(cacheDir, item);
          const stats = await stat(itemPath);
          if (stats.isDirectory()) {
            // Calculate directory size recursively
            totalSize += await this.getDirSize(itemPath);
          }
        }
      }
    } catch (err) {
      // Cache directory might not exist yet
      console.warn('Cache directory does not exist:', err);
    }

    return { totalSize, modelCount };
  }

  private async getDirSize(path: string): Promise<number> {
    let size = 0;
    const items = await readdir(path);
    
    for (const item of items) {
      const itemPath = join(path, item);
      const stats = await stat(itemPath);
      
      if (stats.isDirectory()) {
        size += await this.getDirSize(itemPath);
      } else if (stats.isFile()) {
        size += stats.size;
      }
    }
    
    return size;
  }

  async clearModelCache(modelId?: string): Promise<void> {
    const cacheDir = env.cacheDir;
    
    if (modelId) {
      // Clear specific model
      const modelPath = join(cacheDir, 'models--' + modelId.replace('/', '--'));
      try {
        await this.rmDirRecursive(modelPath);
      } catch (err) {
        console.warn(`Could not remove model cache for ${modelId}:`, err);
      }
    } else {
      // Clear entire cache
      try {
        await this.rmDirRecursive(cacheDir);
      } catch (err) {
        console.warn('Could not clear entire cache:', err);
      }
    }
  }

  private async rmDirRecursive(dirPath: string): Promise<void> {
    const items = await readdir(dirPath);
    
    for (const item of items) {
      const itemPath = join(dirPath, item);
      const stats = await stat(itemPath);
      
      if (stats.isDirectory()) {
        await this.rmDirRecursive(itemPath);
      } else {
        await unlink(itemPath);
      }
    }
    
    await rmdir(dirPath);
  }
}

// Import unlink and rmdir from fs/promises separately
import { unlink, rmdir } from 'fs/promises';

export { HuggingFaceAdapter };