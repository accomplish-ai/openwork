# Big Feature Telemetry + KPI Plan

## Goals
- Provide a single, consistent set of events to measure reliability, live vision readiness, and user-facing unblock flow quality.
- Tie telemetry directly to success metrics in the feature brief and acceptance criteria.
- Support troubleshooting by emitting structured failure context from main, renderer, and skills.

## KPI Summary (Rolling 7-Day Window)
- Screenshot success rate (capture attempts vs. successes).
- Action executor success rate (action attempts vs. successes).
- Live vision sampling readiness: time-to-first-frame <= 2s for 95% of sessions.
- Generic fallback response rate on tool failure (< 2%).
- Preflight blocked rate by reason (screen recording, accessibility, MCP health).
- MCP recovery time (crash -> ready) <= 5s.

## Correlation Fields (Attach to All Events Where Available)
- `taskId` (from task lifecycle)
- `sessionId` (desktop control or live vision session)
- `userId` (if available in app context)
- `appVersion`, `platform`, `osVersion`
- `modelId` (if an agent run is involved)
- `featureFlagState` (desktopControlPreflight, liveScreenSampling)

## Event Taxonomy

### Readiness + Permissions
- `desktop_control_preflight_started`
  - Emitted by: main process preflight runner
  - Payload: `checks: string[]`
- `desktop_control_preflight_completed`
  - Emitted by: main process preflight runner
  - Payload: `status: ready | needs_screen_recording_permission | needs_accessibility_permission | mcp_unhealthy`, `durationMs`
- `desktop_control_permission_blocked`
  - Emitted by: main process
  - Payload: `blockedBy: screen_recording | accessibility`, `systemSettingsPath`

### Screenshot Capture
- `screen_capture_attempted`
  - Emitted by: `apps/desktop/skills/screen-capture`
  - Payload: `mode: full_screen | window`, `includeCursor: boolean`, `attemptIndex`
- `screen_capture_succeeded`
  - Emitted by: `apps/desktop/skills/screen-capture`
  - Payload: `mode`, `durationMs`, `bytes`, `retryCount`
- `screen_capture_failed`
  - Emitted by: `apps/desktop/skills/screen-capture`
  - Payload: `mode`, `durationMs`, `errorCode`, `errorMessage`, `retryCount`

### Action Executor
- `action_executor_attempted`
  - Emitted by: `apps/desktop/skills/action-executor`
  - Payload: `actionType: click | type | press_key | move`, `attemptIndex`
- `action_executor_succeeded`
  - Emitted by: `apps/desktop/skills/action-executor`
  - Payload: `actionType`, `durationMs`
- `action_executor_failed`
  - Emitted by: `apps/desktop/skills/action-executor`
  - Payload: `actionType`, `durationMs`, `errorCode`, `errorMessage`

### Live Vision Sampling
- `live_vision_session_started`
  - Emitted by: `apps/desktop/skills/live-screen-stream`
  - Payload: `samplingRateFps`, `requestedDurationMs`
- `live_vision_frame_received`
  - Emitted by: `apps/desktop/skills/live-screen-stream`
  - Payload: `frameIndex`, `bytes`, `durationMs`
- `live_vision_session_ended`
  - Emitted by: `apps/desktop/skills/live-screen-stream`
  - Payload: `durationMs`, `framesDelivered`, `endedBy: explicit_stop | timeout | error`

### MCP Health + Recovery
- `mcp_health_changed`
  - Emitted by: main MCP supervisor
  - Payload: `skillName`, `status: healthy | unhealthy`, `reason`
- `mcp_restart_attempted`
  - Emitted by: main MCP supervisor
  - Payload: `skillName`, `attemptIndex`
- `mcp_restart_succeeded`
  - Emitted by: main MCP supervisor
  - Payload: `skillName`, `durationMs`
- `mcp_restart_failed`
  - Emitted by: main MCP supervisor
  - Payload: `skillName`, `durationMs`, `errorCode`, `errorMessage`

### Assistant Fallback Behavior
- `tool_failure_fallback_triggered`
  - Emitted by: renderer (assistant response pipeline)
  - Payload: `toolName`, `errorCode`, `blockerMessageShown: boolean`, `fixPathShown: boolean`, `followUpPrompted: boolean`
- `tool_failure_repeated_fallback`
  - Emitted by: renderer
  - Payload: `toolName`, `repeatCount`, `lastErrorCode`

## Emission Locations (Planned)
- Main process
  - Preflight checks, MCP supervisor health transitions, config/flag snapshots.
- Renderer
  - Assistant response pipeline for fallback behavior, diagnostics UI interactions (recheck, open settings).
- Skills
  - `screen-capture`, `action-executor`, `live-screen-stream` emit attempt/success/failure with structured error codes.

## KPI Mapping
- Screenshot success rate = `screen_capture_succeeded / screen_capture_attempted`.
- Action executor success rate = `action_executor_succeeded / action_executor_attempted`.
- Live vision readiness = 95th percentile of time-to-first-frame derived from `live_vision_session_started` to first `live_vision_frame_received`.
- Generic fallback rate = `tool_failure_fallback_triggered` with `blockerMessageShown=false` OR `tool_failure_repeated_fallback` / total tool failures.
- MCP recovery time = `mcp_restart_succeeded.durationMs` (and `mcp_health_changed` timestamps).

## Notes
- All error codes should align with shared `ToolErrorCode` once defined.
- Events should be rate-limited to avoid noisy per-frame logging; only key summary events per session should be emitted.
