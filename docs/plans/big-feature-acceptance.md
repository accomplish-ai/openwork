# Acceptance Criteria and Non-Goals: Desktop Control Reliability + Live Vision

## Acceptance Criteria
- Screenshot capture succeeds in at least 95% of routine macOS sessions, measured via telemetry over a rolling 7-day window.
- Live vision sessions deliver a usable frame within 2 seconds in at least 95% of attempts.
- Action executor steps (mouse/keyboard) complete successfully in at least 90% of standard task flows.
- When preflight/readiness fails, the UI shows a clear diagnostic state with actionable remediation steps within one interaction.
- Tool failures return structured errors with consistent codes across IPC, MCP, and renderer surfaces.
- Feature flag allows immediate disablement of live sampling and action execution without app restart.
- Automated tests cover readiness/preflight logic and at least one end-to-end happy path for capture + action flow.

## Non-Goals
- Expanding desktop control to non-macOS platforms.
- Redesigning the entire execution UI or chat layout.
- Adding new action types beyond existing mouse/keyboard capabilities.
- Building new third-party integrations or external streaming services.
- Shipping a generalized remote desktop product; scope remains local desktop control.
- Guaranteeing 100% tool success in all hardware/permission states.
