# Amazon Bedrock Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Amazon Bedrock as a cloud provider with dual authentication (Access Keys + AWS Profile) and Claude 4.5 models.

**Architecture:** Extend existing multi-provider system. Bedrock credentials stored as JSON in secure storage. UI adds a Bedrock button that opens a tabbed form for auth method selection. Validation uses AWS SDK to call ListFoundationModels.

**Tech Stack:** TypeScript, React, Electron, @aws-sdk/client-bedrock, Playwright for E2E tests

---

## Task 1: Add Bedrock Types to Shared Package

**Files:**
- Modify: `packages/shared/src/types/provider.ts`
- Modify: `packages/shared/src/types/auth.ts`

**Step 1: Add 'bedrock' to ProviderType union**

In `packages/shared/src/types/provider.ts`, update line 5:

```typescript
export type ProviderType = 'anthropic' | 'openai' | 'google' | 'xai' | 'ollama' | 'custom' | 'bedrock';
```

**Step 2: Add Bedrock provider to DEFAULT_PROVIDERS array**

After the xai provider block (around line 151), add:

```typescript
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    requiresApiKey: false, // Uses AWS credentials
    models: [
      {
        id: 'anthropic.claude-opus-4-5-20251101-v1:0',
        displayName: 'Claude Opus 4.5',
        provider: 'bedrock',
        fullId: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        displayName: 'Claude Sonnet 4.5',
        provider: 'bedrock',
        fullId: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0',
        contextWindow: 200000,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        displayName: 'Claude Haiku 4.5',
        provider: 'bedrock',
        fullId: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
        contextWindow: 200000,
        supportsVision: true,
      },
    ],
  },
```

**Step 3: Add Bedrock credential types to auth.ts**

In `packages/shared/src/types/auth.ts`, add after line 37:

```typescript
export interface BedrockAccessKeyCredentials {
  authType: 'accessKeys';
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface BedrockProfileCredentials {
  authType: 'profile';
  profileName: string;
  region: string;
}

export type BedrockCredentials = BedrockAccessKeyCredentials | BedrockProfileCredentials;
```

**Step 4: Update ApiKeyConfig provider union**

In `packages/shared/src/types/auth.ts`, update line 31:

```typescript
  provider: 'anthropic' | 'openai' | 'google' | 'xai' | 'custom' | 'bedrock';
```

**Step 5: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS (or only unrelated warnings)

**Step 6: Commit**

```bash
git add packages/shared/src/types/provider.ts packages/shared/src/types/auth.ts
git commit -m "feat(shared): add Bedrock provider types and models"
```

---

## Task 2: Add Bedrock to Secure Storage

**Files:**
- Modify: `apps/desktop/src/main/store/secureStorage.ts`

**Step 1: Update ApiKeyProvider type**

In `apps/desktop/src/main/store/secureStorage.ts`, update line 187:

```typescript
export type ApiKeyProvider = 'anthropic' | 'openai' | 'google' | 'xai' | 'custom' | 'bedrock';
```

**Step 2: Update getAllApiKeys function**

Replace the `getAllApiKeys` function (lines 192-202) with:

```typescript
export async function getAllApiKeys(): Promise<Record<ApiKeyProvider, string | null>> {
  const [anthropic, openai, google, xai, custom, bedrock] = await Promise.all([
    getApiKey('anthropic'),
    getApiKey('openai'),
    getApiKey('google'),
    getApiKey('xai'),
    getApiKey('custom'),
    getApiKey('bedrock'),
  ]);

  return { anthropic, openai, google, xai, custom, bedrock };
}
```

**Step 3: Add helper functions for Bedrock credentials**

Add after the `getAllApiKeys` function:

```typescript
/**
 * Store Bedrock credentials (JSON stringified)
 */
export function storeBedrockCredentials(credentials: string): void {
  storeApiKey('bedrock', credentials);
}

/**
 * Get Bedrock credentials (returns parsed object or null)
 */
export function getBedrockCredentials(): Record<string, string> | null {
  const stored = getApiKey('bedrock');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}
```

**Step 4: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/main/store/secureStorage.ts
git commit -m "feat(storage): add Bedrock to secure storage"
```

---

## Task 3: Install AWS SDK and Add Bedrock Validation Handler

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src/main/ipc/handlers.ts`

**Step 1: Install AWS SDK**

Run: `pnpm -F @accomplish/desktop add @aws-sdk/client-bedrock @aws-sdk/credential-providers`

**Step 2: Add imports to handlers.ts**

Add at the top of `apps/desktop/src/main/ipc/handlers.ts` (after line 1):

```typescript
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import { fromIni } from '@aws-sdk/credential-providers';
```

**Step 3: Update ALLOWED_API_KEY_PROVIDERS**

Update line 77:

```typescript
const ALLOWED_API_KEY_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'xai', 'custom', 'bedrock']);
```

**Step 4: Add Bedrock validation handler**

Add after the `api-key:validate-provider` handler (around line 866):

```typescript
  // Bedrock: Validate AWS credentials
  handle('bedrock:validate', async (_event: IpcMainInvokeEvent, credentials: string) => {
    console.log('[Bedrock] Validation requested');

    try {
      const parsed = JSON.parse(credentials);
      let client: BedrockClient;

      if (parsed.authType === 'accessKeys') {
        // Access key authentication
        client = new BedrockClient({
          region: parsed.region || 'us-east-1',
          credentials: {
            accessKeyId: parsed.accessKeyId,
            secretAccessKey: parsed.secretAccessKey,
          },
        });
      } else if (parsed.authType === 'profile') {
        // AWS Profile authentication
        client = new BedrockClient({
          region: parsed.region || 'us-east-1',
          credentials: fromIni({ profile: parsed.profileName || 'default' }),
        });
      } else {
        return { valid: false, error: 'Invalid authentication type' };
      }

      // Test by listing foundation models
      const command = new ListFoundationModelsCommand({});
      await client.send(command);

      console.log('[Bedrock] Validation succeeded');
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      console.warn('[Bedrock] Validation failed:', message);

      // Provide user-friendly error messages
      if (message.includes('UnrecognizedClientException') || message.includes('InvalidSignatureException')) {
        return { valid: false, error: 'Invalid AWS credentials. Please check your Access Key ID and Secret Access Key.' };
      }
      if (message.includes('AccessDeniedException')) {
        return { valid: false, error: 'Access denied. Ensure your AWS credentials have Bedrock permissions.' };
      }
      if (message.includes('could not be found')) {
        return { valid: false, error: 'AWS profile not found. Check your ~/.aws/credentials file.' };
      }

      return { valid: false, error: message };
    }
  });

  // Bedrock: Save credentials
  handle('bedrock:save', async (_event: IpcMainInvokeEvent, credentials: string) => {
    const parsed = JSON.parse(credentials);

    // Validate structure
    if (parsed.authType === 'accessKeys') {
      if (!parsed.accessKeyId || !parsed.secretAccessKey) {
        throw new Error('Access Key ID and Secret Access Key are required');
      }
    } else if (parsed.authType === 'profile') {
      if (!parsed.profileName) {
        throw new Error('Profile name is required');
      }
    } else {
      throw new Error('Invalid authentication type');
    }

    // Store the credentials
    storeApiKey('bedrock', credentials);

    return {
      id: 'local-bedrock',
      provider: 'bedrock',
      label: parsed.authType === 'accessKeys' ? 'AWS Access Keys' : `AWS Profile: ${parsed.profileName}`,
      keyPrefix: parsed.authType === 'accessKeys' ? `${parsed.accessKeyId.substring(0, 8)}...` : parsed.profileName,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  });

  // Bedrock: Get credentials
  handle('bedrock:get-credentials', async (_event: IpcMainInvokeEvent) => {
    const stored = getApiKey('bedrock');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });
```

**Step 5: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/src/main/ipc/handlers.ts
git commit -m "feat(handlers): add Bedrock validation and credential handlers"
```

---

## Task 4: Update OpenCode Adapter for Bedrock Environment Variables

**Files:**
- Modify: `apps/desktop/src/main/opencode/adapter.ts`

**Step 1: Import getBedrockCredentials**

Add to imports around line 27:

```typescript
import { getBedrockCredentials } from '../store/secureStorage';
```

**Step 2: Add Bedrock environment variables in buildEnvironment**

After the xai block (around line 379), add:

```typescript
    // Set Bedrock credentials if configured
    const bedrockCredentials = getBedrockCredentials();
    if (bedrockCredentials) {
      if (bedrockCredentials.authType === 'accessKeys') {
        env.AWS_ACCESS_KEY_ID = bedrockCredentials.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = bedrockCredentials.secretAccessKey;
        console.log('[OpenCode CLI] Using Bedrock Access Key credentials');
      } else if (bedrockCredentials.authType === 'profile') {
        env.AWS_PROFILE = bedrockCredentials.profileName;
        console.log('[OpenCode CLI] Using Bedrock AWS Profile:', bedrockCredentials.profileName);
      }
      if (bedrockCredentials.region) {
        env.AWS_REGION = bedrockCredentials.region;
        console.log('[OpenCode CLI] Using Bedrock region:', bedrockCredentials.region);
      }
    }
```

**Step 3: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/main/opencode/adapter.ts
git commit -m "feat(adapter): set AWS environment variables for Bedrock"
```

---

## Task 5: Add Bedrock IPC Methods to Preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts`

**Step 1: Add Bedrock methods to contextBridge**

Find the `accomplish` object in contextBridge.exposeInMainWorld and add these methods:

```typescript
    // Bedrock
    validateBedrockCredentials: (credentials: string) =>
      ipcRenderer.invoke('bedrock:validate', credentials),
    saveBedrockCredentials: (credentials: string) =>
      ipcRenderer.invoke('bedrock:save', credentials),
    getBedrockCredentials: () =>
      ipcRenderer.invoke('bedrock:get-credentials'),
```

**Step 2: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat(preload): expose Bedrock IPC methods"
```

---

## Task 6: Add Bedrock Methods to Renderer Accomplish Lib

**Files:**
- Modify: `apps/desktop/src/renderer/lib/accomplish.ts`

**Step 1: Add Bedrock type definitions**

Add near the top with other interfaces:

```typescript
export interface BedrockCredentials {
  authType: 'accessKeys' | 'profile';
  accessKeyId?: string;
  secretAccessKey?: string;
  profileName?: string;
  region: string;
}
```

**Step 2: Add Bedrock methods to the accomplish API wrapper**

Add these methods to the returned object:

```typescript
  validateBedrockCredentials: async (credentials: BedrockCredentials): Promise<{ valid: boolean; error?: string }> => {
    return window.accomplish.validateBedrockCredentials(JSON.stringify(credentials));
  },

  saveBedrockCredentials: async (credentials: BedrockCredentials): Promise<ApiKeyConfig> => {
    return window.accomplish.saveBedrockCredentials(JSON.stringify(credentials));
  },

  getBedrockCredentials: async (): Promise<BedrockCredentials | null> => {
    return window.accomplish.getBedrockCredentials();
  },
```

**Step 3: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/accomplish.ts
git commit -m "feat(renderer): add Bedrock methods to accomplish API"
```

---

## Task 7: Update SettingsDialog UI - Add Bedrock Provider Button

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

**Step 1: Add Bedrock to API_KEY_PROVIDERS**

Update the `API_KEY_PROVIDERS` constant (around line 24) to add Bedrock:

```typescript
const API_KEY_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', prefix: 'sk-', placeholder: 'sk-...' },
  { id: 'google', name: 'Google AI', prefix: 'AIza', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', prefix: 'xai-', placeholder: 'xai-...' },
  { id: 'bedrock', name: 'Amazon Bedrock', prefix: '', placeholder: '' },
] as const;
```

**Step 2: Add Bedrock-specific state variables**

After line 55 (keyToDelete state), add:

```typescript
  const [bedrockAuthTab, setBedrockAuthTab] = useState<'accessKeys' | 'profile'>('accessKeys');
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('');
  const [bedrockSecretKey, setBedrockSecretKey] = useState('');
  const [bedrockProfileName, setBedrockProfileName] = useState('default');
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');
  const [savingBedrock, setSavingBedrock] = useState(false);
  const [bedrockError, setBedrockError] = useState<string | null>(null);
  const [bedrockStatus, setBedrockStatus] = useState<string | null>(null);
```

**Step 3: Add useEffect to load existing Bedrock credentials**

In the useEffect that runs when `open` changes, add a fetch for Bedrock credentials:

```typescript
    const fetchBedrockCredentials = async () => {
      try {
        const credentials = await accomplish.getBedrockCredentials();
        if (credentials) {
          setBedrockAuthTab(credentials.authType);
          if (credentials.authType === 'accessKeys') {
            setBedrockAccessKeyId(credentials.accessKeyId || '');
            // Don't pre-fill secret key for security
          } else {
            setBedrockProfileName(credentials.profileName || 'default');
          }
          setBedrockRegion(credentials.region || 'us-east-1');
        }
      } catch (err) {
        console.error('Failed to fetch Bedrock credentials:', err);
      }
    };
```

And call `fetchBedrockCredentials();` in the useEffect.

**Step 4: Commit progress**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): add Bedrock state and provider button"
```

---

## Task 8: Add Bedrock Credential Form to SettingsDialog

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

**Step 1: Add handleSaveBedrockCredentials function**

Add after the other handler functions:

```typescript
  const handleSaveBedrockCredentials = async () => {
    const accomplish = getAccomplish();
    setSavingBedrock(true);
    setBedrockError(null);
    setBedrockStatus(null);

    try {
      const credentials = bedrockAuthTab === 'accessKeys'
        ? {
            authType: 'accessKeys' as const,
            accessKeyId: bedrockAccessKeyId.trim(),
            secretAccessKey: bedrockSecretKey.trim(),
            region: bedrockRegion.trim() || 'us-east-1',
          }
        : {
            authType: 'profile' as const,
            profileName: bedrockProfileName.trim() || 'default',
            region: bedrockRegion.trim() || 'us-east-1',
          };

      // Validate credentials
      const validation = await accomplish.validateBedrockCredentials(credentials);
      if (!validation.valid) {
        setBedrockError(validation.error || 'Invalid credentials');
        setSavingBedrock(false);
        return;
      }

      // Save credentials
      const savedKey = await accomplish.saveBedrockCredentials(credentials);
      setBedrockStatus('Amazon Bedrock credentials saved successfully.');
      setSavedKeys((prev) => {
        const filtered = prev.filter((k) => k.provider !== 'bedrock');
        return [...filtered, savedKey];
      });

      // Clear sensitive fields
      setBedrockSecretKey('');
      onApiKeySaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save credentials.';
      setBedrockError(message);
    } finally {
      setSavingBedrock(false);
    }
  };
```

**Step 2: Add Bedrock credential form JSX**

In the API Key Section, after the provider selection grid and before the API key input, add a conditional render for Bedrock:

```tsx
              {/* Bedrock Credentials Form */}
              {provider === 'bedrock' && (
                <div className="mb-5">
                  {/* Auth Type Tabs */}
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setBedrockAuthTab('accessKeys')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        bedrockAuthTab === 'accessKeys'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Access Keys
                    </button>
                    <button
                      onClick={() => setBedrockAuthTab('profile')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        bedrockAuthTab === 'profile'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      AWS Profile
                    </button>
                  </div>

                  {bedrockAuthTab === 'accessKeys' ? (
                    <>
                      <div className="mb-4">
                        <label className="mb-2.5 block text-sm font-medium text-foreground">
                          Access Key ID
                        </label>
                        <input
                          data-testid="bedrock-access-key-input"
                          type="text"
                          value={bedrockAccessKeyId}
                          onChange={(e) => setBedrockAccessKeyId(e.target.value)}
                          placeholder="AKIA..."
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="mb-2.5 block text-sm font-medium text-foreground">
                          Secret Access Key
                        </label>
                        <input
                          data-testid="bedrock-secret-key-input"
                          type="password"
                          value={bedrockSecretKey}
                          onChange={(e) => setBedrockSecretKey(e.target.value)}
                          placeholder="Enter your secret access key"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="mb-4">
                      <label className="mb-2.5 block text-sm font-medium text-foreground">
                        Profile Name
                      </label>
                      <input
                        data-testid="bedrock-profile-input"
                        type="text"
                        value={bedrockProfileName}
                        onChange={(e) => setBedrockProfileName(e.target.value)}
                        placeholder="default"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="mb-2.5 block text-sm font-medium text-foreground">
                      Region
                    </label>
                    <input
                      data-testid="bedrock-region-input"
                      type="text"
                      value={bedrockRegion}
                      onChange={(e) => setBedrockRegion(e.target.value)}
                      placeholder="us-east-1"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  {bedrockError && <p className="mb-4 text-sm text-destructive">{bedrockError}</p>}
                  {bedrockStatus && <p className="mb-4 text-sm text-success">{bedrockStatus}</p>}

                  <button
                    data-testid="bedrock-save-button"
                    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    onClick={handleSaveBedrockCredentials}
                    disabled={savingBedrock}
                  >
                    {savingBedrock ? 'Validating...' : 'Save Bedrock Credentials'}
                  </button>
                </div>
              )}
```

**Step 3: Hide standard API key input when Bedrock is selected**

Wrap the existing API Key Input div with a condition:

```tsx
              {/* API Key Input - hide for Bedrock */}
              {provider !== 'bedrock' && (
                <div className="mb-5">
                  ...existing API key input code...
                </div>
              )}
```

And similarly for the Save API Key button.

**Step 4: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): add Bedrock credential form with tabs"
```

---

## Task 9: Add Bedrock to Model Dropdown

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`

**Step 1: Update model dropdown to include Bedrock models**

The model dropdown already iterates over `DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey)`. Since Bedrock has `requiresApiKey: false`, we need to update the filter.

Change line 337:

```tsx
                      {DEFAULT_PROVIDERS.filter((p) => p.requiresApiKey || p.id === 'bedrock').map((provider) => {
```

**Step 2: Update hasApiKey check for Bedrock**

Update the hasApiKey logic to check for Bedrock credentials:

```tsx
                        const hasApiKey = provider.id === 'bedrock'
                          ? savedKeys.some((k) => k.provider === 'bedrock')
                          : savedKeys.some((k) => k.provider === provider.id);
```

**Step 3: Run TypeScript check**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Test manually**

Run: `pnpm dev`
- Open Settings
- Click Amazon Bedrock provider
- Verify tabs appear for Access Keys and AWS Profile
- Verify form fields work
- Verify Bedrock models appear in dropdown when credentials saved

**Step 5: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): add Bedrock models to dropdown"
```

---

## Task 10: Add E2E Tests for Bedrock Settings

**Files:**
- Create: `apps/desktop/e2e/specs/settings-bedrock.spec.ts`
- Modify: `apps/desktop/e2e/pages/settings.page.ts`

**Step 1: Update SettingsPage with Bedrock selectors**

Add to `apps/desktop/e2e/pages/settings.page.ts`:

```typescript
  get bedrockProviderButton() {
    return this.page.locator('button:has-text("Amazon Bedrock")');
  }

  get bedrockAccessKeysTab() {
    return this.page.locator('button:has-text("Access Keys")');
  }

  get bedrockProfileTab() {
    return this.page.locator('button:has-text("AWS Profile")');
  }

  get bedrockAccessKeyInput() {
    return this.page.getByTestId('bedrock-access-key-input');
  }

  get bedrockSecretKeyInput() {
    return this.page.getByTestId('bedrock-secret-key-input');
  }

  get bedrockProfileInput() {
    return this.page.getByTestId('bedrock-profile-input');
  }

  get bedrockRegionInput() {
    return this.page.getByTestId('bedrock-region-input');
  }

  get bedrockSaveButton() {
    return this.page.getByTestId('bedrock-save-button');
  }

  async selectBedrockProvider() {
    await this.bedrockProviderButton.click();
  }

  async selectBedrockAccessKeysTab() {
    await this.bedrockAccessKeysTab.click();
  }

  async selectBedrockProfileTab() {
    await this.bedrockProfileTab.click();
  }
```

**Step 2: Create Bedrock E2E test file**

Create `apps/desktop/e2e/specs/settings-bedrock.spec.ts`:

```typescript
import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Amazon Bedrock', () => {
  test('should display Bedrock provider button', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await expect(settingsPage.bedrockProviderButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'provider-button-visible',
      ['Bedrock provider button is visible', 'User can select Bedrock']
    );
  });

  test('should show Bedrock credential form when selected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    // Verify Access Keys tab is visible (default)
    await expect(settingsPage.bedrockAccessKeysTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockProfileTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'credential-form-visible',
      ['Bedrock credential form is visible', 'Auth tabs are shown']
    );
  });

  test('should switch between Access Keys and Profile tabs', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    // Default is Access Keys - verify inputs
    await expect(settingsPage.bedrockAccessKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockSecretKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Switch to Profile tab
    await settingsPage.selectBedrockProfileTab();
    await expect(settingsPage.bedrockProfileInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockAccessKeyInput).not.toBeVisible();

    // Switch back to Access Keys
    await settingsPage.selectBedrockAccessKeysTab();
    await expect(settingsPage.bedrockAccessKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-bedrock',
      'tab-switching',
      ['Can switch between auth tabs', 'Form fields update correctly']
    );
  });

  test('should allow typing in Bedrock access key fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    const testAccessKey = 'AKIAIOSFODNN7EXAMPLE';
    const testSecretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const testRegion = 'us-west-2';

    await settingsPage.bedrockAccessKeyInput.fill(testAccessKey);
    await settingsPage.bedrockSecretKeyInput.fill(testSecretKey);
    await settingsPage.bedrockRegionInput.clear();
    await settingsPage.bedrockRegionInput.fill(testRegion);

    await expect(settingsPage.bedrockAccessKeyInput).toHaveValue(testAccessKey);
    await expect(settingsPage.bedrockSecretKeyInput).toHaveValue(testSecretKey);
    await expect(settingsPage.bedrockRegionInput).toHaveValue(testRegion);

    await captureForAI(
      window,
      'settings-bedrock',
      'access-key-fields-filled',
      ['Access key fields accept input', 'Region field works']
    );
  });

  test('should allow typing in Bedrock profile fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();
    await settingsPage.selectBedrockProfileTab();

    const testProfile = 'my-aws-profile';
    const testRegion = 'eu-west-1';

    await settingsPage.bedrockProfileInput.clear();
    await settingsPage.bedrockProfileInput.fill(testProfile);
    await settingsPage.bedrockRegionInput.clear();
    await settingsPage.bedrockRegionInput.fill(testRegion);

    await expect(settingsPage.bedrockProfileInput).toHaveValue(testProfile);
    await expect(settingsPage.bedrockRegionInput).toHaveValue(testRegion);

    await captureForAI(
      window,
      'settings-bedrock',
      'profile-fields-filled',
      ['Profile field accepts input', 'Region field works']
    );
  });

  test('should have save button for Bedrock credentials', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectBedrockProvider();

    await expect(settingsPage.bedrockSaveButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.bedrockSaveButton).toHaveText('Save Bedrock Credentials');

    await captureForAI(
      window,
      'settings-bedrock',
      'save-button-visible',
      ['Save button is visible', 'Button text is correct']
    );
  });
});
```

**Step 3: Run E2E tests**

Run: `pnpm -F @accomplish/desktop test:e2e`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/desktop/e2e/pages/settings.page.ts apps/desktop/e2e/specs/settings-bedrock.spec.ts
git commit -m "test(e2e): add Bedrock settings E2E tests"
```

---

## Task 11: Final Integration and Build Test

**Step 1: Run full type check**

Run: `pnpm typecheck`
Expected: PASS

**Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS (or minor warnings only)

**Step 3: Run build**

Run: `pnpm build`
Expected: PASS

**Step 4: Run all E2E tests**

Run: `pnpm -F @accomplish/desktop test:e2e`
Expected: All tests pass

**Step 5: Manual testing**

Run: `pnpm dev`
1. Open Settings
2. Select Amazon Bedrock provider
3. Enter test AWS credentials
4. Click Save (expect validation error for invalid creds)
5. Select Bedrock model from dropdown
6. Verify model selection persists

**Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete Amazon Bedrock provider integration"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `packages/shared/src/types/provider.ts` | Add 'bedrock' to ProviderType, add Bedrock models |
| `packages/shared/src/types/auth.ts` | Add BedrockCredentials types |
| `apps/desktop/src/main/store/secureStorage.ts` | Add 'bedrock' to ApiKeyProvider |
| `apps/desktop/src/main/ipc/handlers.ts` | Add bedrock:validate, bedrock:save handlers |
| `apps/desktop/src/main/opencode/adapter.ts` | Set AWS env vars for Bedrock |
| `apps/desktop/src/preload/index.ts` | Expose Bedrock IPC methods |
| `apps/desktop/src/renderer/lib/accomplish.ts` | Add Bedrock API methods |
| `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx` | Add Bedrock UI with tabs |
| `apps/desktop/e2e/pages/settings.page.ts` | Add Bedrock selectors |
| `apps/desktop/e2e/specs/settings-bedrock.spec.ts` | New E2E tests |
| `apps/desktop/package.json` | Add @aws-sdk/client-bedrock |

## Dependencies Added

- `@aws-sdk/client-bedrock` - AWS Bedrock API client
- `@aws-sdk/credential-providers` - For AWS profile authentication
