import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider } from '@accomplish_ai/agent-core/common';
import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

/**
 * Representation of a HuggingFace model in the UI.
 */
interface HuggingFaceLocalModel {
  id: string;
  name: string;
  sizeBytes?: number;
  downloaded: boolean;
}

/**
 * Props for the HuggingFaceLocalProviderForm component.
 */
interface HuggingFaceLocalProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

/**
 * Format a byte count into a human-readable string (e.g., "1.5 GB").
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Form component for configuring and managing the HuggingFace Local provider.
 * Allows downloading, selecting, and deleting local ONNX models.
 */
export function HuggingFaceLocalProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceLocalProviderFormProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedModels, setCachedModels] = useState<HuggingFaceLocalModel[]>([]);
  const [suggestedModels, setSuggestedModels] = useState<HuggingFaceLocalModel[]>([]);
  const [downloadModelId, setDownloadModelId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const loadModels = useCallback(async () => {
    try {
      const accomplish = getAccomplish();
      const result = await accomplish.listHuggingFaceModels();
      const cached = (result.cached || []).map((m) => ({
        id: m.id,
        name: m.displayName || m.id,
        sizeBytes: m.sizeBytes,
        downloaded: true,
      }));
      const suggested = (result.suggested || []).map((m) => ({
        id: m.id,
        name: m.displayName || m.id,
        downloaded: false,
      }));
      setCachedModels(cached);
      setSuggestedModels(suggested);
    } catch (err) {
      console.warn('Failed to load HuggingFace models:', err);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    const accomplish = getAccomplish();
    const cleanup = accomplish.onHuggingFaceDownloadProgress?.((progress) => {
      if (progress.status === 'downloading') {
        setDownloading(true);
        setDownloadProgress(progress.progress);
      } else if (progress.status === 'complete') {
        setDownloading(false);
        setDownloadProgress(100);
        loadModels(); // Refresh model list
      } else if (progress.status === 'error') {
        setDownloading(false);
        setDownloadProgress(0);
        setError(progress.error || 'Download failed');
      }
    });
    return () => {
      cleanup?.();
    };
  }, [loadModels]);

  const handleConnect = async () => {
    if (cachedModels.length === 0) {
      setError('No models downloaded. Please download a model first.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const modelId = cachedModels[0].id;
      const result = await accomplish.startHuggingFaceServer(modelId);

      if (!result.success) {
        setError(result.error || 'Failed to start server');
        setConnecting(false);
        return;
      }

      const provider: ConnectedProvider = {
        providerId: 'huggingface-local',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface-local',
          modelId,
          serverPort: result.port,
        },
        lastConnectedAt: new Date().toISOString(),
        availableModels: cachedModels.map((m) => ({
          id: `huggingface-local/${m.id}`,
          name: m.name,
        })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start server');
    } finally {
      setConnecting(false);
    }
  };

  const handleDownload = async () => {
    const modelId = downloadModelId.trim();
    if (!modelId) {
      setError('Please enter a HuggingFace model ID');
      return;
    }

    setDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.downloadHuggingFaceModel(modelId);
      if (!result.success) {
        setError(result.error || 'Download failed');
      } else {
        setDownloadModelId('');
        await loadModels();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      const accomplish = getAccomplish();
      await accomplish.deleteHuggingFaceModel(modelId);
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
    }
  };

  const models = (connectedProvider?.availableModels || cachedModels).map((m) => ({
    id: 'id' in m ? m.id : '',
    name: m.name,
  }));

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="HuggingFace Local" invertInDark />

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
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Download Model
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={downloadModelId}
                    onChange={(e) => setDownloadModelId(e.target.value)}
                    placeholder="e.g. onnx-community/Qwen2.5-0.5B-Instruct"
                    data-testid="hf-model-id-input"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                    disabled={downloading}
                  />
                  <button
                    onClick={handleDownload}
                    disabled={downloading || !downloadModelId.trim()}
                    className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {downloading ? 'Downloading...' : 'Download'}
                  </button>
                </div>

                {downloading && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Downloading model...</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {suggestedModels.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">
                    Suggested Models (ONNX-compatible)
                  </label>
                  <div className="space-y-1">
                    {suggestedModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setDownloadModelId(model.id)}
                        className="flex w-full items-center justify-between rounded-md border border-input px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        disabled={downloading}
                      >
                        <span className="text-foreground">{model.name}</span>
                        <span className="text-xs text-muted-foreground">Click to select</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cachedModels.length > 0 && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">
                    Downloaded Models
                  </label>
                  <div className="space-y-1">
                    {cachedModels.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between rounded-md border border-input px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-foreground">{model.name}</span>
                          {model.sizeBytes && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({formatBytes(model.sizeBytes)})
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteModel(model.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FormError error={error} />

              {cachedModels.length > 0 && (
                <ConnectButton onClick={handleConnect} connecting={connecting} />
              )}

              {cachedModels.length === 0 && !downloading && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                  <p className="font-medium">No models downloaded yet</p>
                  <p className="text-yellow-400/80 mt-1">
                    Download an ONNX-compatible model from HuggingFace Hub to get started. Models
                    from <code className="text-xs">onnx-community/</code> or{' '}
                    <code className="text-xs">Xenova/</code> orgs are recommended.
                  </p>
                </div>
              )}
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
              <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Local inference server running</span>
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              <ModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
