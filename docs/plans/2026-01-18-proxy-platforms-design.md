# Proxy Platforms Tab Design

## Overview

Add a third "Proxy Platforms" tab to the Settings dialog that supports routing services like OpenRouter and LiteLLM (future). These platforms differ from direct cloud providers by offering dynamic model lists fetched at runtime.

## Tab Structure

```
┌─────────────────┬──────────────────┬───────────────────┐
│ Cloud Providers │   Local Models   │  Proxy Platforms  │
└─────────────────┴──────────────────┴───────────────────┘
```

### Proxy Platforms Tab Contents

- Platform selector buttons: OpenRouter (active), LiteLLM (coming soon - disabled)
- When OpenRouter selected:
  - If no API key: Show API key input form
  - If API key exists: Show "Connected" status + Fetch Models button

## OpenRouter Flow

1. User selects "OpenRouter" platform button
2. Check if OpenRouter API key exists
   - NO KEY: Show API key input form
   - HAS KEY: Show "Connected" status + Fetch button
3. User clicks "Fetch Models"
   - Show loading spinner
   - Call `GET https://openrouter.ai/api/v1/models`
4. Display models grouped by provider with search:
   - Groups: Anthropic, OpenAI, Meta, Google, etc.
   - Search box filters in real-time
5. User selects model and clicks "Use This Model"

### Selected Model Storage

```typescript
SelectedModel: {
  provider: 'openrouter',
  model: 'openrouter/anthropic/claude-3.5-sonnet'
}
```

## Technical Implementation

### New IPC Handler

```typescript
// In handlers.ts
handle('openrouter:fetch-models', async (_event, apiKey: string) => {
  // Fetch from https://openrouter.ai/api/v1/models
  // Return: { success: true, models: OpenRouterModel[] }
  // Or: { success: false, error: string }
});
```

### Data Structures

```typescript
interface OpenRouterModel {
  id: string;           // "anthropic/claude-3.5-sonnet"
  name: string;         // "Claude 3.5 Sonnet"
  provider: string;     // "anthropic" (extracted from id)
  contextLength: number;
}

interface GroupedModels {
  [provider: string]: OpenRouterModel[];
}
```

### Files to Modify

| File | Change |
|------|--------|
| `handlers.ts` | Add `openrouter:fetch-models` IPC handler |
| `preload/index.ts` | Expose `fetchOpenRouterModels()` method |
| `lib/accomplish.ts` | Add typed wrapper for new IPC |
| `SettingsDialog.tsx` | Add "Proxy Platforms" tab + OpenRouter UI |
| `provider.ts` | Remove hardcoded OpenRouter models from `DEFAULT_PROVIDERS` |
| `config-generator.ts` | Dynamically generate OpenRouter models from selection |

### What Stays the Same

- API key storage (already works for `openrouter`)
- API key validation (already calls `/api/v1/models`)
- `SelectedModel` structure

## Error Handling

| Scenario | Handling |
|----------|----------|
| Invalid/expired API key | Show error: "Invalid API key. Please check and try again." |
| Network timeout | Show error: "Connection timed out. Check your internet." |
| OpenRouter API down | Show error: "Could not reach OpenRouter. Try again later." |
| Empty model list | Show message: "No models available." |

### Edge Cases

| Case | Behavior |
|------|----------|
| User deletes OpenRouter API key | Reset to "Enter API key" state, clear cached models |
| User switches tabs mid-fetch | Cancel fetch, reset loading state |
| Model list is very long (200+) | Search box filters in real-time |
| Previously selected model no longer available | Show warning, prompt to select new model |

### Caching Strategy

- Cache fetched models in component state (not persisted)
- User can click "Refresh" to re-fetch
- Models re-fetched each time dialog opens (ensures fresh list)

## Future: LiteLLM

- Show as disabled button with "Coming soon" badge
- No implementation needed yet
- Will follow similar pattern: API endpoint + dynamic model fetch
