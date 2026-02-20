---
'@accomplish_ai/agent-core': minor
'@accomplish/desktop': minor
---

feat: add WhatsApp integration via Baileys

- Add messaging types and storage migration (v009) in agent-core
- Add WhatsApp service with Baileys for QR-based authentication
- Add task bridge for routing incoming messages to AI tasks
- Add IPC handlers for connect/disconnect/config management
- Add Integrations tab in Settings with WhatsApp card UI
- Auto-reconnect on app startup if previously connected
