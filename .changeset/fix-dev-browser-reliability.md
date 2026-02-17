---
'@accomplish_ai/agent-core': patch
---

fix(dev-browser-mcp): browser automation reliability for Gmail and Google Drive

- Add Gmail and Google Drive to coordinate-click apps (renamed from canvas apps)
- Scroll element into view before reading bounding box for coordinate clicks
- Detect visually disabled buttons (CSS opacity, pointer-events, cursor) and annotate offscreen elements
- Default viewport_only to true for coordinate-click apps to reduce model confabulation
- Move mouse to viewport center before wheel scroll to target correct scroll container
