# Google Workspace CLI Integration Design Document

## Context

Google has shipped a CLI for Google Workspace (`@googleworkspace/cli`) - announced via [tweet](https://x.com/rauchg/status/2029356560494018956). This CLI provides:

- Access to Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin
- Written in Rust, distributed via npm: `npm i -g @googleworkspace/cli`
- **Built-in MCP server mode**: `gws mcp -s drive,gmail,calendar`
- 100+ AI agent skills with structured JSON output
- OAuth with AES-256-GCM encryption (same as Accomplish)
- Multiple auth methods: OAuth, service accounts, credentials files

This is a significant opportunity to replace our fragile browser-based Google integrations with reliable API-based tools.

## Current State in Accomplish

| Component             | Location                                                  | Description                              |
| --------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Google Sheets Skill   | `apps/desktop/bundled-skills/google-sheets/SKILL.md`      | Browser automation via Playwright        |
| MCP Server Integration| `packages/agent-core/src/opencode/config-generator.ts`    | Spawns local MCP servers                 |
| Connectors System     | `packages/agent-core/src/connectors/`                     | Remote MCP with OAuth (PKCE, token refresh) |
| Secure Storage        | `SecureStorage` class                                     | AES-256-GCM encrypted credentials        |

## Integration Approaches Comparison

| Approach                  | Effort      | Rating  | Summary                                              |
| ------------------------- | ----------- | ------- | ---------------------------------------------------- |
| **1. Native MCP Server**  | Medium      | 4.5/5   | **Recommended** - Add GWS CLI as local MCP server    |
| 2. Remote MCP Connector   | Low         | 3.5/5   | Use existing connector infra if hosted endpoint exists |
| 3. Hybrid Browser + API   | Medium-High | 3/5     | Keep browser fallback alongside API                  |
| 4. Provider-Level         | High        | 2.5/5   | Over-engineered - treats tools as AI provider        |

## Recommended Approach: Native MCP Server Integration

### Why This Approach

1. **Architectural Fit**: Matches existing `dev-browser-mcp` pattern exactly
2. **Full Capability**: All 100+ Google Workspace skills available
3. **Reliability**: API-based, no more browser coordinate clicking
4. **Reuse**: OAuth code can largely reuse existing connector OAuth utilities
5. **User Experience**: Single Google sign-in enables all services

### Implementation Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Accomplish Desktop                          │
├─────────────────────────────────────────────────────────────────┤
│  config-generator.ts                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ mcpServers: {                                            │  │
│  │   'file-permission': { ... },                            │  │
│  │   'dev-browser-mcp': { ... },                            │  │
│  │   'google-workspace': {        ← NEW                     │  │
│  │     type: 'local',                                       │  │
│  │     command: ['gws', 'mcp', '-s', 'drive,gmail,...'],    │  │
│  │     environment: { GWS_TOKEN_PATH: '...' }               │  │
│  │   }                                                      │  │
│  │ }                                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Implementation Steps

#### Step 1: Add GWS CLI Dependency

- Bundle `@googleworkspace/cli` in packaged app
- Or spawn via `npx -y @googleworkspace/cli` using bundled Node.js

#### Step 2: Modify config-generator.ts

```typescript
// In packages/agent-core/src/opencode/config-generator.ts
// After browser MCP server config (line ~423)

if (options.googleWorkspace?.enabled) {
  const services = options.googleWorkspace.services.join(',');
  mcpServers['google-workspace'] = {
    type: 'local',
    command: [npxPath, '-y', '@googleworkspace/cli', 'mcp', '-s', services],
    enabled: true,
    environment: {
      GWS_TOKEN_PATH: path.join(userDataPath, 'gws-tokens.json'),
    },
    timeout: 60000,
  };
}
```

#### Step 3: Google OAuth Flow

- Extend `accomplish://callback/` protocol for Google OAuth
- Use existing PKCE utilities from `mcp-oauth.ts`
- Store tokens via SecureStorage

#### Step 4: UI Integration

- Add "Google Workspace" section in Settings
- Service selector (Drive, Gmail, Calendar, Sheets, Docs)
- "Connect Google Account" button with OAuth flow
- Connection status indicator

#### Step 5: Skills Update

- Create new `google-workspace/SKILL.md` documenting API tools
- Update or deprecate browser-based `google-sheets/SKILL.md`

## Critical Files to Modify

| File                                                        | Change                                       |
| ----------------------------------------------------------- | -------------------------------------------- |
| `packages/agent-core/src/opencode/config-generator.ts`      | Add Google Workspace MCP server config       |
| `packages/agent-core/src/common/types/providerSettings.ts`  | Add GoogleWorkspace settings type            |
| `apps/desktop/src/main/ipc/handlers.ts`                     | Add OAuth handlers for Google                |
| `apps/desktop/src/main/index.ts`                            | Extend protocol handler for Google callback  |
| `apps/web/src/client/pages/Settings/`                       | Add Google Workspace connection UI           |
| `apps/desktop/bundled-skills/`                              | Add new google-workspace skill, update google-sheets |

## Comparison: Browser vs API Approach

| Aspect          | Browser (Current)              | API (Proposed)                |
| --------------- | ------------------------------ | ----------------------------- |
| Reliability     | Fragile - coordinate clicks    | Robust - structured JSON      |
| Speed           | Slow - page loads              | Fast - direct API calls       |
| Auth            | Manual sign-in each session    | OAuth token persistence       |
| Capabilities    | Visual only                    | Full API access               |
| Debugging       | Screenshot-based               | Structured errors             |
| Bulk Operations | One-by-one                     | Batch supported               |

## Decisions

1. **Service Scope**: Core services - Drive, Gmail, Calendar, Sheets, Docs
2. **Auth Method**: OAuth only (consumer-friendly, simpler UX)
3. **Browser Skill**: Replace immediately - deprecate browser-based google-sheets skill

## Verification Plan

1. Install GWS CLI locally: `npm i -g @googleworkspace/cli`
2. Run MCP server: `gws mcp -s drive,gmail,calendar`
3. Test OAuth flow: `gws auth setup`
4. Verify tool discovery via MCP protocol
5. Integration test with Accomplish task execution

## Sources

- [Google Workspace CLI GitHub](https://github.com/googleworkspace/cli)
- [Guillermo Rauch announcement](https://x.com/rauchg/status/2029356560494018956)
