# Default Models & Dynamic Bedrock Fetching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update default model selections for providers and add dynamic model fetching for AWS Bedrock.

**Architecture:** Part 1 updates a constant in shared types. Part 2 adds a new IPC handler that calls AWS Bedrock's ListFoundationModelsCommand, exposes it through preload/accomplish API, and updates BedrockProviderForm to use fetched models instead of hardcoded list.

**Tech Stack:** TypeScript, Electron IPC, AWS SDK (@aws-sdk/client-bedrock), React

---

## Task 1: Update Default Models Constant

**Files:**
- Modify: `packages/shared/src/types/providerSettings.ts:112-117`

**Step 1: Update the DEFAULT_MODELS constant**

```typescript
export const DEFAULT_MODELS: Partial<Record<ProviderId, string>> = {
  anthropic: 'anthropic/claude-haiku-4-5',
  openai: 'openai/gpt-5-codex',
  google: 'google/gemini-3-pro-preview',
  xai: 'xai/grok-4',
  bedrock: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0',
};
```

**Step 2: Run typecheck to verify**

Run: `pnpm typecheck`
Expected: PASS with no errors

**Step 3: Run unit tests**

Run: `pnpm -F @accomplish/desktop test:unit`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/shared/src/types/providerSettings.ts
git commit -m "feat: update default models - Haiku for Anthropic/Bedrock, Pro for Google"
```

---

## Task 2: Add bedrock:fetch-models IPC Handler

**Files:**
- Modify: `apps/desktop/src/main/ipc/handlers.ts` (after line ~1027, after bedrock:validate)

**Step 1: Add the new IPC handler**

Add after the `bedrock:validate` handler (around line 1027):

```typescript
  // Fetch available Bedrock models
  handle('bedrock:fetch-models', async (_event: IpcMainInvokeEvent, credentialsJson: string) => {
    try {
      const credentials = JSON.parse(credentialsJson) as BedrockCredentials;

      // Create Bedrock client (same pattern as validate)
      let bedrockClient: BedrockClient;
      if (credentials.authType === 'accessKeys') {
        bedrockClient = new BedrockClient({
          region: credentials.region || 'us-east-1',
          credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          },
        });
      } else {
        bedrockClient = new BedrockClient({
          region: credentials.region || 'us-east-1',
          credentials: fromIni({ profile: credentials.profileName }),
        });
      }

      // Fetch all foundation models
      const command = new ListFoundationModelsCommand({});
      const response = await bedrockClient.send(command);

      // Transform to standard format, filtering for text output models
      const models = (response.modelSummaries || [])
        .filter(m => m.outputModalities?.includes('TEXT'))
        .map(m => ({
          id: `amazon-bedrock/${m.modelId}`,
          name: m.modelName || m.modelId || 'Unknown',
          provider: m.providerName || 'Unknown',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, models };
    } catch (error) {
      console.error('[Bedrock] Failed to fetch models:', error);
      return { success: false, error: normalizeIpcError(error), models: [] };
    }
  });
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (BedrockClient and ListFoundationModelsCommand already imported)

**Step 3: Commit**

```bash
git add apps/desktop/src/main/ipc/handlers.ts
git commit -m "feat: add bedrock:fetch-models IPC handler"
```

---

## Task 3: Expose fetchBedrockModels in Preload

**Files:**
- Modify: `apps/desktop/src/preload/index.ts` (around line 130, in accomplish object)

**Step 1: Add fetchBedrockModels to preload**

Find the `accomplish` object in `contextBridge.exposeInMainWorld` and add:

```typescript
    fetchBedrockModels: (credentials: string): Promise<{ success: boolean; models: Array<{ id: string; name: string; provider: string }>; error?: string }> =>
      ipcRenderer.invoke('bedrock:fetch-models', credentials),
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/desktop/src/preload/index.ts
git commit -m "feat: expose fetchBedrockModels in preload"
```

---

## Task 4: Add fetchBedrockModels to Accomplish API

**Files:**
- Modify: `apps/desktop/src/renderer/lib/accomplish.ts` (interface and implementation)

**Step 1: Add to AccomplishAPI interface**

Find the `AccomplishAPI` interface and add:

```typescript
  fetchBedrockModels(credentials: string): Promise<{ success: boolean; models: Array<{ id: string; name: string; provider: string }>; error?: string }>;
```

**Step 2: Add to getAccomplish implementation**

Find the return object in `getAccomplish()` and add:

```typescript
    fetchBedrockModels: (credentials: string) => window.accomplish!.fetchBedrockModels(credentials),
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/desktop/src/renderer/lib/accomplish.ts
git commit -m "feat: add fetchBedrockModels to accomplish API"
```

---

## Task 5: Update BedrockProviderForm to Use Dynamic Models

**Files:**
- Modify: `apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx`

**Step 1: Add imports and state**

Add import for `getDefaultModelForProvider`:

```typescript
import { getDefaultModelForProvider } from '@accomplish/shared';
```

Add state for available models (after other useState calls):

```typescript
const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
```

**Step 2: Remove hardcoded models array**

Delete the hardcoded `models` array (around lines 78-82):

```typescript
// DELETE THIS:
const models = [
  { id: 'amazon-bedrock/anthropic.claude-opus-4-5-20251101-v1:0', name: 'Claude Opus 4.5' },
  { id: 'amazon-bedrock/anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5' },
  { id: 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0', name: 'Claude Haiku 4.5' },
];
```

**Step 3: Update handleConnect to fetch models**

Modify the `handleConnect` function. After successful validation, fetch models and auto-select default:

```typescript
const handleConnect = async () => {
  if (!canConnect) return;
  setLoading(true);
  setError(null);

  try {
    const credentialsJson = JSON.stringify(
      authMethod === 'accessKey'
        ? { authType: 'accessKeys', accessKeyId, secretAccessKey, sessionToken: sessionToken || undefined, region }
        : { authType: 'profile', profileName, region }
    );

    // Validate credentials
    const validationResult = await accomplish.validateBedrockCredentials(credentialsJson);

    if (!validationResult.valid) {
      setError(validationResult.error || 'Invalid credentials');
      setLoading(false);
      return;
    }

    // Save credentials
    await accomplish.saveBedrockCredentials(credentialsJson);

    // Fetch available models
    const modelsResult = await accomplish.fetchBedrockModels(credentialsJson);
    const fetchedModels = modelsResult.success ? modelsResult.models : [];
    setAvailableModels(fetchedModels);

    // Auto-select default model if available in fetched list
    const defaultModelId = getDefaultModelForProvider('bedrock');
    const hasDefaultModel = defaultModelId && fetchedModels.some(m => m.id === defaultModelId);

    // Create connected provider
    const provider: ConnectedProvider = {
      providerId: 'bedrock',
      connectionStatus: 'connected',
      selectedModelId: hasDefaultModel ? defaultModelId : null,
      credentials: {
        type: 'bedrock',
        authMethod,
        region,
        accessKeyIdPrefix: authMethod === 'accessKey' ? accessKeyId.slice(0, 8) : undefined,
        profileName: authMethod === 'profile' ? profileName : undefined,
      },
      lastConnectedAt: new Date().toISOString(),
      availableModels: fetchedModels,
    };

    onConnect(provider);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Connection failed');
  } finally {
    setLoading(false);
  }
};
```

**Step 4: Update ModelSelector to use dynamic models**

Change the ModelSelector `models` prop from hardcoded to dynamic:

```typescript
<ModelSelector
  models={connectedProvider?.availableModels || availableModels}
  value={connectedProvider?.selectedModelId || null}
  onChange={onModelChange}
  error={showModelError && !connectedProvider?.selectedModelId}
/>
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Run unit tests**

Run: `pnpm -F @accomplish/desktop test:unit`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add apps/desktop/src/renderer/components/settings/providers/BedrockProviderForm.tsx
git commit -m "feat: use dynamic model fetching for Bedrock provider"
```

---

## Task 6: Clean Up Hardcoded Bedrock Models in provider.ts (Optional)

**Files:**
- Modify: `packages/shared/src/types/provider.ts:265-294`

**Step 1: Empty the Bedrock models array**

Find the Bedrock entry in `DEFAULT_PROVIDERS` and empty the models array:

```typescript
{
  id: 'bedrock',
  name: 'Amazon Bedrock',
  requiresApiKey: false, // Uses AWS credentials
  models: [], // Now fetched dynamically from AWS API
},
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/shared/src/types/provider.ts
git commit -m "refactor: remove hardcoded Bedrock models (now fetched dynamically)"
```

---

## Task 7: Final Verification

**Step 1: Run full test suite**

Run: `pnpm -F @accomplish/desktop test:unit && pnpm -F @accomplish/desktop test:integration`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Manual testing checklist**

- [ ] Connect Anthropic provider → verify Haiku is auto-selected as default
- [ ] Connect Google provider → verify Gemini Pro is auto-selected as default
- [ ] Connect Bedrock with valid AWS credentials → verify models are fetched from API
- [ ] Verify Bedrock model dropdown shows all available foundation models
- [ ] Verify Bedrock auto-selects Claude Haiku if available in region

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```

**Step 5: Push changes**

```bash
git push
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Update DEFAULT_MODELS constant | `providerSettings.ts` |
| 2 | Add bedrock:fetch-models IPC handler | `handlers.ts` |
| 3 | Expose in preload | `preload/index.ts` |
| 4 | Add to accomplish API | `accomplish.ts` |
| 5 | Update BedrockProviderForm | `BedrockProviderForm.tsx` |
| 6 | Clean up hardcoded models (optional) | `provider.ts` |
| 7 | Final verification | - |
