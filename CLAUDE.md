# CLAUDE.md

## Project Overview

Accomplish is a pnpm workspace monorepo with a desktop app, web UI, and Cloudflare Workers infrastructure for serving the web app.

### Workspace Structure

```
apps/desktop    @accomplish/desktop     Electron shell (IPC handlers, preload bridge, platform integration)
apps/web        @accomplish/web         React 19 UI (runs in Electron renderer or standalone via Vite)
infra/                                  Cloudflare Workers + R2 deployment infrastructure
```

**External dependency**: [`@accomplish_ai/agent-core`](https://github.com/accomplish-ai/accomplish) (npm package, not in workspace) contains all agent/AI logic.

### Infra: Cloudflare Workers

```
infra/router/    Router worker — resolves tier (lite/enterprise), forwards to app worker
infra/app/       App worker — serves static assets from R2 with SPA fallback
```

- **R2 bucket** `accomplish-assets` stores versioned builds at `builds/v{version}-{tier}/`
- Router uses Cloudflare service bindings to dispatch to `accomplish-app-lite` or `accomplish-app-enterprise`
- Config files: `infra/app/wrangler.toml` (base, name/vars set via CLI), `infra/router/wrangler.toml`

## Commands

```bash
# Setup
pnpm install                              # ALWAYS use pnpm, never npm or yarn

# Development
pnpm dev                                  # Vite dev server on :5173 + Electron
pnpm dev:clean                            # Same with CLEAN_START=1 (clears user data)
pnpm dev:kill                             # Kill orphaned process on port 5173
pnpm dev:workers:lite                     # Build web + seed local R2 + start local workers (lite tier)
pnpm dev:workers:enterprise               # Same for enterprise tier
pnpm dev:remote <url>                     # Point desktop app at a remote worker URL

# Build
pnpm build                                # Build all workspaces
pnpm build:desktop                        # Desktop only
pnpm build:web                            # Web only

# Quality
pnpm typecheck                            # tsc --noEmit across all workspaces (aliased as pnpm lint)

# Tests (vitest)
pnpm -F @accomplish/desktop test:unit     # Desktop unit tests
pnpm -F @accomplish/web test:unit         # Web unit tests

# Single test file
pnpm -F @accomplish/web exec vitest run path/to/file.unit.test.ts
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `ACCOMPLISH_ROUTER_URL` | Controls all routing — points the app at a specific worker URL |
| `CLEAN_START=1` | Clears user data on dev startup |

## Verification Command

Run this after completing any changes:

```bash
pnpm typecheck && pnpm -F @accomplish/desktop test:unit && pnpm -F @accomplish/web test:unit
```

## Architecture

### IPC Bridge (Desktop)

Preload script (`apps/desktop/src/preload/index.ts`) exposes `accomplishAPI` via `contextBridge`. Web app calls it through `apps/web/src/lib/accomplish.ts`, routing through IPC handlers in `apps/desktop/src/main/ipc/handlers.ts`.

### Boundary Rules

- **NEVER implement agent/AI logic in `apps/desktop`**. All agent logic belongs in `@accomplish_ai/agent-core`. Desktop only wires agent-core APIs into IPC handlers.
- **`apps/web` must NOT import from `apps/desktop`** — communication is exclusively through the IPC bridge.
- **`apps/web` imports only from `@accomplish_ai/agent-core/common`** (shared types/utilities), never the full package (Node.js-only code).
- Electron main process: no React or browser APIs. Web code: no Node.js modules directly.

### State Management

- **Web**: Zustand stores (`apps/web/src/stores/taskStore.ts`)
- **Electron main**: electron-store for settings, better-sqlite3 for structured data

### Key Dependencies

- `opencode-ai` — task execution engine (consumed by agent-core)
- Radix UI + Tailwind CSS + Framer Motion for UI
- `wrangler` — Cloudflare Workers CLI (in `infra/`)

### Path Aliases

- Desktop: `@main/*` -> `src/main/*`
- Web: `@/*` -> `src/*`

## Code Quality Rules

- **NEVER apply hacks or workarounds.** If a fix feels hacky, STOP and ask the user.
- **NEVER add fallback defaults** (`?? fallback`, `|| default`) for values that must exist. Let it fail loudly.
- Do NOT add comments, docstrings, or type annotations to code you didn't change.
- Do NOT over-engineer: no premature abstractions, no "just in case" error handling.
- Do NOT create new files when editing an existing one would work.
- Do NOT leave dead code, commented-out code, or `console.log` statements.
- When deleting code, delete completely — no backwards-compat shims.
- Prefer named exports over default exports.
- Read existing code before modifying. Match existing patterns and style.

## Testing Conventions

- `*.unit.test.ts(x)` for unit tests, `*.integration.test.ts(x)` for integration tests
- Electron tests: Node environment. Web tests: jsdom environment.
- Coverage thresholds (desktop): 80% statements, 70% branches, 80% functions/lines
- When fixing a bug, write or update a test that reproduces it first.

## Commit Convention

- Conventional commits: `<type>(<scope>): <description>`
- Types: feat, fix, docs, chore, refactor, test, perf, ci, build, style
- One logical change per commit.

## Workflow

- Before starting work, run `git status` and `git log --oneline -10`.
- When stuck after 2 failed attempts, stop and propose an alternative.
- If a sub-agent reports success, verify independently.
- For code changes, use a single agent — splitting edits across agents risks conflicts.
