import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  OllamaCredentials,
  ToolSupportStatus,
} from '@accomplish_ai/agent-core/common';
import {
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
  ToolSupportBadge,
  ToolAwareModelSelector,
} from '../shared';

import ollamaLogo from '/assets/ai-logos/ollama.svg';

interface OllamaModel {
  id: string;
  name: string;
  toolSupport?: ToolSupportStatus;
}

interface OllamaProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function OllamaProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: OllamaProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('http://localhost:11434');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testOllamaConnection(serverUrl);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models: OllamaModel[] = (result.models || []).map((m) => ({
        id: `ollama/${m.id}`,
        name: m.displayName,
        toolSupport: m.toolSupport || 'unknown',
      }));
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'ollama',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'ollama',
          serverUrl,
        } as OllamaCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map((m) => ({
          id: m.id,
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

  const models: OllamaModel[] = (connectedProvider?.availableModels || availableModels).map(
    (m) => ({
      id: m.id,
      name: m.name,
      toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unknown',
    }),
  );

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={ollamaLogo} providerName="Ollama" />

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
                  Ollama Server URL
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  data-testid="ollama-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
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
                  Ollama Server URL
                </label>
                <input
                  type="text"
                  value={
                    (connectedProvider?.credentials as OllamaCredentials)?.serverUrl ||
                    'http://localhost:11434'
                  }
                  disabled
                  className="w-full rounded-md border border-input bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
                />
              </div>

              <ConnectedControls onDisconnect={onDisconnect} />

              <ToolAwareModelSelector
                models={models}
                value={connectedProvider?.selectedModelId || null}
                onChange={onModelChange}
                error={showModelError && !connectedProvider?.selectedModelId}
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
