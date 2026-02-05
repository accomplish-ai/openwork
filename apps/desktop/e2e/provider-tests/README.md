# Provider Tests (Real Providers)

The regular E2E specs run with `E2E_MOCK_TASK_EVENTS=1` and use **fake** API keys.

This folder is for **optional** provider smoke tests that talk to real providers.

## Secrets

Never commit real API keys.

- **Local file (recommended for local runs)**: copy `secrets.example.json` to `secrets.json` and fill in keys.
  - `secrets.json` is gitignored.
- **Environment variables**: set the following env vars instead of using a file:
  - `E2E_PROVIDER_TEST_TASK_PROMPT` (optional)
  - `E2E_OPENAI_API_KEY`
  - `E2E_GOOGLE_API_KEY`
  - `E2E_BEDROCK_API_KEY`
  - `E2E_BEDROCK_REGION` (optional, defaults to `eu-north-1`)

## Loading secrets in tests

Use `loadProviderTestSecrets()` from `secrets.ts`.

