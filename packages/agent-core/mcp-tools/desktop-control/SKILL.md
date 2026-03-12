````skill
---
name: desktop-control
description: Control the desktop natively — take screenshots, move the mouse, click, type text, press keyboard shortcuts, list and focus windows. Works on macOS, Windows and Linux using only built-in OS tools (plus optional extras noted below).
---

# Desktop Control

Use these MCP tools to automate the native desktop: capture the screen, drive the mouse and keyboard, and manage application windows.

## Platform prerequisites

| Tool | macOS | Windows | Linux |
|------|-------|---------|-------|
| `desktop_screenshot` | Built-in (`screencapture`) | Built-in (PowerShell) | `scrot` **or** `gnome-screenshot` |
| `desktop_mouse_click` | Built-in (`osascript`) + Accessibility permission | Built-in (PowerShell P/Invoke) | `xdotool` |
| `desktop_mouse_move` | **`cliclick`** (`brew install cliclick`) | Built-in (PowerShell P/Invoke) | `xdotool` |
| `desktop_type_text` | Built-in (`pbcopy` + `osascript`) | Built-in (PowerShell) | `xdotool` |
| `desktop_key_press` | Built-in (`osascript`) | Built-in (PowerShell) | `xdotool` |
| `desktop_list_windows` | Built-in (`osascript` JXA) | Built-in (PowerShell) | `xdotool` |
| `desktop_focus_window` | Built-in (`osascript`) | Built-in (PowerShell P/Invoke) | `xdotool` |

**macOS Accessibility permission** is required for mouse/keyboard tools. If they fail, ask the user to open *System Settings → Privacy & Security → Accessibility* and add Terminal (or the app running Accomplish).

## Tools

### `desktop_screenshot`
Capture the entire primary display. Returns a base64-encoded PNG image. No permission required.

```json
{}
```

### `desktop_mouse_click`
Click at absolute screen coordinates. Permission required.

```json
{
  "x": 640,
  "y": 400,
  "button": "left"
}
```

- `button`: `"left"` (default), `"right"`, or `"double"`

### `desktop_mouse_move`
Move the cursor without clicking. Permission required.

```json
{ "x": 100, "y": 200 }
```

> **macOS only**: requires `cliclick` — install with `brew install cliclick`.

### `desktop_type_text`
Type text at the current cursor position. Uses a clipboard-paste technique to support any Unicode without injection risk. Permission required.

```json
{ "text": "Hello World! 😀" }
```

### `desktop_key_press`
Press a key or keyboard shortcut. Permission required.

```json
{ "key": "ctrl+c" }
```

**Modifier names** (case-insensitive): `ctrl`, `cmd` / `command`, `alt` / `option`, `shift`  
**Special key names**: `Return`, `Escape`, `Tab`, `Space`, `Delete`, `Backspace`, `Up`, `Down`, `Left`, `Right`, `Home`, `End`, `PageUp`, `PageDown`, `F1`–`F12`

Examples:
- `"ctrl+c"` — copy
- `"cmd+shift+t"` — reopen tab (macOS)
- `"ctrl+shift+t"` — reopen tab (Windows/Linux)
- `"alt+F4"` — close window (Windows)
- `"Return"` — press Enter
- `"F5"` — reload

### `desktop_list_windows`
List all visible windows with their name and process ID. No permission required.

```json
{}
```

Returns a JSON array like:
```json
[
  { "name": "Chrome", "pid": 1234 },
  { "name": "Terminal", "pid": 5678 }
]
```

### `desktop_focus_window`
Bring a window to the foreground by application name. Permission required.

```json
{ "name": "Chrome" }
```

The name is matched exactly on macOS (process name), and as a substring on Windows and Linux.

## Common workflows

### Automate a form submission
1. Take a `desktop_screenshot` to see the current state.
2. Use `desktop_mouse_click` to focus the first input field.
3. Use `desktop_type_text` to fill in the value.
4. Press `Tab` with `desktop_key_press` to move to the next field.
5. Repeat until the form is complete.
6. Press `Return` or click the submit button.

### Copy and paste between applications
1. `desktop_focus_window` to switch to the source app.
2. Select all with `desktop_key_press` `"ctrl+a"` (or `"cmd+a"` on macOS).
3. Copy with `desktop_key_press` `"ctrl+c"` / `"cmd+c"`.
4. `desktop_focus_window` to switch to the target app.
5. Paste with `desktop_key_press` `"ctrl+v"` / `"cmd+v"`.

### Verify UI state
1. `desktop_screenshot` — inspect what is currently on screen.
2. Decide next action based on the screenshot.

## Permissions

All mutating tools (click, move, type, key press, focus) require user approval before executing. The permission prompt shows the action name and relevant details. If the user denies, the tool returns a `"denied"` response and no action is taken.

If the permission API is unreachable, all mutating tools are automatically **denied** (fail-closed). Only `desktop_screenshot` and `desktop_list_windows` (read-only) proceed without going through the permission API.
````
