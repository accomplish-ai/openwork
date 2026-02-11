---
'@accomplish_ai/agent-core': patch
---

feat(dev-browser-mcp): improve browser interaction reliability with coordinate fallbacks

- Add canvas app detection (Google Docs, Figma, etc.) with automatic coordinate-based interactions
- Add coordinate fallback for click, type, and hover when DOM interactions fail
- Add ARIA tree pruning to remove useless wrapper nodes and reduce snapshot noise
- Add configurable bounding box annotations in snapshot output (includeBoundingBoxes option)
- Fix Playwright silently hijacking downloads by resetting Browser.setDownloadBehavior
- Fix 0x0 viewport detection with window.innerWidth/innerHeight fallback
- Set default 1280x720 viewport for new pages
