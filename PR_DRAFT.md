## Summary

This feature solves the context-switching problem by embedding the browser view directly into the chat interface. It streams content as the agent works using CDP, replacing the need for a separate window.

## Type of Change

- [ ] Bug fix
- [x] New feature
- [ ] Refactor
- [ ] Documentation update

## Technical Details & Architecture

- **Protocol:** Uses CDP `Page.startScreencast` with `format: 'jpeg'`, `quality: 50`, and `everyNthFrame: 5` (approx 10 FPS).
- **IPC Events:** Implements `browser:frame` (Base64 JPEG), `browser:navigate`, and `browser:status`.
- **Component:** Adds `BrowserPreview.tsx` to render the stream in the chat interface.
- **Optimization:** Streams are paused when hidden to save resources.

## How to Test

1. Run the desktop app: `pnpm dev`
2. Trigger a browser-based task (e.g., 'Go to google.com and search for cats').
3. Verify that the browser view appears **inline** in the chat and updates in real-time.
4. Verify `pnpm -F @accomplish/desktop test` passes.
5. Verify `pnpm -F @accomplish/web test` passes.

## Screenshots / Videos

[Placeholder for a screenshot of the inline browser view]

## Checklist

- [x] My code follows the style guidelines of this project (`CLAUDE.md`)
- [x] I have performed a self-review of my own code
- [x] I have verified that `pnpm typecheck` passes
- [x] I have verified that `pnpm lint` passes

## Linked Issues

Fixes #191
