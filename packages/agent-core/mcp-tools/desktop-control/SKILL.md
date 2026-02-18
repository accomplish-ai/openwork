# Desktop Control

Control native desktop applications using keyboard, mouse, and window management tools.

## Available Tools

- **desktop_screenshot** — Take a screenshot of the entire desktop to see what's on screen
- **desktop_click** — Click at specific screen coordinates (x, y)
- **desktop_type** — Type text at the current cursor position
- **desktop_hotkey** — Press keyboard shortcuts (e.g., Cmd+C, Ctrl+V)
- **desktop_list_windows** — List all visible windows with positions and sizes
- **desktop_find_window** — Find windows by title pattern
- **desktop_focus_window** — Bring an application to the foreground
- **desktop_open_app** — Launch an application by name

## Workflow

1. **Always screenshot first** to see the current screen state
2. **List windows** to understand what's open
3. **Focus the target window** before clicking or typing
4. **Use coordinates from screenshots** for click actions
5. **Screenshot after actions** to verify results

## Platform Support

- **macOS**: Uses AppleScript, screencapture, and cliclick
- **Windows**: Uses PowerShell and SendKeys
- **Linux**: Uses xdotool, wmctrl, and scrot

## Permissions

- macOS requires **Accessibility** permission in System Preferences > Privacy & Security > Accessibility
- All actions except screenshots require user approval via the permission system

## Tips

- Use `desktop_hotkey` with `["command", "space"]` to open Spotlight on macOS
- Use `desktop_open_app` to launch apps before interacting with them
- Take screenshots frequently to track progress
- When clicking UI elements, screenshot first to find exact coordinates
