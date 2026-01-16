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
  { id: 'openrouter', name: 'OpenRouter', prefix: 'sk-or-', placeholder: 'sk-or-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
] as const;

// Coming soon providers (displayed but not selectable)
const COMING_SOON_PROVIDERS = [
  { id: 'groq', name: 'Groq' },
] as const;

type ProviderId = typeof API_KEY_PROVIDERS[number]['id'];

export default function SettingsDialog({ open, onOpenChange, onApiKeySaved }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [isSaving, setIsSaving] = useState(false);
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [isSavingOpenAiBaseUrl, setIsSavingOpenAiBaseUrl] = useState(false);
  const [openAiOauthStatus, setOpenAiOauthStatus] = useState<{ connected: boolean; expires?: number } | null>(null);
  const [isSigningInWithChatGpt, setIsSigningInWithChatGpt] = useState(false);
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

  useEffect(() => {
    if (!open) return;

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

    const fetchOpenAiBaseUrl = async () => {
      try {
        const baseUrl = await accomplish.getOpenAiBaseUrl();
        setOpenAiBaseUrl(baseUrl || '');
      } catch (err) {
        console.error('Failed to fetch OpenAI base URL:', err);
      }
    };

    const fetchOpenAiOauthStatus = async () => {
      try {
        const status = await accomplish.getOpenAiOauthStatus();
        setOpenAiOauthStatus(status);
      } catch (err) {
        console.error('Failed to fetch OpenAI OAuth status:', err);
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

    fetchKeys();
    fetchDebugSetting();
    fetchVersion();
    fetchOpenAiBaseUrl();
    fetchOpenAiOauthStatus();
    fetchSelectedModel();
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
      try {
        await accomplish.setSelectedModel(newSelection);
        setSelectedModel(newSelection);
        setModelStatusMessage(`Model updated to ${model.displayName}`);
      } catch (err) {
        console.error('Failed to save model selection:', err);
      }
    }
  };

  const handleSaveApiKey = async () => {
    const accomplish = getAccomplish();
    const trimmedKey = apiKey.trim();
    const currentProvider = API_KEY_PROVIDERS.find((p) => p.id === provider)!;

    if (!trimmedKey) {
      setError('Please enter an API key.');
      return;
    }

    if (!trimmedKey.startsWith(currentProvider.prefix)) {
      setError(`Invalid API key format. Key should start with ${currentProvider.prefix}`);
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatusMessage(null);

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

  const handleSaveOpenAiBaseUrl = async () => {
    const accomplish = getAccomplish();
    const trimmed = openAiBaseUrl.trim();

    setIsSavingOpenAiBaseUrl(true);
    setError(null);
    setStatusMessage(null);

    try {
      await accomplish.setOpenAiBaseUrl(trimmed);
      setOpenAiBaseUrl(trimmed);
      setStatusMessage(trimmed ? 'OpenAI base URL saved.' : 'OpenAI base URL cleared.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save OpenAI base URL.';
      setError(message);
    } finally {
      setIsSavingOpenAiBaseUrl(false);
    }
  };

  const handleLoginOpenAiWithChatGpt = async () => {
    const accomplish = getAccomplish();
    setIsSigningInWithChatGpt(true);
    setError(null);
    setStatusMessage(null);
    try {
      await accomplish.loginOpenAiWithChatGpt();
      const status = await accomplish.getOpenAiOauthStatus();
      setOpenAiOauthStatus(status);
      if (status.connected) {
        setStatusMessage('ChatGPT sign-in successful.');
        onApiKeySaved?.();
      } else {
        setStatusMessage('ChatGPT sign-in started. Complete it in your browser.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign in with ChatGPT.';
      setError(message);
    } finally {
      setIsSigningInWithChatGpt(false);
    }
  };

  const handleDeleteApiKey = async (id: string, providerName: string) => {
    const accomplish = getAccomplish();
    const providerConfig = API_KEY_PROVIDERS.find((p) => p.id === providerName);
    try {
      await accomplish.removeApiKey(id);
      setSavedKeys((prev) => prev.filter((k) => k.id !== id));
      setStatusMessage(`${providerConfig?.name || providerName} API key removed.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove API key.';
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {/* API Key Section */}
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
                  {COMING_SOON_PROVIDERS.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-dashed border-muted-foreground/30 p-4 text-center opacity-60 cursor-not-allowed"
                    >
                      <div className="font-medium text-muted-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground/70 mt-1">Coming Soon</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* API Key Input */}
              <div className="mb-5">
                <label className="mb-2.5 block text-sm font-medium text-foreground">
                  {API_KEY_PROVIDERS.find((p) => p.id === provider)?.name} API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={API_KEY_PROVIDERS.find((p) => p.id === provider)?.placeholder}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                {provider === 'openrouter' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uses the OpenAI-compatible endpoint at <span className="font-mono">https://openrouter.ai/api/v1</span>. Select an OpenAI model below.
                  </p>
                )}
              </div>

              {/* OpenAI Base URL Override (for OpenRouter / proxies) */}
              {provider === 'openai' && (
                <div className="mb-5">
                  <label className="mb-2.5 block text-sm font-medium text-foreground">
                    OpenAI Base URL (optional)
                  </label>
                  <input
                    type="text"
                    value={openAiBaseUrl}
                    onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Leave blank for OpenAI. Set to <span className="font-mono">https://openrouter.ai/api/v1</span> for OpenRouter.
                    </p>
                    <button
                      type="button"
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                      onClick={handleSaveOpenAiBaseUrl}
                      disabled={isSavingOpenAiBaseUrl}
                    >
                      {isSavingOpenAiBaseUrl ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {/* ChatGPT OAuth Sign-in (OpenAI) */}
              {provider === 'openai' && (
                <div className="mb-5 rounded-xl border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">Sign in with ChatGPT</div>
                      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                        Use your ChatGPT Pro/Plus subscription via OAuth (no API key). This opens your browser for authorization.
                      </p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Status:{' '}
                        <span className="font-medium text-foreground">
                          {openAiOauthStatus?.connected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                      onClick={handleLoginOpenAiWithChatGpt}
                      disabled={isSigningInWithChatGpt}
                    >
                      {isSigningInWithChatGpt ? 'Signing in...' : 'Sign in'}
                    </button>
                  </div>
                </div>
              )}

              {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
              {statusMessage && (
                <p className="mb-4 text-sm text-success">{statusMessage}</p>
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
                          <button
                            onClick={() => handleDeleteApiKey(key.id, key.provider)}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 ease-accomplish"
                            title="Remove API key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Model Selection Section */}
          <section>
            <h2 className="mb-4 text-base font-medium text-foreground">Model</h2>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                Select the AI model to use for task execution.
              </p>
              {loadingModel ? (
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              ) : (
                <select
                  value={selectedModel?.model || ''}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey).map((provider) => {
                    const hasOpenAiAccess = savedKeys.some((k) => k.provider === 'openai' || k.provider === 'openrouter') || Boolean(openAiOauthStatus?.connected);
                    const hasApiKey = provider.id === 'openai' ? hasOpenAiAccess : savedKeys.some((k) => k.provider === provider.id);
                    return (
                      <optgroup key={provider.id} label={provider.name}>
                        {provider.models.map((model) => (
                          <option
                            key={model.fullId}
                            value={model.fullId}
                            disabled={!hasApiKey}
                          >
                            {model.displayName}{!hasApiKey ? (provider.id === 'openai' ? ' (No API key / ChatGPT sign-in)' : ' (No API key)') : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}
              {modelStatusMessage && (
                <p className="mt-3 text-sm text-success">{modelStatusMessage}</p>
              )}
              {selectedModel && !(
                selectedModel.provider === 'openai'
                  ? (savedKeys.some((k) => k.provider === 'openai' || k.provider === 'openrouter') || Boolean(openAiOauthStatus?.connected))
                  : savedKeys.some((k) => k.provider === selectedModel.provider)
              ) && (
                <p className="mt-3 text-sm text-warning">
                  {selectedModel.provider === 'openai'
                    ? 'No API key or ChatGPT sign-in configured for '
                    : 'No API key configured for '}
                  {DEFAULT_PROVIDERS.find((p) => p.id === selectedModel.provider)?.name}. Add one above to use this model.
                </p>
              )}
            </div>
          </section>

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
                <div className="mt-4 rounded-xl bg-warning/10 p-3.5">
                  <p className="text-sm text-warning">
                    Debug mode is enabled. Backend logs will appear in the task view
                    when running tasks.
                  </p>
                </div>
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
