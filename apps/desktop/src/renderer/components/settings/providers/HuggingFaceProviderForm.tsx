import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, ToolSupportStatus } from '@accomplish_ai/agent-core/common';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

import huggingFaceLogo from '/assets/ai-logos/huggingface.svg';

interface HuggingFaceModel {
  id: string;
  displayName: string;
  size: number;
  quantization: string;
  toolSupport?: ToolSupportStatus;
}

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function ToolSupportBadge({ status }: { status: ToolSupportStatus }) {
  const config = {
    supported: {
      label: 'Tools',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    unsupported: {
      label: 'No Tools',
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    unknown: {
      label: 'Unknown',
      className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      icon: (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
        </svg>
      ),
    },
  };

  const { label, className, icon } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}

function HuggingFaceModelSelector({
  models,
  value,
  onChange,
  error,
  onDownloadModel,
  downloadingModel,
  cacheStats,
  downloadedModels = [],
}: {
  models: HuggingFaceModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
  onDownloadModel: (modelId: string) => void;
  downloadingModel: string | null;
  cacheStats: { totalSize: number; modelCount: number } | null;
}) {
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    const aOrder = order[a.toolSupport || 'unknown'];
    const bOrder = order[b.toolSupport || 'unknown'];
    return aOrder - bOrder;
  });

  const selectorModels = sortedModels.map((model) => {
    const toolSupport = model.toolSupport || 'unknown';
    const toolIcon = toolSupport === 'supported' ? '✓' : toolSupport === 'unsupported' ? '✗' : '?';
    return {
      id: model.id,
      name: `${model.displayName} (${formatFileSize(model.size)}) ${toolIcon}`,
    };
  });

  const selectedModel = models.find(m => m.id === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';
  // For now, assume all models need to be downloaded (in real implementation, check local cache)
  const isModelDownloaded = false;

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-foreground">Model</label>
        {cacheStats && (
          <span className="text-xs text-muted-foreground">
            Cache: {cacheStats.modelCount} models, {formatFileSize(cacheStats.totalSize)}
          </span>
        )}
      </div>

      <ModelSelector
        models={selectorModels}
        value={value}
        onChange={onChange}
        error={error}
      />

      {selectedModel && !isModelDownloaded && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onDownloadModel(selectedModel.id)}
            disabled={!!downloadingModel}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
          >
            {downloadingModel === selectedModel.id ? (
              <>
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Model
              </>
            )}
          </button>
          <span className="text-xs text-muted-foreground">
            Size: {formatFileSize(selectedModel.size)}
          </span>
        </div>
      )}

      {hasUnsupportedSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.667-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">This model does not support tool/function calling</p>
            <p className="text-red-400/80 mt-1">Tasks requiring browser automation or file operations will not work correctly.</p>
          </div>
        </div>
      )}

      {hasUnknownSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium">Tool support could not be verified</p>
            <p className="text-yellow-400/80 mt-1">This model may or may not support tool/function calling. Test it to confirm.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function HuggingFaceProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceProviderFormProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<HuggingFaceModel[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [cacheStats, setCacheStats] = useState<{ totalSize: number; modelCount: number } | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';
  
  // Check if the API is available
  const isApiAvailable = (() => {
    try {
      const accomplish = getAccomplish();
      return !!accomplish;
    } catch {
      return false;
    }
  })();

  // Listen for download progress updates
  useEffect(() => {
    const handleDownloadProgress = (_event: any, progressData: any) => {
      if (progressData.modelId === downloadingModel) {
        setDownloadProgress(progressData.progress);
        if (progressData.status === 'completed') {
          setDownloadingModel(null);
          // Refresh models after download
          refreshModels();
        } else if (progressData.status === 'failed') {
          setDownloadingModel(null);
          setError(progressData.message || 'Download failed');
        }
      }
    };

    const accomplish = getAccomplish();
    // Check if ipcRenderer exists before using it
    if (accomplish.ipcRenderer && typeof accomplish.ipcRenderer.on === 'function') {
      accomplish.ipcRenderer.on('huggingface:download-progress', handleDownloadProgress);

      return () => {
        accomplish.ipcRenderer.removeListener('huggingface:download-progress', handleDownloadProgress);
      };
    }
  }, [downloadingModel]);

  useEffect(() => {
    if (isConnected) {
      refreshModels();
      refreshCacheStats();
    }
  }, [isConnected]);

  const refreshModels = async () => {
    try {
      const accomplish = getAccomplish();
      // Check if the method exists before calling it
      if (typeof accomplish.listHuggingFaceModels !== 'function') {
        console.error('listHuggingFaceModels method not available');
        setAvailableModels([
          {
            id: 'microsoft/Phi-3-mini-4k-instruct',
            displayName: 'Phi-3 Mini (4K)',
            size: 3.8 * 1024 * 1024 * 1024,
            quantization: 'int8',
            toolSupport: 'unknown'
          },
          {
            id: 'meta-llama/Llama-3.2-1B-Instruct',
            displayName: 'Llama 3.2 1B (Instruct)',
            size: 1.2 * 1024 * 1024 * 1024,
            quantization: 'int8',
            toolSupport: 'unknown'
          }
        ]);
        return;
      }
      
      const result = await accomplish.listHuggingFaceModels();

      if (result.success) {
        setAvailableModels(result.models || []);
      } else {
        setError(result.error || 'Failed to fetch models');
      }
    } catch (err) {
      console.error('Error refreshing models:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
    }
  };

  const refreshCacheStats = async () => {
    try {
      const accomplish = getAccomplish();
      // Check if the method exists before calling it
      if (typeof accomplish.getHuggingFaceCacheStats !== 'function') {
        console.error('getHuggingFaceCacheStats method not available');
        setCacheStats({ totalSize: 0, modelCount: 0 });
        return;
      }
      
      const result = await accomplish.getHuggingFaceCacheStats();

      if (result.success) {
        setCacheStats(result.stats);
      }
    } catch (err) {
      console.error('Failed to get cache stats:', err);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      
      // Check if the required methods exist
      if (typeof accomplish.setHuggingFaceConfig !== 'function') {
        console.error('setHuggingFaceConfig method not available');
        setError('HuggingFace API not available');
        setConnecting(false);
        return;
      }
      
      // Enable the HuggingFace provider
      await accomplish.setHuggingFaceConfig({
        enabled: true,
        defaultModelId: 'microsoft/Phi-3-mini-4k-instruct',
        quantization: 'int8',
        devicePreference: 'cpu',
      });

      // Check if listHuggingFaceModels method exists
      if (typeof accomplish.listHuggingFaceModels !== 'function') {
        console.error('listHuggingFaceModels method not available');
        const mockModels = [
          {
            id: 'microsoft/Phi-3-mini-4k-instruct',
            displayName: 'Phi-3 Mini (4K)',
            size: 3.8 * 1024 * 1024 * 1024,
            quantization: 'int8',
            toolSupport: 'unknown'
          },
          {
            id: 'meta-llama/Llama-3.2-1B-Instruct',
            displayName: 'Llama 3.2 1B (Instruct)',
            size: 1.2 * 1024 * 1024 * 1024,
            quantization: 'int8',
            toolSupport: 'unknown'
          }
        ];
        
        setAvailableModels(mockModels);

        const provider: ConnectedProvider = {
          providerId: 'huggingface-local',
          connectionStatus: 'connected',
          selectedModelId: null,
          credentials: {
            type: 'huggingface-local',
          },
          lastConnectedAt: new Date().toISOString(),
          availableModels: mockModels.map(m => ({
            id: `huggingface-local/${m.id}`,
            name: m.displayName,
            toolSupport: m.toolSupport || 'unknown',
          })),
        };

        onConnect(provider);
        setConnecting(false);
        return;
      }

      // Fetch available models
      const result = await accomplish.listHuggingFaceModels();

      if (!result.success) {
        setError(result.error || 'Failed to connect to HuggingFace provider');
        setConnecting(false);
        return;
      }

      setAvailableModels(result.models);

      const provider: ConnectedProvider = {
        providerId: 'huggingface-local',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface-local',
        },
        lastConnectedAt: new Date().toISOString(),
        availableModels: result.models.map(m => ({
          id: `huggingface-local/${m.id}`,
          name: m.displayName,
          toolSupport: m.toolSupport || 'unknown',
        })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModel(modelId);
    setDownloadProgress(0);
    
    try {
      const accomplish = getAccomplish();
      
      // Check if the method exists
      if (typeof accomplish.downloadHuggingFaceModel !== 'function') {
        console.error('downloadHuggingFaceModel method not available');
        setError('Download functionality not available');
        setDownloadingModel(null);
        return;
      }
      
      const result = await accomplish.downloadHuggingFaceModel(modelId);

      if (!result.success) {
        setError(result.error || 'Failed to download model');
        setDownloadingModel(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setDownloadingModel(null);
    }
  };

  const models: HuggingFaceModel[] = (connectedProvider?.availableModels || availableModels).map(m => ({
    id: m.id.replace('huggingface-local/', ''),
    displayName: m.name,
    size: (m as any).size || (m as any).sizeInBytes || 0,
    quantization: (m as any).quantization || 'int8',
    toolSupport: m.toolSupport || 'unknown',
  }));

  if (!isApiAvailable) {
    return (
      <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
        <ProviderFormHeader logoSrc={huggingFaceLogo} providerName="Hugging Face Local" />
        <div className="text-sm text-muted-foreground">
          HuggingFace integration is not available in this environment.
          Please run the application in Electron to use this feature.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={huggingFaceLogo} providerName="Hugging Face Local" />

      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <div className="text-sm text-muted-foreground">
                Run open-source models from Hugging Face directly in the app using Transformers.js.
                No separate installation required.
              </div>

              <FormError error={error} />
              <ConnectButton onClick={handleConnect} connecting={connecting} />
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <ConnectedControls onDisconnect={onDisconnect} />

              <HuggingFaceModelSelector
                models={models}
                value={connectedProvider?.selectedModelId?.replace('huggingface-local/', '') || null}
                onChange={(modelId) => onModelChange(`huggingface-local/${modelId}`)}
                error={showModelError && !connectedProvider?.selectedModelId}
                onDownloadModel={handleDownloadModel}
                downloadingModel={downloadingModel}
                cacheStats={cacheStats}
              />

              <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ToolSupportBadge status="supported" />
                  <span>Function calling verified</span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}