# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Accomplish is an Electron desktop application ("The open source AI coworker that lives on your desktop") with a React web UI. It's a pnpm workspace monorepo with two apps and a core package:

- **`apps/desktop`** (`@accomplish/desktop`) — Electron shell: IPC handlers, preload bridge, and platform integration. Wires agent-core APIs into the desktop app. Does NOT implement agent logic directly.
- **`apps/web`** (`@accomplish/web`) — React 19 UI rendered in Electron's renderer process (also runs standalone via Vite dev server on port 5173). Imports only from `@accomplish_ai/agent-core/common` (shared types and utilities).
- **[`@accomplish_ai/agent-core`](https://github.com/accomplish-ai/accomplish)** — External npm package (not part of the workspace) containing all agent/AI logic: OpenCode adapter, task management, storage (better-sqlite3), skills manager, provider configuration, logging, MCP tools, and shared types. This is where all agent and OpenCode-related implementation lives.

## Commands

```bash
# Setup
pnpm install

# Development (starts web dev server on :5173, then electron)
pnpm dev                # requires port 5173 to be free
pnpm dev:clean          # with CLEAN_START=1 (clears user data)
pnpm dev:kill           # kill orphaned process on port 5173

# Build
pnpm build              # build all workspaces
pnpm build:desktop      # desktop only
pnpm build:web          # web only

# Quality
pnpm lint               # tsc --noEmit across all workspaces
pnpm typecheck          # same as lint

# Tests (vitest)
pnpm -F @accomplish/desktop test          # all electron tests
pnpm -F @accomplish/desktop test:unit     # unit only
pnpm -F @accomplish/web test               # all web tests
pnpm -F @accomplish/web test:unit          # unit only

# Single test file
pnpm -F @accomplish/desktop exec vitest run path/to/file.unit.test.ts
pnpm -F @accomplish/web exec vitest run path/to/file.unit.test.ts
```

## Workflow

- Before starting work, run `git status` and `git log --oneline -10` to understand what previous sessions or agents have already done.
- IMPORTANT: Always use `pnpm`, never `npm` or `yarn`.
- Start new tasks with `/clear` to avoid context pollution from unrelated prior work.
- When stuck after 2 failed attempts at the same approach, stop and propose an alternative rather than brute-forcing.
- After completing changes, verify with: `pnpm typecheck && pnpm -F @accomplish/desktop test:unit && pnpm -F @accomplish/web test:unit`

## Code Quality

- **NEVER apply hacks or workarounds.** If a fix feels hacky (dotfile PATH hacks, require.resolve shims in ESM, toggling config values back and forth, monkey-patching), STOP immediately and ask the user how to proceed. Do not apply it silently.
- **NEVER add fallback defaults (`?? fallback`, `|| default`, `?:`) for values that must exist.** If something is required, let it fail loudly rather than silently swallowing the error with a default. Wrong defaults hide bugs.
- Do NOT add redundant comments, docstrings, or type annotations to code you didn't change.
- Do NOT over-engineer: no premature abstractions, no feature flags for one-off changes, no "just in case" error handling.
- Do NOT create new files when editing an existing one would work — prevents file bloat.
- Do NOT leave dead code, commented-out code, or `// removed` markers — delete cleanly.
- Do NOT add `console.log` or debug statements in committed code.
- When deleting code, delete it completely — no backwards-compatibility shims or re-exports for unused items.
- Prefer simple, idiomatic solutions over clever ones.
- Prefer named exports over default exports (matches existing codebase pattern).
- Keep changes minimal and focused — a bug fix doesn't need surrounding code cleaned up.
- Read existing code before modifying it. Match the patterns and style already in use.

## Testing & Verification

- Always test scripts, dev servers, and build commands BEFORE committing. Run the actual command and verify output — never commit untested code.
- If a sub-agent reports success, verify independently before trusting the result.
- When fixing a bug, write or update a test that reproduces it before implementing the fix.
- Run only the relevant test file during development, full suite before committing.

## Agent & Task Management

- When launching parallel sub-agents (Task tool), ensure the session will remain active long enough to receive results. For long-running parallel work, prefer sequential execution or batch into fewer agents rather than spawning many that may not complete before session timeout.
- Provide agents with specific file paths and context rather than asking them to "explore" broadly.
- For code changes, always use a single agent — splitting edits across agents risks conflicts.

## Architecture

### IPC Bridge
The preload script (`apps/desktop/src/preload/index.ts`) exposes `accomplishAPI` via `contextBridge`. The web app calls this API (`apps/web/src/lib/accomplish.ts`), which routes through IPC handlers in `apps/desktop/src/main/ipc/handlers.ts` to the main process.

### Boundary Rules
- **NEVER implement OpenCode, agent, or AI logic in `apps/desktop`.** All agent-related implementation (task management, OpenCode adapter, provider validation, storage, skills, logging) belongs in `@accomplish_ai/agent-core`. The desktop app only wires agent-core APIs into IPC handlers — it does not contain its own implementations.
- Do NOT import from `@accomplish/desktop` in `@accomplish/web` — the web app communicates with electron exclusively through the IPC bridge.
- The web app imports only from `@accomplish_ai/agent-core/common` (shared types/utilities), never from the full `@accomplish_ai/agent-core` package (which contains Node.js-only code).
- Electron main process code must never import React or browser APIs; web code must never import Node.js modules directly.

### State Management
- **Web**: Zustand stores (`apps/web/src/stores/taskStore.ts`)
- **Electron main**: electron-store for settings, better-sqlite3 for structured data

### Skills System
Bundled skills live in `apps/desktop/bundled-skills/` as directories with `SKILL.md` files (YAML frontmatter + markdown body). Each skill defines a slash command.

### Key Dependencies
- `opencode-ai` — underlying task execution engine (consumed by agent-core)
- Radix UI primitives + Tailwind CSS + Framer Motion for UI

## Testing Conventions

- **Naming**: `*.unit.test.ts(x)` for unit tests, `*.integration.test.ts(x)` for integration tests
- **Electron tests**: Node environment (main process logic)
- **Web tests**: jsdom environment (React components)
- **Coverage thresholds** (desktop): 80% statements, 70% branches, 80% functions/lines

## Path Aliases

- Desktop: `@main/*` → `src/main/*`
- Web: `@/*` → `src/*`

## Commit Convention

- PR titles must follow conventional commits: `<type>(<scope>): <description>`
- Types: feat, fix, docs, chore, refactor, test, perf, ci, build, style
- Keep commits atomic — one logical change per commit. Do NOT bundle unrelated changes.
