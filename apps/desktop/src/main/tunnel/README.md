# WhatsApp Integration for Accomplish

Closes #400

This is the WhatsApp integration i built for the Accomplish desktop app. The whole idea is simple, you should be able to send a WhatsApp message from your phone and have it trigger an actual task inside Accomplish on your computer. No extra apps, no bots, just WhatsApp.

I want to explain why i made the decisions i did and how the thing actually works, because its not immediately obvious from the code alone.

## why i did it this way

The original plan was to use a WhatsApp client library like Baileys or whatsapp-web.js. I tried both. Baileys broke constantly because WhatsApp keeps changing their internal protocol and the library cant keep up. whatsapp-web.js had similar issues with authentication. Every time WhatsApp pushed an update things would stop working.

So i took a different approach. Instead of trying to reverse engineer the WhatsApp protocol, i just open the real WhatsApp Web page inside a hidden Electron BrowserWindow. This means the user scans the QR code exactly like they would on web.whatsapp.com, WhatsApp handles all the authentication and encryption, and i dont have to worry about protocol changes breaking everything.

The tradeoff is that i have to scrape the page to detect messages instead of having a clean API. But it works reliably because i am reading the sidebar preview text, which WhatsApp has kept stable for years. The sidebar always shows the last message from each chat, and i just scan for messages that start with @accomplish.

## how it works end to end

When you click Connect in the integrations settings, Accomplish opens a BrowserWindow pointing at web.whatsapp.com. You scan the QR code with your phone like you normally would. Once connected, the window moves off-screen so it stays running without being in the way.

From there, a polling loop runs every 3 seconds. It executes JavaScript inside the WhatsApp Web page to read the sidebar. For every chat that has a preview starting with @accomplish, it extracts the message text, deduplicates it against what it already saw, and fires it into the message handler.

The message handler strips the @accomplish prefix, creates a task config, and uses createTaskCallbacks to start the task through the standard Accomplish task pipeline. The task shows up in the UI exactly like a locally created task would. You see the progress, the agent output, everything.

The dedup system uses content plus timestamp hashing. When the page first loads, a baseline scan runs to capture all existing @accomplish previews so they dont get re-triggered. After that, only genuinely new messages trigger tasks.

## the tunnel

There is a tunnel server that runs on localhost port 3000. Its a basic HTTP server, not a real internet tunnel yet. The plan outlined in the issue was to build something like what OpenClaw does, where you get a public URL that routes to your local machine. Right now the tunnel handles message routing internally and provides endpoints for health checks and task status. When the user enables the tunnel toggle in settings, it activates this local server and wires it into the message handler pipeline.

The tunnel auto-enables when WhatsApp connects. I did this because the whole point of the integration is to receive messages, so having the tunnel off by default while WhatsApp is connected didnt make sense from a user perspective.

## the settings ui

The integrations panel lives in the settings dialog alongside providers, skills, connectors, and voice input. I matched the design patterns from those existing panels. Cards use the same rounded-xl border border-border bg-card p-3.5 pattern as SkillCard and ConnectorCard. Text sizes follow the same scale, text-13px for titles, text-11px for descriptions, text-10px for badges.

WhatsApp is the active integration. Slack and Telegram show as coming soon cards at reduced opacity. I left Teams out because the issue only mentioned Slack, Teams, and Telegram for future consideration and three cards fill the grid better.

The connected state shows a green status dot and a tunnel toggle inline on the card. Disconnect is a single button. There is no separate QR modal anymore because WhatsApp Web handles the QR in the popup window directly. Showing a second modal on top of that was confusing and redundant.

At the bottom there is a how it works section that explains the four-step flow, scan, enable tunnel, send message, see results. It uses the same card styling as the rest of the panel.

## multi platform design

Everything is built on a generic IntegrationPlatform enum and IntegrationProvider interface defined in agent-core. The WhatsApp provider is just one implementation. Adding Slack or Telegram later means implementing the same interface with a different connection mechanism. The manager, message handler, tunnel server, and UI are all platform-agnostic. They work with IntegrationConfig and IntegrationPlatform types, not WhatsApp-specific code.

The store persists integration configs to a JSON file in the user data directory so tunnel state and connection status survive app restarts.

## what still needs work

The tunnel is local-only. For actual remote triggering from a phone on a different network, it needs a proper tunneling solution like ngrok or cloudflare tunnel.

Sending replies back to WhatsApp is not reliable. I tried using webpack module raiding to find WhatsApps internal send function, but it breaks because WhatsApp obfuscates their module names. The sidebar scraping approach for reading messages is solid, but writing messages back into WhatsApp from the outside is a different problem. Tasks still run fine, you just wont get a WhatsApp reply confirming it.

The sender identification for sidebar-scraped messages is approximate. The sidebar shows chat names, not phone numbers or JIDs, so routing a reply to the exact sender is unreliable.

## files changed and why

Here is every file this PR touches and what it does.

### new files (core integration system)

- **apps/desktop/src/main/integrations/manager.ts** (352 lines) — the IntegrationManager class. Singleton that owns provider lifecycle, config persistence, event routing, auto-reconnect on startup, and tunnel auto-enable. This is the central orchestrator that ties everything together.

- **apps/desktop/src/main/integrations/providers/whatsapp.ts** (1006 lines) — the WhatsApp provider. Opens a BrowserWindow with web.whatsapp.com, polls connection status, scrapes sidebar previews for @accomplish messages, injects notification override and MutationObserver as secondary message sources, attempts webpack module raiding for reply capability. Also has the reconnect() method that opens the window hidden for auto-reconnect on startup.

- **apps/desktop/src/main/integrations/message-handler.ts** (266 lines) — receives incoming messages from any provider, strips the @accomplish prefix, creates a task config, and starts it through the standard Accomplish task pipeline using createTaskCallbacks. Also handles concurrent task rejection and error recovery.

- **apps/desktop/src/main/integrations/types.ts** (97 lines) — TypeScript types for the integration system. IntegrationProvider interface, IIntegrationManager interface, re-exports of IntegrationPlatform enum and IntegrationConfig from agent-core. This is what a new provider implements.

- **apps/desktop/src/main/integrations/providers/slack.ts** (145 lines) — placeholder Slack provider stub. Implements the IntegrationProvider interface with not-yet-implemented methods. Ready for someone to fill in the actual Slack connection logic.

- **apps/desktop/src/main/integrations/providers/teams.ts** (141 lines) — placeholder Teams provider stub. Same structure as Slack.

- **apps/desktop/src/main/integrations/providers/telegram.ts** (142 lines) — placeholder Telegram provider stub. Same structure as Slack and Teams.

### new files (tunnel)

- **apps/desktop/src/main/tunnel/tunnel-service.ts** (228 lines) — HTTP server on localhost:3000 with auth token, health endpoint, message ingestion endpoint, and progress update forwarding. Singleton pattern with start/stop lifecycle.

- **apps/desktop/src/main/tunnel/README.md** (this file) — explains what the integration does and why decisions were made.

### new files (IPC and store)

- **apps/desktop/src/main/ipc/integration-handlers.ts** (90 lines) — registers IPC handlers for integrations:list, integrations:connect, integrations:disconnect, integrations:status, integrations:setupTunnel, integrations:toggleTunnel. Bridges the renderer process to the IntegrationManager.

- **apps/desktop/src/main/store/integrations.ts** (73 lines) — file-based JSON persistence for integration configs. Reads/writes to integrations.json (or integrations-dev.json in dev) in the user data directory. Keeps tunnel state and connection status across restarts.

- **apps/desktop/src/main/preload/integrations/whatsapp-preload.ts** (34 lines) — preload script for the WhatsApp BrowserWindow. Exposes IPC bridge for QR, status, and message events from the WA page context.

### new files (UI)

- **apps/web/src/client/components/settings/integrations/IntegrationsPanel.tsx** (223 lines) — the main integrations settings panel. Shows WhatsApp card (active), Slack and Telegram cards (coming soon), error display, how-it-works section. Polls for status changes every 5 seconds to pick up auto-reconnect state transitions.

- **apps/web/src/client/components/settings/integrations/IntegrationCard.tsx** (146 lines) — individual integration card component. Shows icon, status dot, tunnel toggle, connect/disconnect/reconnecting button states. Design matches SkillCard and ConnectorCard patterns.

- **apps/web/src/client/components/settings/integrations/index.ts** (2 lines) — barrel export for the integrations components.

### new files (agent-core types)

- **packages/agent-core/src/types/integrations.ts** (160 lines) — shared type definitions used by both desktop and web. IntegrationPlatform enum, IntegrationStatus enum, IntegrationConfig interface, IntegrationProvider interface, QRCodeData, TunnelConfig, IncomingMessage, IIntegrationManager, IntegrationTaskProgressEvent.

### new files (dev tooling)

- **apps/desktop/scripts/dev-vite.cjs** (32 lines) — cross-platform Vite dev starter. Sets ACCOMPLISH_ROUTER_URL and ensures System32 is in PATH on Windows so vite-plugin-electron can use taskkill for HMR restarts.

### modified files (wiring the integration into the app)

- **apps/desktop/src/main/index.ts** (+42 lines) — imports and initializes the IntegrationManager on app ready, registers integration IPC handlers, adds cleanup on before-quit.

- **apps/desktop/src/main/ipc/handlers.ts** (+4 lines) — calls registerIntegrationHandlers() to wire integration IPC into the handler registration flow.

- **apps/desktop/src/preload/index.ts** (+197 lines) — exposes window.accomplish.integrations API (list, connect, disconnect, status, setupTunnel, toggleTunnel) via contextBridge so the renderer can talk to the integration manager.

- **apps/web/src/client/components/layout/SettingsDialog.tsx** (+17 lines) — adds the Integrations tab to the settings dialog alongside Providers, Skills, Connectors, Voice, and About.

- **apps/web/locales/en/settings.json** (+1 line) — adds the "Integrations" translation key.

- **apps/web/src/client/lib/accomplish.ts** (+9 lines) — extends the AccomplishAPI TypeScript interface with the integrations methods.

- **apps/web/src/client/vite-env.d.ts** (+72 lines) — adds TypeScript ambient declarations for window.accomplish.integrations and window.accomplishShell so the web app can reference the preload-exposed APIs without type errors.

### modified files (build and config)

- **apps/desktop/package.json** (+15 lines) — adds whatsapp-web.js dependency (used as a type reference, not for actual WA connection).

- **apps/desktop/tsconfig.json** (+5 lines) — extends include paths to cover the new integrations and tunnel directories.

- **apps/desktop/vite.config.ts** (+15 lines) — adds a Vite build entry for the WhatsApp preload script so it gets compiled to dist-electron/preload/integrations/whatsapp.cjs.

- **apps/web/tsconfig.client.json** (+1 line) — extends include to cover the new integrations components.

- **packages/agent-core/src/index.ts** (+11 lines) — exports the integration types from agent-core so desktop and web can both import them.

- **packages/agent-core/src/types/index.ts** (+11 lines) — barrel export for the new integrations type module.

- **packages/agent-core/mcp-tools/\*/package.json** (6 files, +1 line each) — adds missing type field to package.json files. These were flagged during dependency resolution and are unrelated housekeeping.

- **packages/agent-core/src/opencode/cli-resolver.ts** (+21 lines) — minor type fix for OpenCode CLI resolver compatibility.

- **scripts/dev.cjs** (+10 lines) — updates the root dev script to wait for the web server before starting Electron, improving dev startup reliability.

- **pnpm-lock.yaml** (+2163 lines) — lockfile changes from added dependencies.
