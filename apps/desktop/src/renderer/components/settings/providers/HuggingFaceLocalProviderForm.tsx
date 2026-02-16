import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  HuggingFaceLocalCredentials,
  HuggingFaceQuantization,
  HuggingFaceDevicePreference,
} from '@accomplish_ai/agent-core/common';
import {
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

import huggingFaceLogo from '/assets/ai-logos/huggingface.svg';

interface HuggingFaceHubModel {
  modelId: string;
  displayName: string;
  likes: number;
  downloads: number;
  lastModified: string;
  tags: string[];
  suggestedQuantizations: HuggingFaceQuantization[];
}

interface HuggingFaceInstalledModel {
  id: string;
  modelId: string;
  displayName: string;
  quantization: HuggingFaceQuantization;
  devicePreference: HuggingFaceDevicePreference;
  downloadedAt: string;
  sizeBytes?: number;
  status: 'ready' | 'downloading' | 'error';
  error?: string;
}

interface HuggingFaceHardwareInfo {
  webGpuLikelyAvailable: boolean;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  cpuModel: string;
  cpuCount: number;
}

interface DownloadProgress {
  modelId: string;
  phase: 'starting' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  message?: string;
}

interface HuggingFaceLocalProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

const QUANTIZATION_OPTIONS: Array<{ value: HuggingFaceQuantization; label: string }> = [
  { value: 'q4', label: 'Q4 (smallest)' },
  { value: 'q8', label: 'Q8 (balanced)' },
  { value: 'fp16', label: 'FP16 (higher quality)' },
  { value: 'fp32', label: 'FP32 (max quality)' },
];

const DEVICE_OPTIONS: Array<{ value: HuggingFaceDevicePreference; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'webgpu', label: 'WebGPU' },
  { value: 'wasm', label: 'WASM' },
  { value: 'cpu', label: 'CPU' },
];

function buildProviderModelId(
  modelId: string,
  quantization: HuggingFaceQuantization,
  devicePreference: HuggingFaceDevicePreference
): string {
  return `huggingface-local/${modelId}::${quantization}::${devicePreference}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return 'Unknown';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
}

function formatRelativeDate(input: string): string {
  if (!input) {
    return 'Unknown';
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs < dayMs) {
    return 'Today';
  }
  if (diffMs < 2 * dayMs) {
    return 'Yesterday';
  }
  const days = Math.floor(diffMs / dayMs);
  return `${days}d ago`;
}

export function HuggingFaceLocalProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceLocalProviderFormProps) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [models, setModels] = useState<HuggingFaceHubModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [quantization, setQuantization] = useState<HuggingFaceQuantization>('q4');
  const [devicePreference, setDevicePreference] = useState<HuggingFaceDevicePreference>('auto');
  const [downloading, setDownloading] = useState(false);
  const [installedModels, setInstalledModels] = useState<HuggingFaceInstalledModel[]>([]);
  const [hardware, setHardware] = useState<HuggingFaceHardwareInfo | null>(null);
  const [cacheDir, setCacheDir] = useState('');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const refreshInstalled = useCallback(async () => {
    const accomplish = getAccomplish();
    try {
      const installed = await accomplish.listHuggingFaceModels();
      setInstalledModels(installed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load installed Hugging Face models');
    }
  }, []);

  const searchModels = useCallback(async (value: string) => {
    setSearching(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.searchHuggingFaceModels(value);
      setModels(result);

      if (result.length > 0) {
        setSelectedModelId((prev) => prev || result[0].modelId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search Hugging Face models');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const accomplish = getAccomplish();

    void searchModels('');
    void refreshInstalled();

    accomplish.getHuggingFaceHardwareInfo()
      .then(setHardware)
      .catch(() => setHardware(null));

    accomplish.getHuggingFaceCacheDir()
      .then(setCacheDir)
      .catch(() => setCacheDir(''));

    return accomplish.onHuggingFaceDownloadProgress?.((event) => {
      setProgress({
        modelId: event.modelId,
        phase: event.phase,
        progress: event.progress,
        message: event.message,
      });

      if (event.phase === 'ready') {
        setDownloading(false);
        void refreshInstalled();
      }

      if (event.phase === 'error') {
        setDownloading(false);
        setError(event.message || 'Model download failed');
      }
    });
  }, [refreshInstalled, searchModels]);

  const selectedSearchModel = useMemo(
    () => models.find((model) => model.modelId === selectedModelId),
    [models, selectedModelId]
  );

  const readyInstalledModels = useMemo(
    () => installedModels.filter((model) => model.status === 'ready'),
    [installedModels]
  );

  const connectWithModel = useCallback(async (model: HuggingFaceInstalledModel) => {
    const accomplish = getAccomplish();
    const selectedProviderModelId = buildProviderModelId(
      model.modelId,
      model.quantization,
      model.devicePreference
    );
    const modelsForProvider = (() => {
      const base = [...readyInstalledModels];
      if (
        !base.some(
          (installed) =>
            installed.modelId === model.modelId &&
            installed.quantization === model.quantization &&
            installed.devicePreference === model.devicePreference
        )
      ) {
        base.push(model);
      }
      return base;
    })();
    const credentials: HuggingFaceLocalCredentials = {
      type: 'huggingface-local',
      modelId: model.modelId,
      quantization: model.quantization,
      devicePreference: model.devicePreference,
      serverUrl: 'http://127.0.0.1:9231',
      cacheDir: await accomplish.getHuggingFaceCacheDir(),
    };

    const provider: ConnectedProvider = {
      providerId: 'huggingface-local',
      connectionStatus: 'connected',
      selectedModelId: selectedProviderModelId,
      credentials,
      lastConnectedAt: new Date().toISOString(),
      availableModels: modelsForProvider.map((installed) => ({
        id: buildProviderModelId(
          installed.modelId,
          installed.quantization,
          installed.devicePreference
        ),
        name: `${installed.displayName} (${installed.quantization.toUpperCase()}, ${installed.devicePreference})`,
        toolSupport: 'unknown',
        sizeBytes: installed.sizeBytes,
        quantization: installed.quantization,
        devicePreference: installed.devicePreference,
      })),
    };

    onConnect(provider);
  }, [onConnect, readyInstalledModels]);

  const handleDownloadAndConnect = useCallback(async () => {
    if (!selectedSearchModel) {
      setError('Please select a model first');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const downloaded = await accomplish.downloadHuggingFaceModel({
        modelId: selectedSearchModel.modelId,
        quantization,
        devicePreference,
      });

      await refreshInstalled();
      await connectWithModel(downloaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download model');
    } finally {
      setDownloading(false);
    }
  }, [connectWithModel, devicePreference, quantization, refreshInstalled, selectedSearchModel]);

  const connectedModels = useMemo(() => {
    const source = connectedProvider?.availableModels?.length
      ? connectedProvider.availableModels
      : readyInstalledModels.map((installed) => ({
          id: buildProviderModelId(
            installed.modelId,
            installed.quantization,
            installed.devicePreference
          ),
          name: `${installed.displayName} (${installed.quantization.toUpperCase()}, ${installed.devicePreference})`,
        }));

    return source.map((model) => ({
      id: model.id,
      name: model.name,
    }));
  }, [connectedProvider?.availableModels, readyInstalledModels]);

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={huggingFaceLogo} providerName="Hugging Face Local" />

      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>
            Run open-source models directly in Accomplish using Transformers.js with local caching.
          </p>
          {cacheDir && <p className="mt-1">Cache: <span className="font-mono">{cacheDir}</span></p>}
        </div>

        {hardware && (
          <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
            <p>Device: {hardware.webGpuLikelyAvailable ? 'WebGPU likely available' : 'WASM/CPU fallback likely'}</p>
            <p>Memory: {formatBytes(hardware.freeMemoryBytes)} free / {formatBytes(hardware.totalMemoryBytes)} total</p>
            <p>CPU: {hardware.cpuCount} cores</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="hf-disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Model Search</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Hugging Face models"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void searchModels(query)}
                    disabled={searching}
                    className="rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Select Model</label>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-input bg-background p-2">
                  {models.length === 0 && (
                    <p className="px-2 py-1 text-sm text-muted-foreground">No models found.</p>
                  )}

                  {models.map((model) => {
                    const selected = selectedModelId === model.modelId;
                    return (
                      <button
                        key={model.modelId}
                        type="button"
                        onClick={() => setSelectedModelId(model.modelId)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                          selected
                            ? 'border-provider-border-active bg-provider-bg-active'
                            : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground">{model.displayName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground font-mono">{model.modelId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {model.downloads.toLocaleString()} downloads • {model.likes.toLocaleString()} likes
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Quantization</label>
                  <select
                    value={quantization}
                    onChange={(e) => setQuantization(e.target.value as HuggingFaceQuantization)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  >
                    {QUANTIZATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Device</label>
                  <select
                    value={devicePreference}
                    onChange={(e) => setDevicePreference(e.target.value as HuggingFaceDevicePreference)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  >
                    {DEVICE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedSearchModel && (
                <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  <p>Selected: <span className="text-foreground">{selectedSearchModel.displayName}</span></p>
                  <p className="font-mono mt-1">{selectedSearchModel.modelId}</p>
                </div>
              )}

              {progress && progress.modelId === selectedModelId && (
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{progress.phase}</span>
                    <span>{Math.round(progress.progress)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }}
                    />
                  </div>
                  {progress.message && (
                    <p className="mt-2 text-xs text-muted-foreground">{progress.message}</p>
                  )}
                </div>
              )}

              <FormError error={error} />

              <button
                type="button"
                onClick={() => void handleDownloadAndConnect()}
                disabled={!selectedModelId || downloading}
                className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {downloading ? 'Preparing model...' : 'Download & Connect'}
              </button>

              {readyInstalledModels.length > 0 && (
                <div className="rounded-md border border-border bg-background/50 p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">Installed Models</p>
                  <div className="space-y-2">
                    {readyInstalledModels.slice(0, 5).map((installed) => (
                      <div key={`${installed.modelId}-${installed.quantization}-${installed.devicePreference}`} className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs">
                        <div>
                          <p className="font-medium text-foreground">{installed.displayName}</p>
                          <p className="text-muted-foreground">
                            {installed.quantization.toUpperCase()} • {installed.devicePreference} • {formatRelativeDate(installed.downloadedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void connectWithModel(installed)}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="hf-connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <ConnectedControls onDisconnect={onDisconnect} />

              <ModelSelector
                models={connectedModels}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
                placeholder="Select a downloaded model"
              />

              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                <p>Tool calling support is model-dependent and currently marked as unknown.</p>
                <p className="mt-1">Use smaller quantization (Q4/Q8) for lower memory footprint.</p>
              </div>

              {readyInstalledModels.length > 0 && (
                <div className="rounded-md border border-border bg-background/50 p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">Downloaded Models</p>
                  <div className="space-y-2">
                    {readyInstalledModels.map((installed) => (
                      <div key={`${installed.modelId}-${installed.quantization}-${installed.devicePreference}`} className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs">
                        <div>
                          <p className="font-medium text-foreground">{installed.displayName}</p>
                          <p className="text-muted-foreground">
                            {installed.quantization.toUpperCase()} • {installed.devicePreference} • {formatBytes(installed.sizeBytes)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onModelChange(
                              buildProviderModelId(
                                installed.modelId,
                                installed.quantization,
                                installed.devicePreference
                              )
                            )
                          }
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
