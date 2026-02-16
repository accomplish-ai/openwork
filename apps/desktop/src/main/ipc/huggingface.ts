// src/main/ipc/huggingface.ts

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { HuggingFaceModelManager } from '../services/HuggingFaceModelManager';
import { HuggingFaceAdapter } from '../adapters/HuggingFaceAdapter';
import type { HuggingFaceConfig, HuggingFaceModel, ModelDownloadProgress } from '../../../../../packages/agent-core/src/common/types/provider';

let modelManager: HuggingFaceModelManager | null = null;
const activeAdapters = new Map<string, HuggingFaceAdapter>();
let handlersRegistered = false;

export function registerHuggingFaceHandlers(): void {
  console.log('[HuggingFace] ========================================');
  console.log('[HuggingFace] Registering HuggingFace IPC handlers...');
  
  if (handlersRegistered) {
    console.warn('[HuggingFace] Handlers already registered, skipping...');
    return;
  }

  try {
    console.log('[HuggingFace] Initializing model manager...');
    modelManager = new HuggingFaceModelManager();
    modelManager.initialize();
    console.log('[HuggingFace] Model manager initialized successfully');
  } catch (error) {
    console.error('[HuggingFace] Failed to initialize model manager:', error);
    // Continue anyway to register handlers
  }

  try {
    // Search for models on HuggingFace Hub
    ipcMain.handle('hf:search-models', async (_event: IpcMainInvokeEvent, query: string, limit?: number) => {
      console.log('[HuggingFace] Handler called: hf:search-models', { query, limit });
      if (!modelManager) throw new Error('Model manager not initialized');
      return await modelManager.searchModels(query, limit);
    });
    console.log('[HuggingFace] ✓ Registered: hf:search-models');

    // Get detailed info about a specific model
    ipcMain.handle('hf:get-model-info', async (_event: IpcMainInvokeEvent, modelId: string) => {
      console.log('[HuggingFace] Handler called: hf:get-model-info', { modelId });
      if (!modelManager) throw new Error('Model manager not initialized');
      return await modelManager.getModelInfo(modelId);
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-model-info');

    // Get list of installed models
    ipcMain.handle('hf:get-installed-models', async (_event: IpcMainInvokeEvent) => {
      console.log('[HuggingFace] Handler called: hf:get-installed-models');
      if (!modelManager) throw new Error('Model manager not initialized');
      return modelManager.getInstalledModels();
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-installed-models');

    // Get recommended models
    ipcMain.handle('hf:get-recommended-models', async (_event: IpcMainInvokeEvent) => {
      console.log('[HuggingFace] Handler called: hf:get-recommended-models');
      if (!modelManager) throw new Error('Model manager not initialized');
      return modelManager.getRecommendedModels();
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-recommended-models');

    // Check if model is installed
    ipcMain.handle('hf:is-model-installed', async (_event: IpcMainInvokeEvent, modelId: string) => {
      console.log('[HuggingFace] Handler called: hf:is-model-installed', { modelId });
      if (!modelManager) throw new Error('Model manager not initialized');
      return modelManager.isModelInstalled(modelId);
    });
    console.log('[HuggingFace] ✓ Registered: hf:is-model-installed');

    // Initialize/load a model
    ipcMain.handle('hf:load-model', async (event: IpcMainInvokeEvent, config: HuggingFaceConfig) => {
      console.log('[HuggingFace] Handler called: hf:load-model', { modelId: config.modelId });
      const adapterId = config.modelId;
      
      if (activeAdapters.has(adapterId)) {
        return { success: true, message: 'Model already loaded' };
      }

      try {
        const adapter = new HuggingFaceAdapter(config);
        
        adapter.on('progress', (progress: ModelDownloadProgress) => {
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window) {
            window.webContents.send('hf:download-progress', progress);
          }
        });

        await adapter.initialize();
        activeAdapters.set(adapterId, adapter);

        if (modelManager) {
          const modelInfo = await modelManager.getModelInfo(config.modelId);
          if (modelInfo) {
            await modelManager.markModelAsInstalled(modelInfo);
          }
        }

        return { success: true, message: 'Model loaded successfully' };
      } catch (error) {
        return { 
          success: false, 
          message: error instanceof Error ? error.message : 'Failed to load model' 
        };
      }
    });
    console.log('[HuggingFace] ✓ Registered: hf:load-model');

    // Generate text (non-streaming)
    ipcMain.handle('hf:generate', async (
      _event: IpcMainInvokeEvent,
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options?: { temperature?: number; maxTokens?: number; topP?: number }
    ) => {
      console.log('[HuggingFace] Handler called: hf:generate', { modelId });
      const adapter = activeAdapters.get(modelId);
      if (!adapter) {
        throw new Error(`Model ${modelId} not loaded. Please load the model first.`);
      }
      return await adapter.generate(messages, options);
    });
    console.log('[HuggingFace] ✓ Registered: hf:generate');

    // Generate text (streaming)
    ipcMain.handle('hf:generate-stream', async (
      event: IpcMainInvokeEvent,
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options?: { temperature?: number; maxTokens?: number; topP?: number }
    ) => {
      console.log('[HuggingFace] Handler called: hf:generate-stream', { modelId });
      const adapter = activeAdapters.get(modelId);
      if (!adapter) {
        throw new Error(`Model ${modelId} not loaded. Please load the model first.`);
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        throw new Error('Window not found');
      }

      (async () => {
        try {
          for await (const chunk of adapter.generateStream(messages, options)) {
            window.webContents.send('hf:stream-chunk', { modelId, chunk });
          }
          window.webContents.send('hf:stream-end', { modelId });
        } catch (error) {
          window.webContents.send('hf:stream-error', { 
            modelId, 
            error: error instanceof Error ? error.message : 'Stream error' 
          });
        }
      })();

      return { success: true };
    });
    console.log('[HuggingFace] ✓ Registered: hf:generate-stream');

    // Unload a model
    ipcMain.handle('hf:unload-model', async (_event: IpcMainInvokeEvent, modelId: string) => {
      console.log('[HuggingFace] Handler called: hf:unload-model', { modelId });
      const adapter = activeAdapters.get(modelId);
      if (adapter) {
        await adapter.dispose();
        activeAdapters.delete(modelId);
      }
      return { success: true };
    });
    console.log('[HuggingFace] ✓ Registered: hf:unload-model');

    // Remove/delete a model from cache
    ipcMain.handle('hf:remove-model', async (_event: IpcMainInvokeEvent, modelId: string) => {
      console.log('[HuggingFace] Handler called: hf:remove-model', { modelId });
      if (!modelManager) throw new Error('Model manager not initialized');
      
      const adapter = activeAdapters.get(modelId);
      if (adapter) {
        await adapter.dispose();
        activeAdapters.delete(modelId);
      }

      await modelManager.removeModel(modelId);
      return { success: true };
    });
    console.log('[HuggingFace] ✓ Registered: hf:remove-model');

    // Get cache statistics
    ipcMain.handle('hf:get-cache-stats', async (_event: IpcMainInvokeEvent) => {
      console.log('[HuggingFace] Handler called: hf:get-cache-stats');
      if (!modelManager) throw new Error('Model manager not initialized');
      
      const totalSize = await modelManager.getTotalCacheSize();
      const installedModels = modelManager.getInstalledModels();
      
      const modelSizes = await Promise.all(
        installedModels.map(async (model) => ({
          modelId: model.id,
          size: await modelManager!.getModelCacheSize(model.id),
        }))
      );

      return {
        totalSize,
        modelCount: installedModels.length,
        cacheDir: modelManager.getCacheDirectory(),
        modelSizes,
      };
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-cache-stats');

    // Get model info (loaded models)
    ipcMain.handle('hf:get-loaded-model-info', async (_event: IpcMainInvokeEvent, modelId: string) => {
      console.log('[HuggingFace] Handler called: hf:get-loaded-model-info', { modelId });
      const adapter = activeAdapters.get(modelId);
      if (!adapter) {
        return null;
      }
      return adapter.getModelInfo();
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-loaded-model-info');

    // Get all loaded models
    ipcMain.handle('hf:get-loaded-models', async (_event: IpcMainInvokeEvent) => {
      console.log('[HuggingFace] Handler called: hf:get-loaded-models');
      return Array.from(activeAdapters.keys());
    });
    console.log('[HuggingFace] ✓ Registered: hf:get-loaded-models');

    handlersRegistered = true;
    console.log('[HuggingFace] ========================================');
    console.log('[HuggingFace] All 13 handlers registered successfully!');
    console.log('[HuggingFace] ========================================');
  } catch (error) {
    console.error('[HuggingFace] ERROR registering handlers:', error);
    throw error;
  }
}

export function unregisterHuggingFaceHandlers(): void {
  console.log('[HuggingFace] Unregistering handlers and cleaning up...');
  activeAdapters.forEach(async (adapter) => {
    await adapter.dispose();
  });
  activeAdapters.clear();
  modelManager = null;
  handlersRegistered = false;
  console.log('[HuggingFace] Cleanup complete');
}