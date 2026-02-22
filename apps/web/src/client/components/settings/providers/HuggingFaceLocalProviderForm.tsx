import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  HuggingFaceLocalCredentials,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core/common';
import { HF_LOCAL_DEFAULT_URL } from '@accomplish_ai/agent-core';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ModelSelector,
} from '../shared';

import huggingfaceLogo from '/assets/ai-logos/huggingface.png';

interface HuggingFaceLocalModel {
  id: string;
  displayName: string;
  size: number;
  toolSupport?: ToolSupportStatus;
}

interface HuggingFaceLocalProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function HuggingFaceLocalProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: HuggingFaceLocalProviderFormProps) {
  const [serverUrl, setServerUrl] = useState(HF_LOCAL_DEFAULT_URL);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<HuggingFaceLocalModel[]>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testHuggingFaceLocalConnection(serverUrl);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as HuggingFaceLocalModel[];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'huggingface-local',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'huggingface-local',
          serverUrl,
        } as HuggingFaceLocalCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map((m) => ({
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

  const models: HuggingFaceLocalModel[] = (
    connectedProvider?.availableModels || availableModels
  ).map((m) => {
    const id = m.id.replace(/^huggingface-local\//, '');
    return {
      id,
      displayName:
        ('name' in m ? m.name : undefined) || ('displayName' in m ? (m.displayName as string) : id),
      size: 0,
      toolSupport:
        ('toolSupport' in m ? (m.toolSupport as ToolSupportStatus) : undefined) || 'unknown',
    };
  });

  const selectorModels = models.map((model) => ({
    id: `huggingface-local/${model.id}`,
    name: model.displayName,
  }));

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={huggingfaceLogo} providerName="HuggingFace Local" />

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
                  HuggingFace Local Server URL
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:8787"
                  data-testid="huggingface-local-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Run a local HuggingFace Transformers.js inference server with ONNX Runtime
                </p>
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
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  HuggingFace Local Server URL
                </label>
                <input
                  type="text"
                  value={
                    (connectedProvider?.credentials as HuggingFaceLocalCredentials)?.serverUrl ||
                    HF_LOCAL_DEFAULT_URL
                  }
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              <ModelSelector
                models={selectorModels}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
                errorMessage="Please select a model"
                placeholder="Select a model..."
              />

              <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-400">
                <svg
                  className="h-5 w-5 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-medium">Local inference with Transformers.js</p>
                  <p className="text-blue-400/80 mt-1">
                    Models run locally using ONNX Runtime. Smaller quantized models (Q4) are
                    recommended for faster inference.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
