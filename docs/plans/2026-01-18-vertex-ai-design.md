# Vertex AI Provider Implementation Design

## Overview

Add Google Cloud Vertex AI as a provider option, following the Bedrock implementation pattern. This enables users to access Claude models through Vertex AI using their Google Cloud credentials.

## Authentication Methods

Support two authentication modes:

### 1. Service Account JSON Key
- User pastes or uploads JSON key content
- Stored securely in encrypted storage (same as Bedrock)
- Environment variable: `GOOGLE_APPLICATION_CREDENTIALS` points to temp file with key content

### 2. Application Default Credentials (ADC)
- Uses existing `gcloud auth application-default login` credentials
- No credentials stored in app - relies on user's local gcloud setup
- Simplest for developers already using GCP

## Models

Pre-configure Claude models available on Vertex AI:

| Model | Vertex AI Model ID |
|-------|-------------------|
| Claude Opus 4.5 | `claude-opus-4-5@20251101` |
| Claude Sonnet 4.5 | `claude-sonnet-4-5@20250929` |
| Claude Haiku 4.5 | `claude-haiku-4-5@20251001` |

## File Changes

### 1. Types (`packages/shared/src/types/`)

**auth.ts** - Add Vertex AI credential types:
```typescript
export interface VertexAIServiceAccountCredentials {
  authType: 'serviceAccount';
  projectId: string;
  location: string;
  serviceAccountKey: string; // JSON string
}

export interface VertexAIADCCredentials {
  authType: 'adc';
  projectId: string;
  location: string;
}

export type VertexAICredentials = VertexAIServiceAccountCredentials | VertexAIADCCredentials;
```

**provider.ts** - Add `'vertex-ai'` to `ProviderType` and models to `DEFAULT_PROVIDERS`

### 2. Secure Storage (`src/main/store/secureStorage.ts`)

- Add `'vertex-ai'` to `ApiKeyProvider` type
- Add `storeVertexAICredentials()` and `getVertexAICredentials()` functions

### 3. IPC Handlers (`src/main/ipc/handlers.ts`)

Add handlers:
- `vertex-ai:validate` - Test credentials using `@google-cloud/aiplatform` SDK
- `vertex-ai:save` - Store credentials securely
- `vertex-ai:get-credentials` - Retrieve stored credentials

Validation approach:
```typescript
import { PredictionServiceClient } from '@google-cloud/aiplatform';

// For Service Account:
const client = new PredictionServiceClient({
  credentials: JSON.parse(serviceAccountKey),
  projectId,
});

// For ADC:
const client = new PredictionServiceClient({ projectId });

// Test by listing endpoints or making a minimal predict call
```

### 4. Preload (`src/preload/index.ts`)

Add IPC bridges:
```typescript
validateVertexAICredentials: (credentials: string) =>
  ipcRenderer.invoke('vertex-ai:validate', credentials),
saveVertexAICredentials: (credentials: string) =>
  ipcRenderer.invoke('vertex-ai:save', credentials),
getVertexAICredentials: () =>
  ipcRenderer.invoke('vertex-ai:get-credentials'),
```

### 5. OpenCode Adapter (`src/main/opencode/adapter.ts`)

In `buildEnvironment()`:
```typescript
const vertexCredentials = getVertexAICredentials();
if (vertexCredentials) {
  env.GOOGLE_CLOUD_PROJECT = vertexCredentials.projectId;
  env.GOOGLE_CLOUD_LOCATION = vertexCredentials.location;

  if (vertexCredentials.authType === 'serviceAccount') {
    // Write service account key to temp file
    const keyPath = path.join(app.getPath('temp'), 'vertex-ai-key.json');
    fs.writeFileSync(keyPath, vertexCredentials.serviceAccountKey);
    env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  }
  // For ADC, don't set GOOGLE_APPLICATION_CREDENTIALS - SDK uses default
}
```

### 6. Config Generator (`src/main/opencode/config-generator.ts`)

Add `'vertex-ai'` to `baseProviders` array and generate provider config:
```typescript
if (vertexAICredsJson) {
  const creds = JSON.parse(vertexAICredsJson) as VertexAICredentials;
  providerConfig['vertex-ai'] = {
    options: {
      projectId: creds.projectId,
      location: creds.location,
    },
  };
}
```

### 7. Settings UI (`src/renderer/components/layout/SettingsDialog.tsx`)

Add to `API_KEY_PROVIDERS`:
```typescript
{ id: 'vertex-ai', name: 'Google Vertex AI', prefix: '', placeholder: '' },
```

Add state variables:
```typescript
const [vertexAuthTab, setVertexAuthTab] = useState<'serviceAccount' | 'adc'>('serviceAccount');
const [vertexProjectId, setVertexProjectId] = useState('');
const [vertexLocation, setVertexLocation] = useState('us-central1');
const [vertexServiceAccountKey, setVertexServiceAccountKey] = useState('');
// ... status/error states
```

Add form UI similar to Bedrock:
- Auth type tabs: "Service Account" | "ADC"
- Project ID input (required for both)
- Location dropdown (us-central1, us-east4, europe-west1, etc.)
- Service Account Key textarea (only for Service Account mode)
- "Test Connection" / Save button

### 8. E2E Tests

Create `settings-vertex-ai.spec.ts` following `settings-bedrock.spec.ts` pattern:
- Provider button visibility
- Credential form rendering
- Tab switching between auth types
- Input field validation
- Save button functionality

Update `settings.page.ts` with Vertex AI locators.

### 9. Dependencies

Add to `apps/desktop/package.json`:
```json
"@google-cloud/aiplatform": "^3.x"
```

## UI Mockup

```
┌─ Google Vertex AI ─────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────┐ ┌────────────┐                      │
│  │ Service Account  │ │    ADC     │   (auth type tabs)   │
│  └──────────────────┘ └────────────┘                      │
│                                                            │
│  Project ID                                                │
│  ┌────────────────────────────────────────────────────┐   │
│  │ my-gcp-project                                      │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  Location                                                  │
│  ┌────────────────────────────────────────────────────┐   │
│  │ us-central1                                    ▼   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  Service Account Key (JSON)        [only for SA mode]      │
│  ┌────────────────────────────────────────────────────┐   │
│  │ {                                                   │   │
│  │   "type": "service_account",                        │   │
│  │   "project_id": "...",                              │   │
│  │   ...                                               │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │           Save Vertex AI Credentials                │   │
│  └────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

## Vertex AI Supported Locations

Pre-populate dropdown with Claude-supported regions:
- us-central1 (Iowa)
- us-east4 (N. Virginia)
- europe-west1 (Belgium)
- europe-west4 (Netherlands)

## Testing Strategy

1. **Unit Tests**: Mock SDK calls, test credential validation logic
2. **Integration Tests**: Test secure storage of credentials
3. **E2E Tests**: Test UI flows (form rendering, tab switching, input validation)
4. **Docker Tests**: Run E2E tests in Docker environment (as with Bedrock)

## Implementation Order

1. Types and shared definitions
2. Secure storage functions
3. IPC handlers with validation
4. Preload IPC bridges
5. OpenCode adapter environment setup
6. Config generator
7. Settings UI components
8. E2E tests
9. Unit tests

## Open Questions

None - design is complete based on Bedrock pattern.
