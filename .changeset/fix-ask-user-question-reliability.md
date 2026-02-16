---
"@accomplish_ai/agent-core": patch
---

fix(agent-core): AskUserQuestion reliability improvements

- Remove duplicate question handling from adapter that conflicted with MCP HTTP path
- Increase ask-user-question MCP server timeout from 30s to 10min so users have time to respond
- Add experimental.mcp_timeout to OpenCode config for global MCP tool execution timeout
- Add 5-minute AbortSignal timeout to MCP tool's fetch() call as a safety net
