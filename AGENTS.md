# AGENTS.md

This document provides essential instructions and guidelines for agentic coding assistants working on the Openwork project.

## Project Context
Openwork is a desktop automation assistant built with Electron, React, and Vite. It uses `node-pty` to run the OpenCode CLI for local task execution.

## Common Development Commands

### Environment Setup
- `pnpm install` - Install dependencies
- `pnpm dev` - Start the app in development mode
- `pnpm dev:clean` - Start with `CLEAN_START=1` (wipes local data)

### Building
- `pnpm build` - Build the entire monorepo
- `pnpm build:desktop` - Build only the desktop application
- `pnpm clean` - Remove build artifacts and `node_modules`

### Linting & Type-Checking
- `pnpm lint` - Run ESLint and TypeScript checks
- `pnpm typecheck` - Run TypeScript compiler validation
- `pnpm -F @accomplish/desktop typecheck` - Desktop-specific type check

### Testing
- `pnpm -F @accomplish/desktop test:unit` - Run unit tests (Vitest)
- `pnpm -F @accomplish/desktop test:integration` - Run integration tests (Vitest)
- `pnpm -F @accomplish/desktop test:e2e` - Run Playwright E2E tests (Serial execution required)
- **Run a single test file**: `pnpm -F @accomplish/desktop test:unit -- <path-to-file>`
- `pnpm -F @accomplish/desktop test:watch` - Run Vitest in watch mode

## Code Style & Conventions

### TypeScript Standards
- **Strict Mode**: Always use TypeScript. Avoid `any` at all costs.
- **Types vs Interfaces**: Use `interface` for object shapes and `type` for unions, primitives, or complex compositions.
- **Naming**:
  - `PascalCase`: Components, Classes, Interfaces, Types.
  - `camelCase`: Variables, functions, and file names (except React components).
  - `UPPER_SNAKE_CASE`: Global constants and enums (if used).

### React & Renderer Process
- **Styling**: Tailwind CSS is used for all styling. Use utility classes directly.
- **State Management**: Use Zustand stores (located in `src/renderer/stores/`).
- **Image Assets**: Always use ES module imports for images. Never use absolute paths like `/assets/logo.png`.
  ```typescript
  import logoIcon from '/assets/logo.png';
  <img src={logoIcon} alt="Logo" />
  ```
- **IPC Access**: Use the typed `window.accomplish` API exposed via `preload`. Do not use `ipcRenderer` directly in the renderer.

### Electron Main Process
- **IPC Handlers**: Implement in `src/main/ipc/handlers.ts`. Use the `handle(channel, handler)` helper to ensure consistent error normalization and logging.
- **Validation**: Use `Zod` schemas in `src/main/ipc/validation.ts` to validate all IPC arguments.
- **Persistence**: 
  - API Keys: OS Keychain via `keytar` (wrapper in `src/main/store/secureStorage.ts`).
  - Settings: `electron-store` (wrapper in `src/main/store/appSettings.ts`).
  - Task History: JSON files via `src/main/store/taskHistory.ts`.
- **Bundled Node.js**: When spawning child processes (`node` or `npx`), you **MUST** add the bundled Node.js bin path to the environment's `PATH`.
  ```typescript
  import { getBundledNodePaths } from '../utils/bundled-node';
  const bundled = getBundledNodePaths();
  const env = { ...process.env, PATH: `${bundled.binDir}:${process.env.PATH}` };
  ```

### Error Handling
- Use `try/catch` blocks for all asynchronous operations and IPC handlers.
- Use `normalizeIpcError` for consistent error reporting across the IPC bridge.
- Log errors with context: `console.error('[Module] Action failed:', error)`.
- Renderer should handle IPC errors gracefully, showing user-friendly messages.

## Testing Guidelines
- **Unit Tests**: Place in `__tests__` directories or alongside components as `.test.ts(x)`.
- **Integration Tests**: Focus on the bridge between Main and Renderer or complex task logic.
- **E2E Tests**: Use Playwright. Tests must run serially because Electron only supports one instance with the same `userData` path.
- **Skip Onboarding**: For E2E tests, set `E2E_SKIP_AUTH=1` or pass `--e2e-skip-auth` to skip the API key setup flow.

## Architecture & Communication
- **Monorepo**: Managed by pnpm. `apps/desktop` is the main app, `packages/shared` contains shared logic/types.
- **CLI Adapter**: `src/main/opencode/adapter.ts` manages the lifecycle of the OpenCode CLI using PTY.
- **Shared Types**: Add types used in both Main and Renderer processes to `packages/shared/src/types/`.
- **Security**: Never commit secrets or `.env` files. API keys are strictly stored in the OS keychain.
- **Protocol**: Custom `accomplish://` protocol is handled in `src/main/index.ts`.

## Development Best Practices
1. **Feature Development**: Start by defining types in `packages/shared`.
2. **IPC Logic**: Implement the main process handler first, then update the preload script to expose it.
3. **UI Implementation**: Use Shadcn/UI components where possible. Ensure all interactive elements have proper focus states and ARIA labels.
4. **Performance**: Use `React.memo` for expensive components and avoid unnecessary store subscriptions.
5. **Security**: Always sanitize inputs in IPC handlers using `Zod` or custom sanitization functions.

## Common Pitfalls
- **Path Issues**: Always use `path.join` and `__dirname` correctly. In packaged apps, some paths change (e.g., `process.resourcesPath`).
- **Async IPC**: `ipcMain.handle` is always asynchronous. Ensure the renderer awaits all calls.
- **State Sync**: Avoid redundant state in both Zustand and local React state. Prefer Zustand for global/shared state.
- **Asset Loading**: Forgetting to import images as ES modules leads to broken images in production builds.
