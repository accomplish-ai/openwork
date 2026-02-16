// apps/desktop/src/renderer/types/electron.d.ts

import type { 
  HuggingFaceConfig, 
  HuggingFaceModel, 
  ModelDownloadProgress 
} from '../../../../packages/agent-core/src/common/types/provider';

declare global {
  interface Window {
    accomplish: {
      // ... all your existing accomplish API types ...
      
      // ✅ ADD THIS:
      huggingface: {
        searchModels: (query: string, limit?: number) => Promise<HuggingFaceModel[]>;
        getModelInfo: (modelId: string) => Promise<HuggingFaceModel | null>;
        getInstalledModels: () => Promise<HuggingFaceModel[]>;
        getRecommendedModels: () => Promise<Array<{ id: string; name: string; description: string }>>;
        isModelInstalled: (modelId: string) => Promise<boolean>;
        loadModel: (config: HuggingFaceConfig) => Promise<{ success: boolean; message: string }>;
        unloadModel: (modelId: string) => Promise<{ success: boolean }>;
        removeModel: (modelId: string) => Promise<{ success: boolean }>;
        generate: (
          modelId: string,
          messages: Array<{ role: string; content: string }>,
          options?: { temperature?: number; maxTokens?: number; topP?: number }
        ) => Promise<string>;
        generateStream: (
          modelId: string,
          messages: Array<{ role: string; content: string }>,
          options?: { temperature?: number; maxTokens?: number; topP?: number }
        ) => Promise<{ success: boolean }>;
        getCacheStats: () => Promise<{
          totalSize: number;
          modelCount: number;
          cacheDir: string;
          modelSizes: Array<{ modelId: string; size: number }>;
        }>;
        getLoadedModelInfo: (modelId: string) => Promise<{
          modelId: string;
          quantization: string;
          device: string;
        } | null>;
        getLoadedModels: () => Promise<string[]>;
        onDownloadProgress: (callback: (progress: ModelDownloadProgress) => void) => () => void;
        onStreamChunk: (callback: (data: { modelId: string; chunk: string }) => void) => () => void;
        onStreamEnd: (callback: (data: { modelId: string }) => void) => () => void;
        onStreamError: (callback: (data: { modelId: string; error: string }) => void) => () => void;
      };
    };
  }
}

export {};