# Impacted Modules and Interfaces: Desktop Control Reliability + Live Vision

This inventory highlights the primary touchpoints that govern screen capture, live view, and action execution flows. It is scoped to the current desktop control stack and shared contracts.

## apps/desktop (main process)
- `apps/desktop/src/main/services/desktop-context-service.ts`: Captures desktop context (windows, accessibility, screenshots), enforces screenshot size limits, and aggregates context responses.
- `apps/desktop/src/main/services/screen-capture.ts`: Uses Electron `desktopCapturer` to grab screen frames; core path for screenshot reliability.
- `apps/desktop/src/main/services/desktop-context-polling.ts`: Polls for desktop context on intervals; surfaces repeated screenshot capture during live guidance.
- `apps/desktop/src/main/services/desktop-context-protocol.ts`: Protocol contract for desktop context options + snapshots in main process.
- `apps/desktop/src/main/desktop-control/preflight.ts`: Permission/readiness preflight logic for screen recording + accessibility.
- `apps/desktop/src/main/desktop-control/readiness.ts`: Aggregates readiness checks + MCP health for screen capture/action execution.
- `apps/desktop/src/main/ipc/handlers.ts`: IPC endpoints for screenshot capture + mouse actions; central error handling for desktop control calls.
- `apps/desktop/src/main/ipc/message-utils.ts`: Normalizes tool attachments (including screenshots) for renderer messages.
- `apps/desktop/src/main/opencode/config-generator.ts`: Generates tool instructions and live-view workflow guidance; defines MCP server commands.
- `apps/desktop/src/main/opencode/mcp-supervisor.ts`: Tracks MCP server health for screen capture/live stream/action executor.
- `apps/desktop/src/main/store/appSettings.ts`: Feature flags for desktop control preflight + live screen sampling.
- `apps/desktop/src/main/desktop-control/readiness.test.ts`: Tests for readiness checks and MCP configuration wiring.

## apps/desktop (preload + renderer)
- `apps/desktop/src/preload/index.ts`: Renderer bridge for desktop control IPC (mouse actions, settings toggles, context capture).
- `apps/desktop/src/renderer/components/screen-viewer/ScreenViewer.tsx`: Live screen viewer component for streaming frames.
- `apps/desktop/src/renderer/components/FloatingChat.tsx`: Live guidance toggle + screenshot hints; attaches screenshots to tool messages.
- `apps/desktop/src/renderer/pages/Execution.tsx`: Primary execution UI with live screen toggle surface.
- `apps/desktop/src/renderer/components/desktop-control/DiagnosticsPanel.tsx`: User-facing diagnostics for missing permissions and readiness failures.
- `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx`: User controls for enabling mouse/keyboard permissions and live screen sampling.

## apps/desktop (skills + native helpers)
- `apps/desktop/skills/screen-capture`: MCP server for screenshots; reliability improvements land here.
- `apps/desktop/skills/live-screen-stream`: MCP server for live view; sampling cadence + frame delivery.
- `apps/desktop/skills/action-executor`: MCP server for mouse/keyboard actions.
- `apps/desktop/native/desktop-context-helper.swift`: Native macOS helper for desktop context capture and accessibility inspection.

## packages/shared (types)
- `packages/shared/src/types/desktop-context.ts`: Shared interfaces for windows, accessibility tree, screenshots, and capture options.
- `packages/shared/src/types/desktop-control.ts`: Readiness + MCP health contracts, tool error structures.
- `packages/shared/src/types/mouse-control.ts`: Mouse move/click payloads used across IPC boundaries.
- `packages/shared/src/types/task.ts`: Task attachment schema for screenshot payloads.

## src/shared (renderer contracts)
- `src/shared/contracts/desktopControlBridge.ts`: Renderer bridge contract for desktop control status + IPC failure normalization.

## Cross-cutting interfaces
- IPC channels in `apps/desktop/src/main/ipc/handlers.ts` + `apps/desktop/src/preload/index.ts` for:
  - Desktop context capture (screenshots, windows, accessibility).
  - Mouse move/click actions.
  - Desktop control settings (allow mouse control, live sampling flags).
- MCP server wiring in `apps/desktop/src/main/opencode/config-generator.ts` and `apps/desktop/src/main/opencode/mcp-supervisor.ts` for:
  - `screen-capture`, `live-screen-stream`, and `action-executor` skills.
