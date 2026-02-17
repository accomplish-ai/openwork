---
"@accomplish_ai/agent-core": minor
---

feat(agent-core): add Nebius AI, Together AI, Fireworks AI, and Groq providers

- Add 4 new OpenAI-compatible cloud inference providers to ProviderType and ProviderId
- Add API key validation via GET /v1/models with Bearer auth for each provider
- Add OpenCode CLI config generation (opencode.json + auth.json) for all 4 providers
- Add environment variable mappings (NEBIUS_API_KEY, TOGETHER_API_KEY, FIREWORKS_API_KEY, GROQ_API_KEY)
- Add PROVIDER_META entries with display names, help URLs, and logo keys
- Add DEFAULT_MODELS with flagship agent-capable defaults (DeepSeek V3.2, Kimi K2.5, Kimi K2 Instruct)
- Add model display name mappings for default models
