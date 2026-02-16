# PR Title
feat(desktop): add Hugging Face Local provider with Transformers.js runtime, UI, and OpenCode integration

## Summary

This PR adds a new local provider, `huggingface-local`, so users can run open-source Hugging Face models directly inside the Electron app without requiring Ollama.

## Problem

Users wanted local inference for Hugging Face models without relying on cloud APIs and without a separate local runtime installation.

## Solution

Implemented a first-party Hugging Face Local provider powered by Transformers.js + ONNX Runtime, with model search/download, local caching, progress reporting, settings UI, and OpenAI-compatible local inference for OpenCode.

## What’s Included

- Added provider type and credentials/config support:
  - `huggingface-local`
  - `modelId`, `quantization`, `devicePreference`, `serverUrl`, `cacheDir`
- Added local runtime:
  - model search (HF Hub API)
  - model download/loading
  - cache + manifest management under `userData/huggingface-local`
  - local OpenAI-compatible server (`/health`, `/v1/models`, `/v1/chat/completions`)
- Added IPC + preload APIs:
  - search/list/download models
  - hardware info
  - cache dir
  - download progress events
- Added settings UI form for Hugging Face Local:
  - model search
  - quantization/device selection
  - progress UI
  - installed model selection
- Integrated OpenCode config generation:
  - inject provider config for local server
  - ensure server only when HF local is active/selected
- Added desktop dependency/packaging updates:
  - `@huggingface/transformers`
  - packaging include/unpack for HF/ONNX assets
- Added logo and provider UI mapping
- Updated E2E provider lists to include `huggingface-local`

## Initial Supported Models

- `onnx-community/Llama-3.2-1B-Instruct`
- `onnx-community/Llama-3.2-3B-Instruct`
- `onnx-community/Phi-3.5-mini-instruct-onnx`
- `onnx-community/gemma-2-2b-it`
- `onnx-community/Qwen2.5-1.5B-Instruct`

## Key Implementation Notes

- HF local model variants are keyed as:
  - `huggingface-local/<modelId>::<quantization>::<devicePreference>`
- This prevents collisions when the same model is installed with multiple quantization/device variants.
- Added doc: `docs/huggingface-local-provider.md`

## Files Changed (high-level)

- `packages/agent-core/src/common/types/provider.ts`
- `packages/agent-core/src/common/types/providerSettings.ts`
- `packages/agent-core/src/common.ts`
- `packages/agent-core/src/common/constants/model-display.ts`
- `apps/desktop/src/main/providers/huggingface-local/runtime.ts`
- `apps/desktop/src/main/ipc/handlers.ts`
- `apps/desktop/src/main/opencode/config-generator.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/components/settings/providers/HuggingFaceLocalProviderForm.tsx`
- `apps/desktop/package.json`
- `docs/huggingface-local-provider.md`
- `README.md`
- `docs/architecture.md`

## Validation

Commands run:

- `pnpm --filter @accomplish_ai/agent-core typecheck`
- `pnpm --filter @accomplish/desktop typecheck`
- `pnpm --filter @accomplish/desktop test`

Manual validation:

1. Open Settings and select Hugging Face Local provider card.
2. Search models and start a download.
3. Verify progress updates and successful connect.
4. Select downloaded model and run a task.
5. Confirm local runtime responds via `/health` and task returns model output.
6. Restart app and verify installed model manifest is retained.

## Risks / Follow-ups

- Model download sizes can be large; disk pressure handling can be improved further.
- Tool support detection for HF local models is currently `unknown`.
- Runtime acceleration path is hardware/platform dependent (WebGPU/WASM/CPU fallback).

