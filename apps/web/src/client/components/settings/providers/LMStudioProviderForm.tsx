import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getAccomplish } from '@/lib/accomplish';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import type {
  ConnectedProvider,
  LMStudioCredentials,
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

import lmstudioLogo from '/assets/ai-logos/lmstudio.png';

interface LMStudioModel {
  id: string;
  name: string;
  toolSupport: ToolSupportStatus;
}

interface LMStudioProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function LMStudioProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: LMStudioProviderFormProps) {
  const [serverUrl, setServerUrl] = useState('http://localhost:1234');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<LMStudioModel[]>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();
      const result = await accomplish.testLMStudioConnection(serverUrl);

      if (!result.success) {
        setError(result.error || 'Connection failed');
        setConnecting(false);
        return;
      }

      const models = (result.models || []) as LMStudioModel[];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'lmstudio',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'lmstudio',
          serverUrl,
        } as LMStudioCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models.map((m) => ({
          id: `lmstudio/${m.id}`,
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

  const models: LMStudioModel[] = (connectedProvider?.availableModels || availableModels).map(
    (m) => {
      const id = m.id.replace(/^lmstudio\//, '');
      return {
        id,
        name: m.name,
        toolSupport: (m as { toolSupport?: ToolSupportStatus }).toolSupport || 'unknown',
      };
    },
  );

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      data-testid="provider-settings-panel"
    >
      <ProviderFormHeader logoSrc={lmstudioLogo} providerName="LM Studio" />

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
                  LM Studio Server URL
                </label>
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="http://localhost:1234"
                  data-testid="lmstudio-server-url"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Start LM Studio and enable the local server in Developer settings
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
                  LM Studio Server URL
                </label>
                <input
                  type="text"
                  value={
                    (connectedProvider?.credentials as LMStudioCredentials)?.serverUrl ||
                    'http://localhost:1234'
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
                idPrefix="lmstudio"
              />

              <div className="flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ToolSupportBadge status="supported" />
                  <span>Function calling verified</span>
                </span>
              </div>

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
                  <p className="font-medium">Context length requirement</p>
                  <p className="text-blue-400/80 mt-1">
                    Ensure your model is loaded with a large enough context length (max available
                    recommended) in LM Studio settings.
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
