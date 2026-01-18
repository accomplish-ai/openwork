# Vertex AI Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Cloud Vertex AI as a provider option, enabling users to access Claude models through their GCP credentials.

**Architecture:** Follow the established Bedrock provider pattern. Support Service Account JSON and Application Default Credentials (ADC) authentication. Store credentials securely using the existing encrypted storage system.

**Tech Stack:** TypeScript, React, Electron, @google-cloud/aiplatform SDK, Playwright for E2E tests.

---

## Task 1: Add Dependencies

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Add Google Cloud AI Platform SDK**

Add to `dependencies` section in `apps/desktop/package.json`:

```json
"@google-cloud/aiplatform": "^3.34.0"
```

**Step 2: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed successfully

**Step 3: Verify installation**

Run: `pnpm -F @accomplish/desktop exec -- node -e "require('@google-cloud/aiplatform')"`
Expected: No errors (module loads)

**Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: add @google-cloud/aiplatform dependency for Vertex AI support"
```

---

## Task 2: Add Vertex AI Types to Shared Package

**Files:**
- Modify: `packages/shared/src/types/auth.ts`
- Modify: `packages/shared/src/types/provider.ts`

**Step 1: Add credential types to auth.ts**

Add after the `BedrockCredentials` type definition (around line 53):

```typescript
export interface VertexAIServiceAccountCredentials {
  authType: 'serviceAccount';
  projectId: string;
  location: string;
  serviceAccountKey: string; // JSON string of service account key
}

export interface VertexAIADCCredentials {
  authType: 'adc';
  projectId: string;
  location: string;
}

export type VertexAICredentials = VertexAIServiceAccountCredentials | VertexAIADCCredentials;
```

**Step 2: Add 'vertex-ai' to ProviderType in provider.ts**

Modify line 5 in `provider.ts`:

```typescript
export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'ollama' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'vertex-ai';
```

**Step 3: Add Vertex AI provider to DEFAULT_PROVIDERS**

Add after the Bedrock provider entry (around line 258) in `provider.ts`:

```typescript
  {
    id: 'vertex-ai',
    name: 'Google Vertex AI',
    requiresApiKey: false, // Uses GCP credentials
    models: [
      {
        id: 'claude-opus-4-5@20251101',
        displayName: 'Claude Opus 4.5',
        provider: 'vertex-ai',
        fullId: 'vertex-ai/claude-opus-4-5@20251101',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-sonnet-4-5@20250929',
        displayName: 'Claude Sonnet 4.5',
        provider: 'vertex-ai',
        fullId: 'vertex-ai/claude-sonnet-4-5@20250929',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'claude-haiku-4-5@20251001',
        displayName: 'Claude Haiku 4.5',
        provider: 'vertex-ai',
        fullId: 'vertex-ai/claude-haiku-4-5@20251001',
        contextWindow: 200000,
        supportsVision: true,
      },
    ],
  },
```

**Step 4: Run typecheck to verify**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 5: Commit**

```bash
git add packages/shared/src/types/auth.ts packages/shared/src/types/provider.ts
git commit -m "feat(shared): add Vertex AI credential types and provider definition"
```

---

## Task 3: Add Secure Storage Functions

**Files:**
- Modify: `apps/desktop/src/main/store/secureStorage.ts`

**Step 1: Add 'vertex-ai' to ApiKeyProvider type**

Modify line 190:

```typescript
export type ApiKeyProvider = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'vertex-ai';
```

**Step 2: Update getAllApiKeys to include vertex-ai**

Modify the `getAllApiKeys` function (around line 195):

```typescript
export async function getAllApiKeys(): Promise<Record<ApiKeyProvider, string | null>> {
  const [anthropic, openai, openrouter, google, xai, deepseek, zai, custom, bedrock, vertexAi] = await Promise.all([
    getApiKey('anthropic'),
    getApiKey('openai'),
    getApiKey('openrouter'),
    getApiKey('google'),
    getApiKey('xai'),
    getApiKey('deepseek'),
    getApiKey('zai'),
    getApiKey('custom'),
    getApiKey('bedrock'),
    getApiKey('vertex-ai'),
  ]);

  return { anthropic, openai, openrouter, google, xai, deepseek, zai, custom, bedrock, 'vertex-ai': vertexAi };
}
```

**Step 3: Add Vertex AI credential functions**

Add after `getBedrockCredentials` function (around line 229):

```typescript
/**
 * Store Vertex AI credentials (JSON stringified)
 */
export function storeVertexAICredentials(credentials: string): void {
  storeApiKey('vertex-ai', credentials);
}

/**
 * Get Vertex AI credentials (returns parsed object or null)
 */
export function getVertexAICredentials(): Record<string, string> | null {
  const stored = getApiKey('vertex-ai');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 5: Commit**

```bash
git add apps/desktop/src/main/store/secureStorage.ts
git commit -m "feat(storage): add Vertex AI credential storage functions"
```

---

## Task 4: Add IPC Handlers

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts`

**Step 1: Add imports for Vertex AI SDK**

Add after the Bedrock imports (around line 72):

```typescript
import { VertexAI } from '@google-cloud/vertexai';
```

**Step 2: Add 'vertex-ai' to ALLOWED_API_KEY_PROVIDERS**

Modify line 82:

```typescript
const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai', 'custom', 'bedrock', 'vertex-ai']);
```

**Step 3: Update settings:api-keys handler for Vertex AI**

In the `settings:api-keys` handler (around line 687), add Vertex AI handling after Bedrock handling:

```typescript
        // Handle Vertex AI specially - it stores JSON credentials
        if (provider === 'vertex-ai') {
          try {
            const parsed = JSON.parse(credential.password);
            if (parsed.authType === 'serviceAccount') {
              keyPrefix = `Project: ${parsed.projectId?.substring(0, 12) || ''}...`;
            } else if (parsed.authType === 'adc') {
              keyPrefix = `ADC: ${parsed.projectId || 'default'}`;
            }
          } catch {
            keyPrefix = 'GCP Credentials';
          }
        }
```

Also update the return label for Vertex AI:

```typescript
          label: provider === 'bedrock' ? 'AWS Credentials' : provider === 'vertex-ai' ? 'GCP Credentials' : 'Local API Key',
```

**Step 4: Add vertex-ai:validate handler**

Add after the `bedrock:get-credentials` handler (around line 1041):

```typescript
  // Vertex AI: Validate GCP credentials
  handle('vertex-ai:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Vertex AI] Validation requested');

    try {
      const parsed = JSON.parse(credentials);
      const { projectId, location } = parsed;

      if (!projectId) {
        return { valid: false, error: 'Project ID is required' };
      }

      if (!location) {
        return { valid: false, error: 'Location is required' };
      }

      let vertexAI: VertexAI;

      if (parsed.authType === 'serviceAccount') {
        // Service Account authentication
        if (!parsed.serviceAccountKey) {
          return { valid: false, error: 'Service Account Key is required' };
        }

        let serviceAccountJson;
        try {
          serviceAccountJson = JSON.parse(parsed.serviceAccountKey);
        } catch {
          return { valid: false, error: 'Invalid Service Account Key JSON format' };
        }

        vertexAI = new VertexAI({
          project: projectId,
          location: location,
          googleAuthOptions: {
            credentials: serviceAccountJson,
          },
        });
      } else if (parsed.authType === 'adc') {
        // Application Default Credentials
        vertexAI = new VertexAI({
          project: projectId,
          location: location,
        });
      } else {
        return { valid: false, error: 'Invalid authentication type' };
      }

      // Test by getting a generative model (this validates credentials)
      const model = vertexAI.getGenerativeModel({ model: 'gemini-1.0-pro' });
      // Just verify we can create the model - no actual API call needed
      if (!model) {
        return { valid: false, error: 'Failed to initialize Vertex AI client' };
      }

      console.log('[Vertex AI] Validation succeeded');
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      console.warn('[Vertex AI] Validation failed:', message);

      // Provide user-friendly error messages
      if (message.includes('Could not load the default credentials')) {
        return { valid: false, error: 'Application Default Credentials not found. Run: gcloud auth application-default login' };
      }
      if (message.includes('Permission denied') || message.includes('403')) {
        return { valid: false, error: 'Permission denied. Ensure your credentials have Vertex AI permissions.' };
      }
      if (message.includes('invalid_grant') || message.includes('Invalid JWT')) {
        return { valid: false, error: 'Invalid service account credentials. Check your JSON key.' };
      }

      return { valid: false, error: message };
    }
  });

  // Vertex AI: Save credentials
  handle('vertex-ai:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    // Validate structure
    if (!parsed.projectId) {
      throw new Error('Project ID is required');
    }
    if (!parsed.location) {
      throw new Error('Location is required');
    }

    if (parsed.authType === 'serviceAccount') {
      if (!parsed.serviceAccountKey) {
        throw new Error('Service Account Key is required');
      }
      // Validate JSON format
      try {
        JSON.parse(parsed.serviceAccountKey);
      } catch {
        throw new Error('Invalid Service Account Key JSON format');
      }
    } else if (parsed.authType !== 'adc') {
      throw new Error('Invalid authentication type');
    }

    // Store the credentials
    storeApiKey('vertex-ai', credentials);

    return {
      id: 'local-vertex-ai',
      provider: 'vertex-ai',
      label: parsed.authType === 'serviceAccount' ? 'Service Account' : `ADC: ${parsed.projectId}`,
      keyPrefix: `Project: ${parsed.projectId.substring(0, 12)}...`,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  // Vertex AI: Get credentials
  handle('vertex-ai:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('vertex-ai');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
```

**Step 5: Add import for storeApiKey if not already imported**

The `storeApiKey` should already be imported. Verify the import at line 31 includes it.

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 7: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts
git commit -m "feat(ipc): add Vertex AI credential validation and storage handlers"
```

---

## Task 5: Add Preload IPC Bridges

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add 'vertex-ai' to addApiKey provider type**

Modify line 45:

```typescript
  addApiKey: (
    provider: 'anthropic' | 'openai' | 'openrouter' | 'google' | 'xai' | 'deepseek' | 'zai' | 'custom' | 'bedrock' | 'vertex-ai',
    key: string,
    label?: string
  ): Promise<unknown> =>
```

**Step 2: Add Vertex AI IPC bridges**

Add after the Bedrock bridges (around line 126):

```typescript
  // Vertex AI
  validateVertexAICredentials: (credentials: string): Promise<{ valid: boolean; error?: string }> =>
    ipcRenderer.invoke('vertex-ai:validate', credentials),
  saveVertexAICredentials: (credentials: string): Promise<unknown> =>
    ipcRenderer.invoke('vertex-ai:save', credentials),
  getVertexAICredentials: (): Promise<Record<string, string> | null> =>
    ipcRenderer.invoke('vertex-ai:get-credentials'),
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 4: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat(preload): add Vertex AI IPC bridges"
```

---

## Task 6: Add Renderer API Wrapper

**Files:**
- Modify: `apps/desktop/src/renderer/lib/accomplish.ts`

**Step 1: Add Vertex AI methods to AccomplishAPI interface**

First read the file to understand its structure, then add the Vertex AI methods in the appropriate section.

Add after the Bedrock methods:

```typescript
  validateVertexAICredentials: (credentials: VertexAICredentials) => Promise<{ valid: boolean; error?: string }>;
  saveVertexAICredentials: (credentials: VertexAICredentials) => Promise<ApiKeyConfig>;
  getVertexAICredentials: () => Promise<VertexAICredentials | null>;
```

**Step 2: Add implementation in getAccomplish()**

Add after the Bedrock implementations:

```typescript
    validateVertexAICredentials: async (credentials) => {
      return window.accomplish.validateVertexAICredentials(JSON.stringify(credentials));
    },
    saveVertexAICredentials: async (credentials) => {
      return window.accomplish.saveVertexAICredentials(JSON.stringify(credentials)) as Promise<ApiKeyConfig>;
    },
    getVertexAICredentials: async () => {
      return window.accomplish.getVertexAICredentials() as Promise<VertexAICredentials | null>;
    },
```

**Step 3: Add import for VertexAICredentials type**

Add to the imports from `@accomplish/shared`:

```typescript
import type { VertexAICredentials } from '@accomplish/shared';
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/lib/accomplish.ts
git commit -m "feat(renderer): add Vertex AI API wrapper methods"
```

---

## Task 7: Update OpenCode Adapter for Vertex AI Environment

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Add import for getVertexAICredentials**

Modify line 11 to include `getVertexAICredentials`:

```typescript
import { getAllApiKeys, getBedrockCredentials, getVertexAICredentials } from '../store/secureStorage';
```

**Step 2: Add Vertex AI environment setup in buildEnvironment()**

Add after the Bedrock environment setup (around line 414):

```typescript
    // Set Vertex AI credentials if configured
    const vertexCredentials = getVertexAICredentials();
    if (vertexCredentials) {
      env.GOOGLE_CLOUD_PROJECT = vertexCredentials.projectId;
      env.GOOGLE_CLOUD_LOCATION = vertexCredentials.location;
      console.log('[OpenCode CLI] Using Vertex AI project:', vertexCredentials.projectId);
      console.log('[OpenCode CLI] Using Vertex AI location:', vertexCredentials.location);

      if (vertexCredentials.authType === 'serviceAccount' && vertexCredentials.serviceAccountKey) {
        // Write service account key to temp file
        const keyPath = path.join(app.getPath('temp'), 'vertex-ai-key.json');
        fs.writeFileSync(keyPath, vertexCredentials.serviceAccountKey, { mode: 0o600 });
        env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
        console.log('[OpenCode CLI] Using Vertex AI Service Account credentials');
      } else {
        console.log('[OpenCode CLI] Using Vertex AI ADC credentials');
      }
    }
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(adapter): add Vertex AI environment variable setup"
```

---

## Task 8: Update Config Generator

**Files:**
- Modify: `apps/desktop/src/main/opencode/config-generator.ts`

**Step 1: Add import for VertexAICredentials**

Add to the imports from `@accomplish/shared` (around line 7):

```typescript
import type { BedrockCredentials, VertexAICredentials } from '@accomplish/shared';
```

**Step 2: Add VertexAIProviderConfig interface**

Add after `BedrockProviderConfig` interface (around line 352):

```typescript
interface VertexAIProviderConfig {
  options: {
    projectId: string;
    location: string;
  };
}
```

**Step 3: Update ProviderConfig type**

Modify line 368:

```typescript
type ProviderConfig = OllamaProviderConfig | BedrockProviderConfig | OpenRouterProviderConfig | VertexAIProviderConfig;
```

**Step 4: Add 'vertex-ai' to baseProviders**

Modify line 410:

```typescript
  const baseProviders = ['anthropic', 'openai', 'openrouter', 'google', 'xai', 'deepseek', 'zai-coding-plan', 'amazon-bedrock', 'vertex-ai'];
```

**Step 5: Add Vertex AI provider configuration**

Add after the Bedrock provider configuration (around line 496):

```typescript
  // Add Vertex AI provider configuration if credentials are stored
  const vertexAICredsJson = getApiKey('vertex-ai');
  if (vertexAICredsJson) {
    try {
      const creds = JSON.parse(vertexAICredsJson) as VertexAICredentials;

      providerConfig['vertex-ai'] = {
        options: {
          projectId: creds.projectId,
          location: creds.location,
        },
      };

      console.log('[OpenCode Config] Vertex AI provider configured:', {
        projectId: creds.projectId,
        location: creds.location,
      });
    } catch (e) {
      console.warn('[OpenCode Config] Failed to parse Vertex AI credentials:', e);
    }
  }
```

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 7: Commit**

```bash
git add apps/desktop/src/main/opencode/config-generator.ts
git commit -m "feat(config): add Vertex AI provider configuration generation"
```

---

## Task 9: Add Settings UI for Vertex AI

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

**Step 1: Add Vertex AI to API_KEY_PROVIDERS**

Add after the Bedrock entry (around line 33):

```typescript
  { id: 'vertex-ai', name: 'Google Vertex AI', prefix: '', placeholder: '' },
```

**Step 2: Add Vertex AI state variables**

Add after the Bedrock state variables (around line 83):

```typescript
  // Vertex AI state
  const [vertexAuthTab, setVertexAuthTab] = useState<'serviceAccount' | 'adc'>('serviceAccount');
  const [vertexProjectId, setVertexProjectId] = useState('');
  const [vertexLocation, setVertexLocation] = useState('us-central1');
  const [vertexServiceAccountKey, setVertexServiceAccountKey] = useState('');
  const [savingVertex, setSavingVertex] = useState(false);
  const [vertexError, setVertexError] = useState<string | null>(null);
  const [vertexStatus, setVertexStatus] = useState<string | null>(null);
```

**Step 3: Add Vertex AI locations constant**

Add after the OPENROUTER_PROVIDER_PRIORITY constant (around line 50):

```typescript
// Vertex AI locations that support Claude models
const VERTEX_AI_LOCATIONS = [
  { id: 'us-central1', name: 'Iowa (us-central1)' },
  { id: 'us-east4', name: 'N. Virginia (us-east4)' },
  { id: 'europe-west1', name: 'Belgium (europe-west1)' },
  { id: 'europe-west4', name: 'Netherlands (europe-west4)' },
];
```

**Step 4: Add fetchVertexAICredentials in useEffect**

Add after `fetchBedrockCredentials` call (around line 187):

```typescript
    const fetchVertexAICredentials = async () => {
      try {
        const credentials = await accomplish.getVertexAICredentials();
        if (credentials) {
          setVertexAuthTab(credentials.authType);
          setVertexProjectId(credentials.projectId || '');
          setVertexLocation(credentials.location || 'us-central1');
          // Don't pre-fill service account key for security
        }
      } catch (err) {
        console.error('Failed to fetch Vertex AI credentials:', err);
      }
    };

    fetchVertexAICredentials();
```

**Step 5: Add handleSaveVertexAICredentials function**

Add after `handleSaveBedrockCredentials` (around line 389):

```typescript
  const handleSaveVertexAICredentials = async () => {
    const accomplish = getAccomplish();
    setSavingVertex(true);
    setVertexError(null);
    setVertexStatus(null);

    try {
      const credentials = vertexAuthTab === 'serviceAccount'
        ? {
            authType: 'serviceAccount' as const,
            projectId: vertexProjectId.trim(),
            location: vertexLocation.trim() || 'us-central1',
            serviceAccountKey: vertexServiceAccountKey.trim(),
          }
        : {
            authType: 'adc' as const,
            projectId: vertexProjectId.trim(),
            location: vertexLocation.trim() || 'us-central1',
          };

      // Validate credentials
      const validation = await accomplish.validateVertexAICredentials(credentials);
      if (!validation.valid) {
        setVertexError(validation.error || 'Invalid credentials');
        setSavingVertex(false);
        return;
      }

      // Save credentials
      const savedKey = await accomplish.saveVertexAICredentials(credentials);
      setVertexStatus('Google Vertex AI credentials saved successfully.');
      setSavedKeys((prev) => {
        const filtered = prev.filter((k) => k.provider !== 'vertex-ai');
        return [...filtered, savedKey];
      });

      // Clear sensitive fields
      setVertexServiceAccountKey('');
      onApiKeySaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save credentials.';
      setVertexError(message);
    } finally {
      setSavingVertex(false);
    }
  };
```

**Step 6: Add Vertex AI form UI**

Add after the Bedrock credentials form (around line 1040), inside the `{provider !== 'bedrock' && ...}` condition, add a similar condition for Vertex AI. Replace that section with:

```typescript
                {/* Bedrock Credentials Form */}
                {provider === 'bedrock' && (
                  // ... existing Bedrock form ...
                )}

                {/* Vertex AI Credentials Form */}
                {provider === 'vertex-ai' && (
                  <div className="mb-5">
                    {/* Auth Type Tabs */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setVertexAuthTab('serviceAccount')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${vertexAuthTab === 'serviceAccount'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        Service Account
                      </button>
                      <button
                        onClick={() => setVertexAuthTab('adc')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${vertexAuthTab === 'adc'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        ADC (gcloud)
                      </button>
                    </div>

                    <div className="mb-4">
                      <label className="mb-2.5 block text-sm font-medium text-foreground">
                        Project ID
                      </label>
                      <input
                        data-testid="vertex-project-id-input"
                        type="text"
                        value={vertexProjectId}
                        onChange={(e) => setVertexProjectId(e.target.value)}
                        placeholder="my-gcp-project"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="mb-2.5 block text-sm font-medium text-foreground">
                        Location
                      </label>
                      <select
                        data-testid="vertex-location-select"
                        value={vertexLocation}
                        onChange={(e) => setVertexLocation(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {VERTEX_AI_LOCATIONS.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {vertexAuthTab === 'serviceAccount' && (
                      <div className="mb-4">
                        <label className="mb-2.5 block text-sm font-medium text-foreground">
                          Service Account Key (JSON)
                        </label>
                        <textarea
                          data-testid="vertex-service-account-input"
                          value={vertexServiceAccountKey}
                          onChange={(e) => setVertexServiceAccountKey(e.target.value)}
                          placeholder='{"type": "service_account", "project_id": "...", ...}'
                          rows={6}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    )}

                    {vertexAuthTab === 'adc' && (
                      <div className="mb-4 rounded-lg bg-muted p-3">
                        <p className="text-sm text-muted-foreground">
                          Using Application Default Credentials. Make sure you have run:
                        </p>
                        <code className="mt-2 block text-xs bg-background p-2 rounded">
                          gcloud auth application-default login
                        </code>
                      </div>
                    )}

                    {vertexError && <p className="mb-4 text-sm text-destructive">{vertexError}</p>}
                    {vertexStatus && <p className="mb-4 text-sm text-success">{vertexStatus}</p>}

                    <button
                      data-testid="vertex-save-button"
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      onClick={handleSaveVertexAICredentials}
                      disabled={savingVertex}
                    >
                      {savingVertex ? 'Validating...' : 'Save Vertex AI Credentials'}
                    </button>
                  </div>
                )}

                {/* API Key Input - hide for Bedrock and Vertex AI */}
                {provider !== 'bedrock' && provider !== 'vertex-ai' && (
```

**Step 7: Update the condition for showing API key input**

Change `{provider !== 'bedrock' && (` to `{provider !== 'bedrock' && provider !== 'vertex-ai' && (`

**Step 8: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 9: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(ui): add Vertex AI credentials form in settings"
```

---

## Task 10: Add E2E Test Page Object Locators

**Files:**
- Modify: `apps/desktop/e2e/pages/settings.page.ts`

**Step 1: Add Vertex AI locators**

Add after the Bedrock locators (around line 78):

```typescript
  // Vertex AI
  get vertexProviderButton() {
    return this.page.locator('button:has-text("Google Vertex AI")');
  }

  get vertexServiceAccountTab() {
    return this.page.locator('button:has-text("Service Account")');
  }

  get vertexADCTab() {
    return this.page.locator('button:has-text("ADC (gcloud)")');
  }

  get vertexProjectIdInput() {
    return this.page.getByTestId('vertex-project-id-input');
  }

  get vertexLocationSelect() {
    return this.page.getByTestId('vertex-location-select');
  }

  get vertexServiceAccountInput() {
    return this.page.getByTestId('vertex-service-account-input');
  }

  get vertexSaveButton() {
    return this.page.getByTestId('vertex-save-button');
  }
```

**Step 2: Add Vertex AI helper methods**

Add after the Bedrock helper methods (around line 167):

```typescript
  async selectVertexProvider() {
    await this.vertexProviderButton.click();
  }

  async selectVertexServiceAccountTab() {
    await this.vertexServiceAccountTab.click();
  }

  async selectVertexADCTab() {
    await this.vertexADCTab.click();
  }
```

**Step 3: Commit**

```bash
git add apps/desktop/e2e/pages/settings.page.ts
git commit -m "test(e2e): add Vertex AI page object locators"
```

---

## Task 11: Create E2E Tests for Vertex AI

**Files:**
- Create: `apps/desktop/e2e/specs/settings-vertex-ai.spec.ts`

**Step 1: Create the E2E test file**

```typescript
import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Google Vertex AI', () => {
  test('should display Vertex AI provider button', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await expect(settingsPage.vertexProviderButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'provider-button-visible',
      ['Vertex AI provider button is visible', 'User can select Vertex AI']
    );
  });

  test('should show Vertex AI credential form when selected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Verify Service Account tab is visible (default)
    await expect(settingsPage.vertexServiceAccountTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexADCTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'credential-form-visible',
      ['Vertex AI credential form is visible', 'Auth tabs are shown']
    );
  });

  test('should switch between Service Account and ADC tabs', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Default is Service Account - verify inputs
    await expect(settingsPage.vertexProjectIdInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexServiceAccountInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Switch to ADC tab
    await settingsPage.selectVertexADCTab();
    await expect(settingsPage.vertexProjectIdInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexServiceAccountInput).not.toBeVisible();

    // Switch back to Service Account
    await settingsPage.selectVertexServiceAccountTab();
    await expect(settingsPage.vertexServiceAccountInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'tab-switching',
      ['Can switch between auth tabs', 'Form fields update correctly']
    );
  });

  test('should allow typing in Vertex AI service account fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    const testProjectId = 'my-test-project';
    const testServiceAccount = '{"type": "service_account", "project_id": "test"}';

    await settingsPage.vertexProjectIdInput.fill(testProjectId);
    await settingsPage.vertexServiceAccountInput.fill(testServiceAccount);

    await expect(settingsPage.vertexProjectIdInput).toHaveValue(testProjectId);
    await expect(settingsPage.vertexServiceAccountInput).toHaveValue(testServiceAccount);

    await captureForAI(
      window,
      'settings-vertex-ai',
      'service-account-fields-filled',
      ['Service account fields accept input', 'Project ID field works']
    );
  });

  test('should allow selecting location', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Change location
    await settingsPage.vertexLocationSelect.selectOption('us-east4');
    await expect(settingsPage.vertexLocationSelect).toHaveValue('us-east4');

    await captureForAI(
      window,
      'settings-vertex-ai',
      'location-selected',
      ['Location dropdown works', 'Can select different regions']
    );
  });

  test('should have save button for Vertex AI credentials', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    await expect(settingsPage.vertexSaveButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexSaveButton).toHaveText('Save Vertex AI Credentials');

    await captureForAI(
      window,
      'settings-vertex-ai',
      'save-button-visible',
      ['Save button is visible', 'Button text is correct']
    );
  });
});
```

**Step 2: Run the E2E tests**

Run: `pnpm -F @accomplish/desktop test:e2e -- --grep "Vertex AI"`
Expected: All tests should pass

**Step 3: Commit**

```bash
git add apps/desktop/e2e/specs/settings-vertex-ai.spec.ts
git commit -m "test(e2e): add Vertex AI settings E2E tests"
```

---

## Task 12: Add Integration Tests for Secure Storage

**Files:**
- Modify: `apps/desktop/__tests__/integration/main/secureStorage.integration.test.ts`

**Step 1: Add Vertex AI credential tests**

Add a new describe block for Vertex AI:

```typescript
describe('Vertex AI credentials', () => {
  it('should store and retrieve Vertex AI service account credentials', async () => {
    const credentials = {
      authType: 'serviceAccount',
      projectId: 'test-project',
      location: 'us-central1',
      serviceAccountKey: '{"type": "service_account", "project_id": "test"}',
    };

    storeVertexAICredentials(JSON.stringify(credentials));
    const retrieved = getVertexAICredentials();

    expect(retrieved).toEqual(credentials);
  });

  it('should store and retrieve Vertex AI ADC credentials', async () => {
    const credentials = {
      authType: 'adc',
      projectId: 'test-project',
      location: 'europe-west1',
    };

    storeVertexAICredentials(JSON.stringify(credentials));
    const retrieved = getVertexAICredentials();

    expect(retrieved).toEqual(credentials);
  });

  it('should return null for missing Vertex AI credentials', () => {
    deleteApiKey('vertex-ai');
    const retrieved = getVertexAICredentials();
    expect(retrieved).toBeNull();
  });
});
```

**Step 2: Add imports**

Add `storeVertexAICredentials` and `getVertexAICredentials` to the imports.

**Step 3: Run integration tests**

Run: `pnpm -F @accomplish/desktop test:integration`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/desktop/__tests__/integration/main/secureStorage.integration.test.ts
git commit -m "test(integration): add Vertex AI secure storage tests"
```

---

## Task 13: Run Full Test Suite and Verify

**Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: All checks pass

**Step 2: Run linting**

Run: `pnpm lint`
Expected: No errors

**Step 3: Run all E2E tests**

Run: `pnpm -F @accomplish/desktop test:e2e`
Expected: All tests pass

**Step 4: Manual verification**

Run: `pnpm dev`
1. Open Settings
2. Select "Google Vertex AI" provider
3. Verify both auth tabs work
4. Verify form fields are functional
5. Verify location dropdown has options

---

## Task 14: Run E2E Tests in Docker

**Step 1: Build and run Docker E2E tests**

Run from `apps/desktop/e2e/docker`:
```bash
docker compose up --build
```

Expected: All E2E tests pass in Docker environment

**Step 2: Commit any Docker-related fixes if needed**

---

## Task 15: Final Commit and Cleanup

**Step 1: Verify all changes are committed**

Run: `git status`
Expected: Clean working tree

**Step 2: Create summary commit if needed**

If there are any uncommitted changes:
```bash
git add -A
git commit -m "chore: cleanup and finalize Vertex AI implementation"
```

**Step 3: Push to remote**

```bash
git push -u origin support-vertex-ai
```

---

## Summary

This plan implements Vertex AI provider support in 15 tasks:

1. Add dependencies
2. Add shared types
3. Add secure storage functions
4. Add IPC handlers
5. Add preload bridges
6. Add renderer API wrapper
7. Update OpenCode adapter
8. Update config generator
9. Add Settings UI
10. Add E2E page object locators
11. Create E2E tests
12. Add integration tests
13. Run full test suite
14. Run Docker E2E tests
15. Final cleanup and push

Each task follows TDD principles where applicable, with frequent commits to maintain a clean git history.
