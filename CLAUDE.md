# CLAUDE.md

## Project Overview

Accomplish is a pnpm workspace monorepo: an Electron desktop app, a React 19 web UI, and Cloudflare Workers infrastructure for serving the web app. The desktop app loads the web UI from Cloudflare Workers (prod) or localhost (dev).

### Workspace Structure

```
apps/desktop    @accomplish/desktop     Electron shell (IPC, preload bridge, platform integration)
apps/web        @accomplish/web         React 19 SPA (hash router, runs in Electron renderer)
infra/                                  Cloudflare Workers + R2 (NOT in pnpm workspace, uses npm)
scripts/                                Dev orchestration scripts (Node.js CJS)
docs/                                   Architecture plans + review documents
```

**External dependency**: [`@accomplish_ai/agent-core`](https://github.com/accomplish-ai/accomplish) (npm package, not in workspace) — all agent/AI logic.
- Desktop imports full package (v0.3.1) — validation, providers, task management
- Web imports ONLY `@accomplish_ai/agent-core/common` (^0.2.2) — types + shared utilities


### Infra: Cloudflare Workers

```
┌─────────┐    service binding    ┌──────────────────┐    R2 GET
│ Router  │───────────────────────▶│ App Worker (lite) │──────────▶ R2: builds/v{ver}-lite/
│ Worker  │                       └──────────────────┘            accomplish-assets bucket
│         │    service binding    ┌──────────────────────┐
│         │───────────────────────▶│ App Worker (enterprise)│──────▶ R2: builds/v{ver}-enterprise/
└─────────┘                       └──────────────────────┘
```

- **Router** (`infra/router/`): KV-driven version routing. Resolution: cookie → desktop override → default. Reads `RoutingConfig` from KV namespace `ROUTING_CONFIG`. Falls back to `APP_LITE`/`APP_ENTERPRISE` bindings when KV unavailable (preview environments).
- **App Worker** (`infra/app/`): serves static assets from R2, SPA fallback for non-file paths
- **R2 bucket** `accomplish-assets`: `builds/v{version}-{tier}/` (prod), `builds/pr-{N}-{tier}/` (preview)
- App worker is tier-agnostic — name/vars injected at deploy time via `wrangler deploy --name --var`
- Cache: `index.html` no-cache, `/assets/*` 1yr immutable, everything else 1hr

### Versioning

- **Source of truth**: `apps/web/package.json` (web deploys) and `apps/desktop/package.json` (desktop releases)
- Root `package.json` version (`0.1.0`) is NOT used for deployments
- Desktop `package.json` is for the dmg/exe
- Web `pacakge.json` is for the App Workers
- No git tags, no changelog automation, no semantic-release
- **Build ID** format: `{semver}-{buildNumber}` (e.g., `0.1.0-27`). Build number = `git rev-list --count HEAD`
- R2 paths use build ID: `builds/v{buildId}-{tier}/`
- Deploy ≠ Release: deploying a version makes it available; setting `default` in KV makes it active

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
pnpm build:desktop                        # Desktop only (also builds web + copies dist)
pnpm build:web                            # Web only → apps/web/dist/

# Quality
pnpm typecheck                            # tsc --noEmit across all workspaces (aliased as pnpm lint)

# Tests (vitest)
pnpm -F @accomplish/desktop test:unit     # Desktop unit tests
pnpm -F @accomplish/web test:unit         # Web unit tests
pnpm -F @accomplish/desktop test:integration
pnpm -F @accomplish/web test:integration

# Smoke tests (Playwright + Electron, requires pnpm build first, no API keys)
pnpm -F @accomplish/desktop test:smoke      # Connectivity tests — local + remote mode

# E2E tests (Playwright + Electron, requires API keys in .env.e2e or env vars)
cp .env.e2e.example .env.e2e               # Fill in real API keys first
pnpm -F @accomplish/desktop test:e2e        # Real task execution — local + remote mode

# Single test file
pnpm -F @accomplish/web exec vitest run path/to/file.unit.test.ts

# Infra (run from infra/)
cd infra && bash deploy.sh release         # Release: R2 upload + workers + router + KV update
cd infra && bash deploy.sh preview <PR>   # PR preview deploy
cd infra && bash cleanup.sh <PR>          # Delete PR preview resources
cd infra && bash dev.sh lite              # Local workers dev (builds + seeds R2 + wrangler dev)
cd infra && bash setup.sh                 # One-time: create R2 bucket (idempotent)
```

### Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ACCOMPLISH_ROUTER_URL` | Desktop main | URL loaded in BrowserWindow. Default: `https://accomplish-router.accomplish.workers.dev` |
| `CLEAN_START=1` | Desktop main | Wipes userData directory on startup |
| `ACCOMPLISH_USER_DATA_NAME` | Desktop main | Override userData dir name (default: `Accomplish`). Used by E2E for isolation |
| `CLOUDFLARE_API_TOKEN` | CI / infra scripts | Wrangler auth for deploys |
| `CLOUDFLARE_ACCOUNT_ID` | infra scripts | Required for R2 API calls in cleanup and KV operations |
| `KV_NAMESPACE_ID` | CI / infra scripts | Cloudflare KV namespace ID for routing config |
| `CF_SUBDOMAIN` | CI (repo var) | Workers subdomain for health checks |
| `SLACK_RELEASE_WEBHOOK_URL` | CI | Optional Slack notification on desktop release |
| `ANTHROPIC_API_KEY` | E2E AI tests | Anthropic provider key for AI task execution tests |
| `OPEN_AI_API_KEY` | E2E AI tests | OpenAI provider key for AI task execution tests |
| `GEMINI_API_KEY` | E2E AI tests | Google/Gemini provider key for AI task execution tests |

## Verification Command

Run this after completing any changes:

```bash
pnpm typecheck && pnpm -F @accomplish/desktop test:unit && pnpm -F @accomplish/web test:unit
```

## CI/CD Workflows

| Workflow | Trigger | Secrets | What it does |
|---|---|---|---|
| `ci.yml` | PR / push to main | — | 5 parallel test jobs + Windows CI |
| `commitlint.yml` | PR open/edit | — | Enforces conventional commit PR titles |
| `release-web.yml` | Manual dispatch | `CLOUDFLARE_API_TOKEN` | Build web → upload R2 → deploy versioned workers + router → update KV |
| `preview-deploy.yml` | PR (web/infra changes) | `CLOUDFLARE_API_TOKEN` | Build → deploy PR-namespaced workers → post preview URLs as PR comment |
| `preview-cleanup.yml` | PR closed | `CLOUDFLARE_API_TOKEN` | Delete PR workers + R2 objects |
| `release.yml` | Manual dispatch | `SLACK_RELEASE_WEBHOOK_URL` | Bump version → tag → build desktop (mac arm64+x64) → GitHub Release |

All deploy/preview workflows validate required secrets at startup (`.github/actions/validate-secrets/`).

## Architecture

### Boundary Rules

- **NEVER implement agent/AI logic in `apps/desktop`**. All agent logic belongs in `@accomplish_ai/agent-core`. Desktop only wires agent-core APIs into IPC handlers.
- **`apps/web` must NOT import from `apps/desktop`** — communication is exclusively through the IPC bridge.
- **`apps/web` imports only from `@accomplish_ai/agent-core/common`** (shared types/utilities), never the full package (Node.js-only code).
- Electron main process: no React or browser APIs. Web code: no Node.js modules directly.

### State Management

- **Web**: Single Zustand store (`apps/web/src/stores/taskStore.ts`) — tasks, permissions, setup, todos, auth
- **Electron main**: electron-store (settings), better-sqlite3 (tasks/todos), secure storage (API keys)

### Key Dependencies

| Package | Where | Purpose |
|---|---|---|
| `@accomplish_ai/agent-core` | Desktop (full), Web (types) | Agent logic, validation, providers |
| `opencode-ai` | Desktop | Task execution engine (binary in asar) |
| `better-sqlite3` | Desktop | Structured data storage |
| `electron-store` | Desktop | Settings persistence |
| `node-pty` | Desktop | PTY for opencode process |
| React 19 + react-router v7 | Web | UI framework (hash router) |
| Zustand v5 | Web | State management |
| Radix UI | Web | Accessible UI primitives |
| Tailwind CSS 3 + Framer Motion | Web | Styling + animations |
| `wrangler` | Infra | Cloudflare Workers CLI |

### Path Aliases

- Desktop: `@main/*` → `src/main/*`
- Web: `@/*` → `src/*`

### Build Output

- **Web**: `apps/web/dist/` — static SPA with `base: './'` (relative paths for R2/CDN)
- **Desktop**: `dist-electron/` (main + preload), `dist/` (copied web assets), `release/` (packaged app)
- **Desktop packaging**: electron-builder → DMG + ZIP (macOS), NSIS (Windows). Published to GitHub Releases (`accomplish-ai/accomplish`)

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
- One logical change per commit. PR titles must also follow this format (enforced by CI).

## Workflow

- Before starting work, run `git status` and `git log --oneline -10`.
- When stuck after 2 failed attempts, stop and propose an alternative.
- If a sub-agent reports success, verify independently.
- For code changes, use a single agent — splitting edits across agents risks conflicts.

## Known Issues / Open Items
- No staging environment — PR previews serve as staging
- No deploy rollback mechanism
- Windows desktop build is disabled in release workflow
- Router TODOs: canary routing, A/B experiments, Analytics Engine
- Remaining manual setup: Cloudflare API tokens, R2 API credentials, GitHub secrets (see CI validation for required list)
