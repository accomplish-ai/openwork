# LiteLLM UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make LiteLLM model selection UI consistent with OpenRouter and fix dialog not closing after first model selection.

**Architecture:** Update the LiteLLM section in SettingsDialog.tsx to use the same radio button list pattern as OpenRouter, and add the missing `onApiKeySaved?.()` callback call.

**Tech Stack:** React, TypeScript, Tailwind CSS

---

### Task 1: Add Provider Priority Sorting for LiteLLM

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx:38-49`

**Step 1: Add LiteLLM provider priority constant**

Add this constant after `OPENROUTER_PROVIDER_PRIORITY` (around line 49):

```typescript
// Priority order for LiteLLM providers (lower index = higher priority)
const LITELLM_PROVIDER_PRIORITY = [
  'anthropic',
  'openai',
  'google',
  'meta-llama',
  'mistralai',
  'x-ai',
  'deepseek',
  'cohere',
  'perplexity',
  'amazon',
];
```

**Step 2: Verify the change compiles**

Run: `cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): add LiteLLM provider priority sorting constant"
```

---

### Task 2: Update LiteLLM Model List to Use Radio Buttons Like OpenRouter

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx:1100-1127`

**Step 1: Replace the LiteLLM model list with radio button implementation**

Replace the current model list (lines 1100-1127) with this code that matches OpenRouter's pattern:

```typescript
                          {/* Grouped Model List */}
                          <div className="mb-4 max-h-64 overflow-y-auto rounded-md border border-input" data-testid="litellm-model-list">
                            {Object.entries(groupedLitellmModels)
                              .sort(([a], [b]) => {
                                const priorityA = LITELLM_PROVIDER_PRIORITY.indexOf(a);
                                const priorityB = LITELLM_PROVIDER_PRIORITY.indexOf(b);
                                // If both have priority, sort by priority
                                if (priorityA !== -1 && priorityB !== -1) return priorityA - priorityB;
                                // Priority providers come first
                                if (priorityA !== -1) return -1;
                                if (priorityB !== -1) return 1;
                                // Otherwise alphabetical
                                return a.localeCompare(b);
                              })
                              .map(([provider, models]) => (
                                <div key={provider}>
                                  <div className="sticky top-0 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">
                                    {provider}
                                  </div>
                                  {models.map((model) => (
                                    <label
                                      key={model.id}
                                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                                        selectedLitellmModel === model.id ? 'bg-muted' : ''
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name="litellm-model"
                                        value={model.id}
                                        checked={selectedLitellmModel === model.id}
                                        onChange={(e) => setSelectedLitellmModel(e.target.value)}
                                        className="h-4 w-4"
                                        data-testid={`litellm-model-${model.id}`}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-foreground truncate">
                                          {model.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {model.id}
                                        </div>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              ))}
                          </div>
```

**Step 2: Verify the change compiles**

Run: `cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "feat(settings): update LiteLLM model list to use radio buttons matching OpenRouter"
```

---

### Task 3: Fix Dialog Not Closing After First Model Selection

**Files:**
- Modify: `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx:548-581`

**Step 1: Add onApiKeySaved callback to handleSaveLiteLLM**

In the `handleSaveLiteLLM` function, add `onApiKeySaved?.()` after setting the model status message. The function should look like this:

```typescript
  const handleSaveLiteLLM = async () => {
    const accomplish = getAccomplish();
    setSavingLitellm(true);

    try {
      // Save the LiteLLM config
      await accomplish.setLiteLLMConfig({
        baseUrl: litellmUrl,
        enabled: true,
        lastValidated: Date.now(),
        models: litellmModels,
      });

      // Set as selected model
      await accomplish.setSelectedModel({
        provider: 'litellm',
        model: `litellm/${selectedLitellmModel}`,
        baseUrl: litellmUrl,
      });

      setSelectedModel({
        provider: 'litellm',
        model: `litellm/${selectedLitellmModel}`,
        baseUrl: litellmUrl,
      });

      const modelName = litellmModels.find(m => m.id === selectedLitellmModel)?.name || selectedLitellmModel;
      setModelStatusMessage(`Model updated to ${modelName}`);

      // Now that model is selected, trigger the callback to close dialog and execute task
      onApiKeySaved?.();
    } catch (err) {
      setLitellmError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingLitellm(false);
    }
  };
```

**Step 2: Verify the change compiles**

Run: `cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm -F @accomplish/desktop typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/layout/SettingsDialog.tsx
git commit -m "fix(settings): close dialog after LiteLLM model selection during onboarding"
```

---

### Task 4: Update E2E Tests for New LiteLLM Model List Structure

**Files:**
- Modify: `apps/desktop/e2e/specs/settings.spec.ts`

**Step 1: Verify existing E2E tests still pass**

Run: `cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm -F @accomplish/desktop test:e2e --grep "LiteLLM"`
Expected: All tests pass (the selectors should still work with the new structure)

**Step 2: Commit (if any test fixes needed)**

Only commit if tests needed updating:
```bash
git add apps/desktop/e2e/specs/settings.spec.ts
git commit -m "test(e2e): update LiteLLM tests for new model list structure"
```

---

### Task 5: Manual Verification

**Step 1: Start LiteLLM proxy (if not running)**

```bash
docker ps | grep litellm || docker start litellm-test
```

**Step 2: Start the app**

```bash
cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm dev
```

**Step 3: Verify the changes**

1. Open Settings → Proxy Platforms → LiteLLM
2. Connect to `http://localhost:4000`
3. Verify:
   - Models are displayed with radio buttons (not buttons)
   - Models are grouped by provider with sticky headers
   - Each model shows name AND id (like OpenRouter)
   - Anthropic/OpenAI providers appear first (priority sorting)
4. Select a model and click "Use This Model"
5. Verify:
   - Dialog closes automatically
   - Model is set correctly

**Step 4: Run full test suite**

Run: `cd ~/Documents/accomplish/github-repos/openwork.litellm-proxy-integration && pnpm -F @accomplish/desktop test:e2e`
Expected: All tests pass

---

### Task 6: Final Commit and Summary

**Step 1: Verify all changes are committed**

```bash
git status
```
Expected: Clean working directory

**Step 2: View commit log**

```bash
git log --oneline -5
```

Should show commits for:
- Provider priority constant
- Radio button model list
- Dialog close fix
- E2E test updates (if any)
