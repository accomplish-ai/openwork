export type WizardStep =
  | 'choose-type'
  | 'select-provider'
  | 'add-api-key'
  | 'select-model'
  | 'ollama-setup';

export type ModelType = 'cloud' | 'local' | null;

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'xai';

export interface WizardState {
  step: WizardStep;
  modelType: ModelType;
  selectedProvider: ProviderId | null;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  prefix: string;
  placeholder: string;
}

export const API_KEY_PROVIDERS: ProviderConfig[] = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', prefix: 'xai-', placeholder: 'xai-...' },
];
