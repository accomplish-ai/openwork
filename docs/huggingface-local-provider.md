# Hugging Face Local Provider (Transformers.js)

This document explains what was implemented for local Hugging Face inference, how the feature works end-to-end, and how to validate it before merging a PR.

## Why this was added

Users wanted local model inference without depending on cloud APIs and without requiring Ollama as a separate runtime.

This integration adds a first-party local provider in the Electron app using Transformers.js with ONNX Runtime acceleration.

## What was implemented

### 1) New provider type and settings model

- Added provider type: `huggingface-local`
- Added provider credentials/config fields:
  - `modelId`
  - `quantization` (`q4`, `q8`, `fp16`, `fp32`)
  - `devicePreference` (`auto`, `webgpu`, `wasm`, `cpu`)
  - `serverUrl`
  - `cacheDir` (optional)
- Added provider metadata, default model mappings, and exports in agent-core common entrypoints.

### 2) Main-process local runtime

Added a new runtime module:

- `apps/desktop/src/main/providers/huggingface-local/runtime.ts`

Capabilities:

- Search models from Hugging Face Hub API
- Download/load model with Transformers.js pipeline
- Emit download progress events
- Persist model manifest in user data directory
- Run an OpenAI-compatible local HTTP server for inference:
  - `GET /health`
  - `GET /v1/models`
  - `POST /v1/chat/completions` (streaming + non-streaming)

### 3) IPC and preload bridge

Added IPC handlers and preload APIs:

- Search models
- List installed models
- Download model
- Get hardware/cache info
- Subscribe to download progress

### 4) Settings UI integration

Added provider form:

- `apps/desktop/src/renderer/components/settings/providers/HuggingFaceLocalProviderForm.tsx`

UI features:

- Model search and selection
- Quantization and device selection
- Download progress indicator
- Installed models list
- Hardware and cache location display

### 5) OpenCode config integration

When Hugging Face Local is active:

- Provider config is injected as `@ai-sdk/openai-compatible`
- Base URL points to local runtime (`http://127.0.0.1:9231/v1`)
- Selected model is mapped into OpenCode config

### 6) Packaging/runtime dependency updates

- Added dependency:
  - `@huggingface/transformers`
- Added packaging include/unpack entries for HF + ONNX runtime assets in desktop package config.

## Initial model set

The first curated model list includes:

- `onnx-community/Llama-3.2-1B-Instruct`
- `onnx-community/Llama-3.2-3B-Instruct`
- `onnx-community/Phi-3.5-mini-instruct-onnx`
- `onnx-community/gemma-2-2b-it`
- `onnx-community/Qwen2.5-1.5B-Instruct`

## End-to-end flow

1. User opens Settings and selects **Hugging Face Local**
2. User searches/selects a model and chooses quantization/device
3. App downloads and caches model files under userData
4. UI receives download progress over IPC
5. Connected provider is saved with selected local model
6. On task start, OpenCode config generation ensures local runtime server for active HF model
7. Inference requests go through local OpenAI-compatible endpoint

## Storage and cache

- Root directory: `<userData>/huggingface-local`
- Cache directory: `<userData>/huggingface-local/cache`
- Manifest file: `<userData>/huggingface-local/manifest.json`

## Important implementation detail

Local model variants are keyed by model + quantization + device:

- `huggingface-local/<modelId>::<quantization>::<devicePreference>`

This avoids collisions when the same model is installed with different runtime variants.

## How to validate (pre-PR checklist)

Run from repo root:

```bash
pnpm install
pnpm --filter @accomplish_ai/agent-core typecheck
pnpm --filter @accomplish/desktop typecheck
pnpm --filter @accomplish/desktop test
```

Manual checks:

1. Open Settings -> select Hugging Face Local provider card
2. Search models and start a download
3. Verify progress updates and successful connect
4. Select downloaded model and run a task
5. Confirm local runtime responds via `/health` and task returns model output
6. Restart app and verify installed model manifest is retained

## Known constraints

- Model download sizes can be large (hundreds of MB to GB scale)
- Actual acceleration path depends on platform/runtime support (WebGPU/WASM/CPU fallback)
- Tool support is currently marked unknown for HF local models

## Key files touched

- `apps/desktop/src/main/providers/huggingface-local/runtime.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/main/opencode/config-generator.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/components/settings/providers/HuggingFaceLocalProviderForm.tsx`
- `packages/agent-core/src/common/types/provider.ts`
- `packages/agent-core/src/common/types/providerSettings.ts`
- `packages/agent-core/src/common.ts`
- `apps/desktop/package.json`
