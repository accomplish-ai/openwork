'use client';

import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { analytics } from '@/lib/analytics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusMessage } from '@/components/ui/status-message';
import { Trash2 } from 'lucide-react';
import type { ApiKeyConfig, SelectedModel } from '@accomplish/shared';
import { DEFAULT_PROVIDERS } from '@accomplish/shared';
import logoImage from '/assets/logo.png';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeySaved?: () => void;
}

// Provider configuration
const API_KEY_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', prefix: 'xai-', placeholder: 'xai-...' },
  { id: 'openrouter', name: 'OpenRouter', prefix: 'sk-or-v1-', placeholder: 'sk-or-v1-...' },
] as const;
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

type ProviderId = typeof API_KEY_PROVIDERS[number]['id'];

function getApiKeyFormatError(providerId: ProviderId, key: string): string | null {
  const providerConfig = API_KEY_PROVIDERS.find((provider) => provider.id === providerId);
  if (!providerConfig) {
    return 'Unsupported provider';
  }

  if (/\s/.test(key)) {
    return 'API keys cannot contain spaces or line breaks.';
  }

  const detectedProvider = [...API_KEY_PROVIDERS]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((candidate) => key.startsWith(candidate.prefix));

  if (detectedProvider && detectedProvider.id !== providerId) {
    return `This key looks like ${detectedProvider.name}. Switch provider to ${detectedProvider.name} or paste a valid ${providerConfig.name} key.`;
  }

  if (!key.startsWith(providerConfig.prefix)) {
    return `Invalid API key format. Key should start with ${providerConfig.prefix}`;
  }

  if (key.length <= providerConfig.prefix.length) {
    return 'API key looks incomplete. Please paste the full key.';
  }

  return null;
}

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<ApiKeyConfig[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [loadingDebug, setLoadingDebug] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [modelStatusMessage, setModelStatusMessage] = useState<string | null>(null);
  const [modelErrorMessage, setModelErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud');
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; displayName: string; size: number }>>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');
  const [savingOllama, setSavingOllama] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [allowMouseControl, setAllowMouseControl] = useState(false);
  const [desktopControlPreflight, setDesktopControlPreflight] = useState(false);
  const [liveScreenSampling, setLiveScreenSampling] = useState(false);
  const [loadingMouseControl, setLoadingMouseControl] = useState(true);

  useEffect(() => {
    if (!open) return;

    // Reset state on reopen so users don't see stale data
    setLoadingKeys(true);
    setLoadingDebug(true);
    setLoadingModel(true);
    setIsSaving(false);
    setStatusMessage(null);
    setError(null);
    setProvider('anthropic');
    setActiveTab('cloud');
    setDebugMode(false);
    setSelectedModel(null);
    setModelStatusMessage(null);
    setModelErrorMessage(null);
    setKeyToDelete(null);
    setApiKey('');
    setOllamaUrl(DEFAULT_OLLAMA_URL);
    setOllamaModels([]);
    setOllamaConnected(false);
    setOllamaError(null);
    setTestingOllama(false);
    setSelectedOllamaModel('');
    setSavingOllama(false);
    setAllowMouseControl(false);
    setDesktopControlPreflight(false);
    setLiveScreenSampling(false);
    setLoadingMouseControl(true);

    const accomplish = getAccomplish();

    const fetchKeys = async () => {
      try {
        const keys = await accomplish.getApiKeys();
        setSavedKeys(keys);
      } catch (err) {
        console.error('Failed to fetch API keys:', err);
      } finally {
        setLoadingKeys(false);
      }
    };

    const fetchDebugSetting = async () => {
      try {
        const enabled = await accomplish.getDebugMode();
        setDebugMode(enabled);
      } catch (err) {
        console.error('Failed to fetch debug setting:', err);
      } finally {
        setLoadingDebug(false);
      }
    };

    const fetchVersion = async () => {
      try {
        const version = await accomplish.getVersion();
        setAppVersion(version);
      } catch (err) {
        console.error('Failed to fetch version:', err);
      }
    };

    const fetchSelectedModel = async () => {
      try {
        const model = await accomplish.getSelectedModel();
        setSelectedModel(model as SelectedModel | null);
      } catch (err) {
        console.error('Failed to fetch selected model:', err);
      } finally {
        setLoadingModel(false);
      }
    };

    const fetchOllamaConfig = async () => {
      try {
        const config = await accomplish.getOllamaConfig();
        if (config) {
          setOllamaUrl(config.baseUrl);
          // Auto-test connection if previously configured
          if (config.enabled) {
            const result = await accomplish.testOllamaConnection(config.baseUrl);
            if (result.success && result.models) {
              setOllamaConnected(true);
              setOllamaModels(result.models);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch Ollama config:', err);
      }
    };

    const fetchDesktopControlSettings = async () => {
      try {
        const settings = await accomplish.getAppSettings() as unknown as {
          allowMouseControl?: boolean;
          desktopControlPreflight?: boolean;
          liveScreenSampling?: boolean;
        };
        setAllowMouseControl(Boolean(settings.allowMouseControl));
        setDesktopControlPreflight(Boolean(settings.desktopControlPreflight));
        setLiveScreenSampling(Boolean(settings.liveScreenSampling));
      } catch (err) {
        console.error('Failed to fetch desktop control settings:', err);
      } finally {
        setLoadingMouseControl(false);
      }
    };

    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchSelectedModel();
    fetchOllamaConfig();
    fetchDesktopControlSettings();
  }, [open]);

  const handleDebugToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !debugMode;
    setDebugMode(newValue);
    analytics.trackToggleDebugMode(newValue);
    try {
      await accomplish.setDebugMode(newValue);
    } catch (err) {
      console.error('Failed to save debug setting:', err);
      setDebugMode(!newValue);
    }
  };

  const handleMouseControlToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !allowMouseControl;
    setAllowMouseControl(newValue);
    try {
      // Optional chaining for backwards compatibility if method is missing
      await accomplish.setAllowMouseControl?.(newValue);
    } catch (err) {
      console.error('Failed to save mouse control setting:', err);
      setAllowMouseControl(!newValue);
    }
  };

  const handleDesktopControlPreflightToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !desktopControlPreflight;
    setDesktopControlPreflight(newValue);
    try {
      await accomplish.setDesktopControlPreflight?.(newValue);
    } catch (err) {
      console.error('Failed to save desktop control preflight setting:', err);
      setDesktopControlPreflight(!newValue);
    }
  };

  const handleLiveScreenSamplingToggle = async () => {
    const accomplish = getAccomplish();
    const newValue = !liveScreenSampling;
    setLiveScreenSampling(newValue);
    try {
      await accomplish.setLiveScreenSampling?.(newValue);
    } catch (err) {
      console.error('Failed to save live screen sampling setting:', err);
      setLiveScreenSampling(!newValue);
    }
  };

  const handleModelChange = async (fullId: string) => {
    const accomplish = getAccomplish();
    const allModels = DEFAULT_PROVIDERS.flatMap((p) => p.models);
    const model = allModels.find((m) => m.fullId === fullId);
    if (model) {
      analytics.trackSelectModel(model.displayName);
      const newSelection: SelectedModel = {
        provider: model.provider,
        model: model.fullId,
      };
      setModelStatusMessage(null);
      setModelErrorMessage(null);
      try {
        await accomplish.setSelectedModel(newSelection);
        setSelectedModel(newSelection);
        setModelStatusMessage(`Model updated to ${model.displayName}`);
      } catch (err) {
        console.error('Failed to save model selection:', err);
        setModelErrorMessage('Failed to update model selection. Please try again.');
      }
    }
  };

  const handleSaveApiKey = async () => {
    const accomplish = getAccomplish();
    const trimmedKey = apiKey.trim();
    const currentProvider = API_KEY_PROVIDERS.find((p) => p.id === provider)!;
    setError(null);
    setStatusMessage(null);

    if (!trimmedKey) {
      setError('Please enter an API key.');
      return;
    }

    const formatError = getApiKeyFormatError(provider, trimmedKey);
    if (formatError) {
      setError(formatError);
      return;
    }

    setIsSaving(true);

    try {
      // Validate first
      const validation = await accomplish.validateApiKeyForProvider(provider, trimmedKey);
      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        setIsSaving(false);
        return;
      }

      const savedKey = await accomplish.addApiKey(provider, trimmedKey);
      analytics.trackSaveApiKey(currentProvider.name);
      setApiKey('');
      setStatusMessage(`${currentProvider.name} API key saved securely.`);
      setSavedKeys((prev) => {
        const filtered = prev.filter((k) => k.provider !== savedKey.provider);
        return [...filtered, savedKey];
      });
      onApiKeySaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save API key.';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApiKey = async (id: string, providerName: string) => {
    const accomplish = getAccomplish();
    const providerConfig = API_KEY_PROVIDERS.find((p) => p.id === providerName);
    setError(null);
    setStatusMessage(null);
    try {
      await accomplish.removeApiKey(id);
      setSavedKeys((prev) => prev.filter((k) => k.id !== id));
      setStatusMessage(`${providerConfig?.name || providerName} API key removed.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove API key.';
      setError(message);
    }
  };

  const handleTestOllama = async () => {
    const accomplish = getAccomplish();
    setTestingOllama(true);
    setOllamaError(null);
    setOllamaConnected(false);
    setOllamaModels([]);

    try {
      const result = await accomplish.testOllamaConnection(ollamaUrl);
      if (result.success && result.models) {
        setOllamaConnected(true);
        setOllamaModels(result.models);
        if (result.models.length > 0) {
          setSelectedOllamaModel(result.models[0].id);
        }
      } else {
        setOllamaError(result.error || 'Connection failed');
      }
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTestingOllama(false);
    }
  };

  const handleSaveOllama = async () => {
    const accomplish = getAccomplish();
    setSavingOllama(true);
    setModelStatusMessage(null);
    setModelErrorMessage(null);

    try {
      // Save the Ollama config
      await accomplish.setOllamaConfig({
        baseUrl: ollamaUrl,
        enabled: true,
        lastValidated: Date.now(),
        models: ollamaModels,  // Include discovered models
      });

      // Set as selected model
      await accomplish.setSelectedModel({
        provider: 'ollama',
        model: `ollama/${selectedOllamaModel}`,
        baseUrl: ollamaUrl,
      });

      setSelectedModel({
        provider: 'ollama',
        model: `ollama/${selectedOllamaModel}`,
        baseUrl: ollamaUrl,
      });

      setModelStatusMessage(`Model updated to ${selectedOllamaModel}`);
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Failed to save');
      setModelErrorMessage('Failed to update model selection. Please try again.');
    } finally {
      setSavingOllama(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* Model Selection Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Model</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              {/* Tabs */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setActiveTab('cloud')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'cloud'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Cloud Providers
                </button>
                <button
                  onClick={() => setActiveTab('local')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'local'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Local Models
                </button>
              </div>

              {activeTab === 'cloud' ? (
                <>
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                    Select a cloud AI model. Requires an API key for the provider.
                  </p>
                  {loadingModel ? (
                    <div className="h-10 animate-pulse rounded-md bg-muted" />
                  ) : (
                    <select
                      data-testid="settings-model-select"
                      value={selectedModel?.provider !== 'ollama' ? selectedModel?.model || '' : ''}
                      onChange={(e) => handleModelChange(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="" disabled>Select a model...</option>
                      {DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey).map((provider) => {
                        const hasApiKey = savedKeys.some((k) => k.provider === provider.id);
                        return (
                          <optgroup key={provider.id} label={provider.name}>
                            {provider.models.map((model) => (
                              <option
                                key={model.fullId}
                                value={model.fullId}
                                disabled={!hasApiKey}
                              >
                                {model.displayName}{!hasApiKey ? ' (No API key)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  )}
                  {modelStatusMessage && (
                    <StatusMessage variant="success" className="mt-3">
                      {modelStatusMessage}
                    </StatusMessage>
                  )}
                  {modelErrorMessage && (
                    <StatusMessage variant="error" className="mt-3">
                      {modelErrorMessage}
                    </StatusMessage>
                  )}
                  {selectedModel && selectedModel.provider !== 'ollama' && !savedKeys.some((k) => k.provider === selectedModel.provider) && (
                    <StatusMessage variant="warning" className="mt-3">
                      No API key configured for {DEFAULT_PROVIDERS.find((p) => p.id === selectedModel.provider)?.name}. Add one below.
                    </StatusMessage>
                  )}
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                    Connect to a local Ollama server to use models running on your machine.
                  </p>

                  {/* Ollama URL Input */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Ollama Server URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={ollamaUrl}
                        onChange={(e) => {
                          setOllamaUrl(e.target.value);
                          setOllamaConnected(false);
                          setOllamaModels([]);
                        }}
                        placeholder="http://localhost:11434"
                        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <button
                        onClick={handleTestOllama}
                        disabled={testingOllama}
                        className="rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                      >
                        {testingOllama ? 'Testing...' : 'Test'}
                      </button>
                    </div>
                  </div>

                  {testingOllama && (
                    <StatusMessage variant="loading" className="mb-4">
                      Testing Ollama connection...
                    </StatusMessage>
                  )}

                  {/* Connection Status */}
                  {ollamaConnected && (
                    <StatusMessage variant="success" className="mb-4">
                      Connected - {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
                    </StatusMessage>
                  )}

                  {ollamaError && (
                    <StatusMessage variant="error" className="mb-4">
                      {ollamaError}
                    </StatusMessage>
                  )}

                  {/* Model Selection (only show when connected) */}
                  {ollamaConnected && ollamaModels.length > 0 && (
                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Select Model
                      </label>
                      <select
                        value={selectedOllamaModel}
                        onChange={(e) => setSelectedOllamaModel(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {ollamaModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} ({formatBytes(model.size)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Save Button */}
                  {ollamaConnected && selectedOllamaModel && (
                    <button
                      onClick={handleSaveOllama}
                      disabled={savingOllama}
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {savingOllama ? 'Saving...' : 'Use This Model'}
                    </button>
                  )}

                  {savingOllama && (
                    <StatusMessage variant="loading" className="mt-4">
                      Saving model selection...
                    </StatusMessage>
                  )}

                  {modelStatusMessage && (
                    <StatusMessage variant="success" className="mt-4">
                      {modelStatusMessage}
                    </StatusMessage>
                  )}

                  {modelErrorMessage && (
                    <StatusMessage variant="error" className="mt-4">
                      {modelErrorMessage}
                    </StatusMessage>
                  )}

                  {/* Help text when not connected */}
                  {!ollamaConnected && !ollamaError && (
                    <p className="text-sm text-muted-foreground">
                      Make sure{' '}
                      <a
                        href="https://ollama.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Ollama
                      </a>{' '}
                      is installed and running, then click Test to connect.
                    </p>
                  )}

                  {/* Current Ollama selection indicator */}
                  {selectedModel?.provider === 'ollama' && (
                    <div className="mt-4 rounded-lg bg-muted p-3">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Currently using:</span>{' '}
                        {selectedModel.model.replace('ollama/', '')}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* API Key Section - Only show for cloud providers */}
          {activeTab === 'cloud' && (
            <section>
              <h2 className="mb-4 text-base font-medium text-foreground">Bring Your Own Model/API Key</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-5 text-sm text-muted-foreground leading-relaxed">
                Setup the API key and model for your own AI coworker.
              </p>

              {/* Provider Selection */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  Provider
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {API_KEY_PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        analytics.trackSelectProvider(p.name);
                        setProvider(p.id);
                        setApiKey('');
                        setError(null);
                        setStatusMessage(null);
                      }}
                      className={`rounded-xl border p-4 text-center transition-all duration-200 ease-accomplish ${
                        provider === p.id
                          ? 'border-primary bg-muted'
                          : 'border-border hover:border-ring'
                      }`}
                    >
                      <div className="font-medium text-foreground">{p.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  {API_KEY_PROVIDERS.find((p) => p.id === provider)?.name} API Key
                </label>
                <input
                  data-testid="settings-api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError(null);
                    setStatusMessage(null);
                  }}
                  placeholder={API_KEY_PROVIDERS.find((p) => p.id === provider)?.placeholder}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {error && (
                <StatusMessage variant="error" className="mb-4">
                  {error}
                </StatusMessage>
              )}
              {statusMessage && (
                <StatusMessage variant="success" className="mb-4">
                  {statusMessage}
                </StatusMessage>
              )}
              {isSaving && (
                <StatusMessage variant="loading" className="mb-4">
                  Saving API key...
                </StatusMessage>
              )}

              <button
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                onClick={handleSaveApiKey}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save API Key'}
              </button>

              {/* Saved Keys */}
              {loadingKeys ? (
                <div className="mt-6 animate-pulse">
                  <div className="h-4 w-24 rounded bg-muted mb-3" />
                  <div className="h-14 rounded-xl bg-muted" />
                </div>
              ) : savedKeys.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-medium text-foreground">Saved Keys</h3>
                  <div className="space-y-2">
                    {savedKeys.map((key) => {
                      const providerConfig = API_KEY_PROVIDERS.find((p) => p.id === key.provider);
                      return (
                        <div
                          key={key.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-muted p-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <span className="text-xs font-bold text-primary">
                                {providerConfig?.name.charAt(0) || key.provider.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {providerConfig?.name || key.provider}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {key.keyPrefix}
                              </div>
                            </div>
                          </div>
                          {keyToDelete === key.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Are you sure?</span>
                              <button
                                onClick={() => {
                                  handleDeleteApiKey(key.id, key.provider);
                                  setKeyToDelete(null);
                                }}
                                className="rounded px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setKeyToDelete(null)}
                                className="rounded px-2 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setKeyToDelete(key.id)}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 ease-accomplish"
                              title="Remove API key"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            </section>
          )}

          {/* Developer Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Developer</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-foreground">Debug Mode</div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    Show detailed backend logs including Claude CLI commands, flags,
                    and stdout/stderr output in the task view.
                  </p>
                </div>
                <div className="ml-4">
                  {loadingDebug ? (
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <button
                      data-testid="settings-debug-toggle"
                      onClick={handleDebugToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                        debugMode ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                          debugMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
              {debugMode && (
                <StatusMessage variant="warning" className="mt-4">
                  Debug mode is enabled. Backend logs will appear in the task view
                  when running tasks.
                </StatusMessage>
              )}
            </div>
          </section>

          {/* Input Control Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Input control</h2>
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    Enable desktop control preflight
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    Runs readiness checks before desktop actions and screenshots so the agent can
                    explain missing permissions or unhealthy services.
                  </p>
                </div>
                <div className="ml-4">
                  {loadingMouseControl ? (
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <button
                      onClick={handleDesktopControlPreflightToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                        desktopControlPreflight ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                          desktopControlPreflight ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
              {desktopControlPreflight && (
                <StatusMessage variant="warning">
                  Preflight checks are enabled. The app will surface permission and readiness blockers
                  before running desktop control tasks.
                </StatusMessage>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    Allow agent to control mouse &amp; keyboard
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    When enabled, Screen Agent can move your mouse, click, and perform other
                    desktop actions on your Mac. macOS will still require you to grant
                    Accessibility and Input Monitoring permissions, and you can turn this off
                    at any time.
                  </p>
                </div>
                <div className="ml-4">
                  {loadingMouseControl ? (
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <button
                      onClick={handleMouseControlToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                        allowMouseControl ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                          allowMouseControl ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
              {allowMouseControl && (
                <StatusMessage variant="warning">
                  Agent input control is enabled. Make sure you trust the tasks you run,
                  and review macOS Privacy &amp; Security settings if anything behaves
                  unexpectedly.
                </StatusMessage>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    Enable live screen sampling
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    Allows sampled live-view sessions so the agent can refresh screen context while
                    you work. Intended for short, on-demand sessions only.
                  </p>
                </div>
                <div className="ml-4">
                  {loadingMouseControl ? (
                    <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
                  ) : (
                    <button
                      onClick={handleLiveScreenSamplingToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                        liveScreenSampling ? 'bg-primary' : 'bg-muted'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                          liveScreenSampling ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}
                </div>
              </div>
              {liveScreenSampling && (
                <StatusMessage variant="warning">
                  Live screen sampling is enabled. Use short sessions and disable if you notice
                  higher CPU usage.
                </StatusMessage>
              )}
            </div>
          </section>

          {/* About Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">About</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-4">
                <img
                  src={logoImage}
                  alt="Openwork"
                  className="h-12 w-12 rounded-xl"
                />
                <div>
                  <div className="font-medium text-foreground">Openwork</div>
                  <div className="text-sm text-muted-foreground">Version {appVersion || '0.1.0'}</div>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              Openwork is a local computer-use AI agent for your Mac that reads your files, creates documents, and automates repetitive knowledge work—all open-source with your AI models of choice.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
              Any questions or feedback? <a href="mailto:openwork-support@accomplish.ai" className="text-primary hover:underline">Click here to contact us</a>.
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
