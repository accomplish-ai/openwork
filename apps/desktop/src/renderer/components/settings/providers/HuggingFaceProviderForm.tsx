import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type { ConnectedProvider, HuggingFaceCredentials, ToolSupportStatus } from '@accomplish_ai/agent-core/common';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

import huggingfaceLogo from '/assets/ai-logos/huggingface.svg';

interface HuggingFaceModel {
  id: string;
  name: string;
  size?: string;
  toolSupport: ToolSupportStatus;
  downloaded: boolean;
}

interface HuggingFaceProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

function DownloadBadge({ downloaded }: { downloaded: boolean }) {
  if (downloaded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Downloaded
      </span>
    );
  }
  return null;
}

function HuggingFaceModelList({
  models,
  value,
  onChange,
  error,
  onDownload,
  downloadingModelId,
}: {
  models: HuggingFaceModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
  onDownload: (modelId: string) => void;
  downloadingModelId: string | null;
}) {
  const downloadedModels = models.filter((m) => m.downloaded);

  const selectorModels = downloadedModels.map((model) => ({
    id: `huggingface/${model.id}`,
    name: `${model.name} (${model.size || 'unknown'})`,
  }));

  return (
    <div className="space-y-3">
      {downloadedModels.length > 0 && (
        <ModelSelector
          models={selectorModels}
          value={value}
          onChange={onChange}
          error={error}
          errorMessage="Please select a model"
          placeholder="Select a downloaded model..."
        />
      )}

      {downloadedModels.length === 0 && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          No models downloaded yet. Download a model below to get started.
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Available Models</label>
        <div className="space-y-2">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between rounded-md border border-border bg-background p-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{model.name}</p>
                <p className="text-xs text-muted-foreground">{model.size || 'Unknown size'}</p>
              </div>
              <div className="flex items-center gap-2">
                <DownloadBadge downloaded={model.downloaded} />
                {!model.downloaded && (
                  <button
                    onClick={() => onDownload(model.id)}
                    disabled={downloadingModelId !== null}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {downloadingModelId === model.id ? 'Downloading...' : 'Download'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {value && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-medium">Small local models have limited capabilities</p>
            <p className="text-yellow-400/80 mt-1">These models do not support tool/function calling. Tasks requiring file operations or browser automation will not work correctly.</p>
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
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  useEffect(() => {
    if (!isConnected || availableModels.length > 0) {
      return;
    }
    const accomplish = getAccomplish();
    accomplish.testHuggingFaceConnection().then((result) => {
      if (result.success && result.models) {
        setAvailableModels(result.models as HuggingFaceModel[]);
      }
    }).catch(() => {});
  }, [isConnected, availableModels.length]);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testHuggingFaceConnection();

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as HuggingFaceModel[];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'huggingface',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface',
          serverUrl: 'http://127.0.0.1:9230',
        } as HuggingFaceCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models
          .filter((m) => m.downloaded)
          .map((m) => ({
            id: `huggingface/${m.id}`,
            name: m.name,
            toolSupport: m.toolSupport,
          })),
      };

      onConnect(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDownload = async (modelId: string) => {
    setDownloadingModelId(modelId);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.downloadHuggingFaceModel(modelId);

      if (!result.success) {
        setError(result.error || 'Download failed');
        setDownloadingModelId(null);
        return;
      }

      const refreshResult = await accomplish.testHuggingFaceConnection();
      if (refreshResult.success && refreshResult.models) {
        const models = refreshResult.models as HuggingFaceModel[];
        setAvailableModels(models);

        if (connectedProvider) {
          const updatedProvider: ConnectedProvider = {
            ...connectedProvider,
            availableModels: models
              .filter((m) => m.downloaded)
              .map((m) => ({
                id: `huggingface/${m.id}`,
                name: m.name,
                toolSupport: m.toolSupport,
              })),
          };
          onConnect(updatedProvider);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingModelId(null);
    }
  };

  const models: HuggingFaceModel[] = availableModels.length > 0
    ? availableModels
    : ((connectedProvider?.availableModels || []).map((m) => {
      const id = m.id.replace(/^huggingface\//, '');
      return {
        id,
        name: m.name,
        toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unsupported',
        downloaded: true,
      };
    }));

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="HuggingFace" />

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
              <p className="text-sm text-muted-foreground">
                Run open-source models locally using HuggingFace Transformers.js. No cloud API required.
              </p>

              <FormError error={error} />
              <ConnectButton
                onClick={handleConnect}
                connecting={connecting}
              />
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

              <FormError error={error} />

              <HuggingFaceModelList
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
                onDownload={handleDownload}
                downloadingModelId={downloadingModelId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
