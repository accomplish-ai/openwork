import type { TaskErrorCategory, TaskErrorDetails } from '../common/types/task.js';

export interface TaskErrorClassifierInput {
  errorName?: string;
  statusCode?: number;
  message?: string;
  raw?: string;
  providerID?: string;
  isAuthError?: boolean;
  modelID?: string;
}

const PROVIDER_ID_ALIASES: Record<string, string> = {
  gemini: 'gemini',
  google: 'gemini',
  'google-ai-studio': 'gemini',
  openai: 'openai',
  anthropic: 'anthropic',
  bedrock: 'bedrock',
  'aws-bedrock': 'bedrock',
  'azure-foundry': 'azure-foundry',
  azure: 'azure-foundry',
  openrouter: 'openrouter',
  ollama: 'ollama',
  lmstudio: 'lmstudio',
};

function normalizeProviderId(providerId?: string): string | undefined {
  if (!providerId) {
    return undefined;
  }
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_ID_ALIASES[normalized] || normalized;
}

function inferProviderFromText(text: string): string | undefined {
  if (/\bopenai\b/.test(text)) return 'openai';
  if (/\b(gemini|google|google ai studio)\b/.test(text)) return 'gemini';
  if (/\b(anthropic|claude)\b/.test(text)) return 'anthropic';
  if (/\b(bedrock|aws bedrock)\b/.test(text)) return 'bedrock';
  if (/\b(azure foundry|azure)\b/.test(text)) return 'azure-foundry';
  if (/\bopenrouter\b/.test(text)) return 'openrouter';
  if (/\bollama\b/.test(text)) return 'ollama';
  if (/\b(lm studio|lmstudio)\b/.test(text)) return 'lmstudio';
  return undefined;
}

function providerDisplayName(providerId?: string): string {
  switch (providerId) {
    case 'openai':
      return 'OpenAI';
    case 'gemini':
      return 'Gemini';
    case 'anthropic':
      return 'Anthropic';
    case 'bedrock':
      return 'AWS Bedrock';
    case 'azure-foundry':
      return 'Azure Foundry';
    case 'openrouter':
      return 'OpenRouter';
    case 'ollama':
      return 'Ollama';
    case 'lmstudio':
      return 'LM Studio';
    default:
      return 'Provider API';
  }
}

function parseStatusCodeFromText(text: string): number | undefined {
  const statusPatterns = [
    /\bstatus(?:Code)?["':=\s]*(\d{3})\b/i,
    /\bhttp(?:\s+status)?["':=\s]*(\d{3})\b/i,
    /\b(\d{3})\s+(?:resource_exhausted|too many requests|unauthorized|forbidden)\b/i,
  ];

  for (const pattern of statusPatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function classifyFromSignals(
  text: string,
  statusCode: number | undefined,
  input: TaskErrorClassifierInput
): TaskErrorCategory {
  const hasQuotaSignal =
    /(insufficient_quota|resource_exhausted|quota (?:limit|exceeded)|quota exceeded|billing|hard limit|usage limit|credit balance)/i.test(text);
  const hasRateLimitSignal =
    /(rate limit|too many requests|throttl(?:e|ing)|retry after)/i.test(text);
  const hasAuthSignal =
    /(invalid_api_key|incorrect api key|unauthorized|forbidden|authentication|token.*expired|oauth)/i.test(text);
  const hasModelNotFoundSignal =
    /(modelnotfounderror|model.*not found|model.*not available|resourcenotfoundexception.*model|model does not exist)/i.test(text);
  const hasValidationSignal =
    /(validation|invalid request|bad request|invalid parameter)/i.test(text);
  const hasProviderUnavailableSignal =
    /(service unavailable|temporarily unavailable|overloaded|gateway timeout|timeout|timed out|connection refused|internal server error)/i.test(text);

  if (input.isAuthError || statusCode === 401 || statusCode === 403) {
    return 'auth';
  }
  if (hasAuthSignal) {
    return 'auth';
  }

  if (hasQuotaSignal) {
    return 'quota';
  }

  if (statusCode === 429 || hasRateLimitSignal) {
    return hasQuotaSignal ? 'quota' : 'rate_limit';
  }

  if (statusCode === 404 && hasModelNotFoundSignal) {
    return 'model_not_found';
  }
  if (hasModelNotFoundSignal) {
    return 'model_not_found';
  }

  if (statusCode === 400 || hasValidationSignal) {
    return 'validation';
  }

  if (
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    hasProviderUnavailableSignal
  ) {
    return 'provider_unavailable';
  }

  return 'unknown';
}

function buildUserMessage(
  category: TaskErrorCategory,
  providerName: string,
  modelID?: string,
  fallbackMessage?: string,
  errorName?: string,
  statusCode?: number
): string {
  switch (category) {
    case 'quota':
      return `${providerName} quota limit reached. Check your billing/quota and try again.`;
    case 'rate_limit':
      if (fallbackMessage) {
        if (/rate limit exceeded/i.test(fallbackMessage)) {
          return fallbackMessage;
        }
        return `Rate limit exceeded: ${fallbackMessage}`;
      }
      return 'Rate limit exceeded. Please wait and retry.';
    case 'auth':
      if (errorName?.toLowerCase().includes('oauth')) {
        return fallbackMessage || 'Your session has expired. Please re-authenticate.';
      }
      if (fallbackMessage && !/authentication failed/i.test(fallbackMessage)) {
        return fallbackMessage;
      }
      return `Authentication failed for ${providerName}. Please update credentials in Settings.`;
    case 'model_not_found':
      return modelID
        ? `Model not available: ${modelID}. Select a different model.`
        : 'Model not available. Select a different model.';
    case 'validation':
      return fallbackMessage
        ? `Invalid request: ${fallbackMessage}`
        : 'Invalid request. Please check input and try again.';
    case 'provider_unavailable':
      return 'Service temporarily unavailable. Please retry shortly.';
    default: {
      if (!fallbackMessage || /^task failed$/i.test(fallbackMessage.trim())) {
        if (errorName) {
          return `Error: ${errorName}`;
        }
        return 'Task failed due to an unknown error. Please retry.';
      }
      if (statusCode && statusCode >= 400) {
        return `API error (${statusCode}): ${fallbackMessage}`;
      }
      return fallbackMessage;
    }
  }
}

function buildActionHints(category: TaskErrorCategory): string[] {
  switch (category) {
    case 'quota':
      return [
        'Check provider quota/billing in your account.',
        'Retry later or switch to another provider/model in Settings.',
      ];
    case 'rate_limit':
      return [
        'Wait briefly and retry.',
        'Switch to another provider/model if this persists.',
      ];
    case 'auth':
      return [
        'Re-authenticate or update credentials in Settings.',
        'Retry after credentials are fixed.',
      ];
    case 'model_not_found':
      return [
        'Select a different model in Settings.',
        'Confirm model availability for your provider and region.',
      ];
    case 'validation':
      return [
        'Review input and try again.',
        'Retry with a simpler prompt or another model.',
      ];
    case 'provider_unavailable':
      return [
        'Retry in a few minutes.',
        'Use another provider/model if outage continues.',
      ];
    default:
      return [
        'Retry the task.',
        'Check logs for technical details if the issue persists.',
      ];
  }
}

export function classifyTaskError(input: TaskErrorClassifierInput): TaskErrorDetails {
  const text = `${input.errorName || ''} ${input.message || ''} ${input.raw || ''}`.toLowerCase();
  const providerId =
    normalizeProviderId(input.providerID) || normalizeProviderId(inferProviderFromText(text));
  const statusCode = input.statusCode ?? parseStatusCodeFromText(text);
  const category = classifyFromSignals(text, statusCode, input);
  const providerName = providerDisplayName(providerId);
  const userMessage = buildUserMessage(
    category,
    providerName,
    input.modelID,
    input.message,
    input.errorName,
    statusCode
  );

  return {
    category,
    providerId,
    statusCode,
    retryable: category !== 'auth' && category !== 'model_not_found' && category !== 'validation',
    userMessage,
    actionHints: buildActionHints(category),
  };
}
