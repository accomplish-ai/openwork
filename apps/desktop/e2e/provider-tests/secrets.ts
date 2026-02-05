import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ProviderSecrets = {
  apiKey: string;
  region?: string;
};

export type ProviderTestSecrets = {
  taskPrompt: string;
  providers: {
    openai?: ProviderSecrets;
    google?: ProviderSecrets;
    'bedrock-api-key'?: ProviderSecrets;
  };
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function tryLoadFromFile(): ProviderTestSecrets | null {
  const secretsPath = path.join(__dirname, 'secrets.json');
  if (!fs.existsSync(secretsPath)) {
    return null;
  }

  const raw = fs.readFileSync(secretsPath, 'utf8');
  const parsed = JSON.parse(raw) as ProviderTestSecrets;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid provider test secrets: expected object');
  }
  if (!isNonEmptyString(parsed.taskPrompt)) {
    throw new Error('Invalid provider test secrets: missing taskPrompt');
  }
  if (!parsed.providers || typeof parsed.providers !== 'object') {
    throw new Error('Invalid provider test secrets: missing providers');
  }

  return parsed;
}

function tryLoadFromEnv(): ProviderTestSecrets | null {
  const openaiKey = process.env.E2E_OPENAI_API_KEY;
  const googleKey = process.env.E2E_GOOGLE_API_KEY;
  const bedrockKey = process.env.E2E_BEDROCK_API_KEY;

  const hasAnyKey = isNonEmptyString(openaiKey) || isNonEmptyString(googleKey) || isNonEmptyString(bedrockKey);
  if (!hasAnyKey) {
    return null;
  }

  const taskPrompt = process.env.E2E_PROVIDER_TEST_TASK_PROMPT?.trim() || "Say 'Hello from E2E test' and nothing else.";
  const region = process.env.E2E_BEDROCK_REGION?.trim() || 'eu-north-1';

  return {
    taskPrompt,
    providers: {
      ...(isNonEmptyString(openaiKey) ? { openai: { apiKey: openaiKey } } : {}),
      ...(isNonEmptyString(googleKey) ? { google: { apiKey: googleKey } } : {}),
      ...(isNonEmptyString(bedrockKey) ? { 'bedrock-api-key': { apiKey: bedrockKey, region } } : {}),
    },
  };
}

/**
 * Load provider test secrets from either:
 * - `secrets.json` (gitignored), or
 * - environment variables (`E2E_*`)
 */
export function loadProviderTestSecrets(): ProviderTestSecrets {
  const fromFile = tryLoadFromFile();
  if (fromFile) {
    return fromFile;
  }

  const fromEnv = tryLoadFromEnv();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error(
    'Provider test secrets not found. Create e2e/provider-tests/secrets.json from secrets.example.json or set E2E_OPENAI_API_KEY / E2E_GOOGLE_API_KEY / E2E_BEDROCK_API_KEY.'
  );
}

