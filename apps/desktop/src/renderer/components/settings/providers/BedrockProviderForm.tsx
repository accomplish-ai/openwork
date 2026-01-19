// apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx

import { useState } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { ConnectedProvider, BedrockProviderCredentials } from '@accomplish/shared';
import {
  ModelSelector,
  RegionSelector,
  ConnectButton,
  ConnectedControls,
  ProviderFormHeader,
  FormError,
} from '../shared';

// Import Bedrock logo
import bedrockLogo from '/assets/ai-logos/bedrock.svg';

interface BedrockProviderFormProps {
  connectedProvider?: ConnectedProvider;
  onConnect: (provider: ConnectedProvider) => void;
  onDisconnect: () => void;
  onModelChange: (modelId: string) => void;
  showModelError: boolean;
}

export function BedrockProviderForm({
  connectedProvider,
  onConnect,
  onDisconnect,
  onModelChange,
  showModelError,
}: BedrockProviderFormProps) {
  const [authTab, setAuthTab] = useState<'accessKey' | 'profile'>('accessKey');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [profileName, setProfileName] = useState('default');
  const [region, setRegion] = useState('us-east-1');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);

  const isConnected = connectedProvider?.connectionStatus === 'connected';

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);

    try {
      const accomplish = getAccomplish();

      const credentials = authTab === 'accessKey'
        ? {
            authType: 'accessKeys' as const,
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretKey.trim(),
            sessionToken: sessionToken.trim() || undefined,
            region,
          }
        : {
            authType: 'profile' as const,
            profileName: profileName.trim() || 'default',
            region,
          };

      const validation = await accomplish.validateBedrockCredentials(credentials);

      if (!validation.valid) {
        setError(validation.error || 'Invalid credentials');
        setConnecting(false);
        return;
      }

      // Save credentials
      await accomplish.saveBedrockCredentials(credentials);

      // Preset Bedrock models
      const models = [
        { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0', name: 'Claude Opus 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5' },
        { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
      ];
      setAvailableModels(models);

      const provider: ConnectedProvider = {
        providerId: 'bedrock',
        connectionStatus: 'connected',
        selectedModelId: null,
        credentials: {
          type: 'bedrock',
          authMethod: authTab,
          region,
          ...(authTab === 'accessKey'
            ? { accessKeyIdPrefix: accessKeyId.substring(0, 8) + '...' }
            : { profileName: profileName.trim() || 'default' }
          ),
        } as BedrockProviderCredentials,
        lastConnectedAt: new Date().toISOString(),
        availableModels: models,
      };

      onConnect(provider);
      setSecretKey('');
      setSessionToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const models = connectedProvider?.availableModels || availableModels;

  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="provider-settings-panel">
      <ProviderFormHeader logoSrc={bedrockLogo} providerName="Bedrock" />

      <div className="space-y-3">
        {!isConnected ? (
          <>
            {/* Auth tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setAuthTab('accessKey')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authTab === 'accessKey'
                    ? 'bg-[#4A7C59] text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Access Key
              </button>
              <button
                onClick={() => setAuthTab('profile')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  authTab === 'profile'
                    ? 'bg-[#4A7C59] text-white'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                AWS Profile
              </button>
            </div>

            {authTab === 'accessKey' ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Access Key ID</label>
                  <input
                    type="text"
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    placeholder="AKIA..."
                    data-testid="bedrock-access-key-id"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">Secret Access Key</label>
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Enter secret access key"
                    data-testid="bedrock-secret-key"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Session Token <span className="text-muted-foreground">(Optional)</span>
                  </label>
                  <input
                    type="password"
                    value={sessionToken}
                    onChange={(e) => setSessionToken(e.target.value)}
                    placeholder="For temporary credentials"
                    data-testid="bedrock-session-token"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Profile Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="default"
                  data-testid="bedrock-profile-name"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm"
                />
              </div>
            )}

            <RegionSelector value={region} onChange={setRegion} />

            <FormError error={error} />
            <ConnectButton onClick={handleConnect} connecting={connecting} />
          </>
        ) : (
          <>
            <ConnectedControls onDisconnect={onDisconnect} />

            {/* Model Selector */}
            <ModelSelector
              models={models}
              value={connectedProvider?.selectedModelId || null}
              onChange={onModelChange}
              error={showModelError && !connectedProvider?.selectedModelId}
            />
          </>
        )}
      </div>
    </div>
  );
}
