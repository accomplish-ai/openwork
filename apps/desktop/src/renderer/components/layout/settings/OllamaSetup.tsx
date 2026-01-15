'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { getAccomplish } from '@/lib/accomplish';

interface OllamaModel {
  id: string;
  displayName: string;
  size: number;
}

interface OllamaSetupProps {
  onDone: (modelName: string) => void;
  onBack: () => void;
}

export default function OllamaSetup({ onDone, onBack }: OllamaSetupProps) {
  const { t } = useTranslation();
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');
  const [savingOllama, setSavingOllama] = useState(false);

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
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

    try {
      await accomplish.setOllamaConfig({
        baseUrl: ollamaUrl,
        enabled: true,
        lastValidated: Date.now(),
        models: ollamaModels,
      });

      await accomplish.setSelectedModel({
        provider: 'ollama',
        model: `ollama/${selectedOllamaModel}`,
        baseUrl: ollamaUrl,
      });

      onDone(selectedOllamaModel);
    } catch (err) {
      setOllamaError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingOllama(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">
        {t('settings.model.localModels', 'Local Models')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('settings.model.localDescription', 'Connect to a local Ollama server to use models running on your machine.')}
      </p>

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('settings.model.ollamaUrl', 'Ollama Server URL')}
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
            type="button"
            onClick={handleTestOllama}
            disabled={testingOllama}
            className="rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
          >
            {testingOllama ? t('settings.model.testing', 'Testing...') : t('settings.model.test', 'Test')}
          </button>
        </div>
      </div>

      {ollamaConnected && (
        <div className="flex items-center gap-2 text-sm text-success">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t('settings.model.connected', 'Connected - {{count}} model(s) available', { count: ollamaModels.length })}
        </div>
      )}

      {ollamaError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          {ollamaError}
        </div>
      )}

      {ollamaConnected && ollamaModels.length > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            {t('settings.model.selectModelLabel', 'Select Model')}
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

      {!ollamaConnected && !ollamaError && (
        <p className="text-sm text-muted-foreground">
          {t('settings.model.ollamaHelp', 'Make sure Ollama is installed and running, then click Test to connect.')}{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            Ollama
          </a>
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t('settings.wizard.back', 'Back')}
        </button>
        {ollamaConnected && selectedOllamaModel && (
          <button
            type="button"
            onClick={handleSaveOllama}
            disabled={savingOllama}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {savingOllama ? t('settings.model.saving', 'Saving...') : t('settings.model.useThisModel', 'Use This Model')}
          </button>
        )}
      </div>
    </div>
  );
}
