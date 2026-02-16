---
"@accomplish_ai/agent-core": patch
---

fix(agent-core): serialize non-string error values in TaskResult to prevent downstream TypeError

The stream parser casts JSON.parse output to OpenCodeMessage without runtime validation. When the
OpenCode CLI emits an error message with a non-string error field (e.g. an object like
`{name: "APIError", data: {...}}`), the raw object was passed through to TaskResult.error which is
typed as `string | undefined`. Downstream consumers calling `.toLowerCase()` on this value would
crash with `TypeError: errorName.toLowerCase is not a function`.

Added defensive coercion in the adapter's error handling path: string values pass through unchanged,
non-string values are serialized via JSON.stringify to preserve error details.
