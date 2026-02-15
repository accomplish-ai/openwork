---
name: desktop-control
description: Control native desktop applications — take screenshots, click, type, press hotkeys, list/focus windows, and open apps. Works on macOS, Windows, and Linux. Every action requires user permission before execution.
---

# Desktop Control

Use this MCP tool to automate native desktop applications beyond the browser and CLI. This enables you to interact with any visible application on the user's screen.

## Critical: Permission Required

**Every desktop action that modifies state (click, type, key press, open app, screenshot) requires user permission.** The tool automatically requests permission through the UI — the user must approve before the action executes.

**Safe actions** (listing windows, screen info) do NOT require permission.

## Best Practices

1. **Always screenshot first** — Before clicking or typing, take a screenshot to see the current state
2. **Verify after actions** — Take another screenshot after important actions to confirm they worked
3. **Use window list before focus** — List windows to find the exact title before focusing
4. **Get screen info for clicks** — Check display dimensions before using coordinates
5. **Combine with browser tools** — Use desktop tools for native apps and browser tools for web pages

## Available Tools

### `desktop_screenshot`

Take a screenshot of the entire screen. Returns **both** the image (for vision analysis) and the file path of the saved PNG.

```json
{ }
```

**Use cases:**
- See what's currently on screen before taking action
- Verify the result of previous actions
- Identify UI element positions for clicking
- The image content is returned directly — you can analyze it inline

### `desktop_type`

Type text into the currently focused application/input field.

```json
{ "text": "Hello, world!" }
```

**Important:** Focus the correct window/field first using `desktop_window_focus` or `desktop_click`.

### `desktop_key`

Press a keyboard shortcut or key combination. Use `+` to combine modifier keys.

```json
{ "keys": "ctrl+c" }
```

**Modifiers:** `ctrl`, `alt`, `shift`, `cmd` (macOS) / `command`

**Special keys:** `enter`, `tab`, `escape`, `space`, `delete`, `backspace`, `up`, `down`, `left`, `right`, `f1`-`f12`, `home`, `end`, `pageup`, `pagedown`

**Examples:**
- `ctrl+c` — Copy
- `ctrl+v` — Paste
- `cmd+shift+s` — Save As (macOS)
- `alt+f4` — Close window (Windows/Linux)
- `enter` — Press Enter
- `tab` — Press Tab

### `desktop_click`

Click at specific screen coordinates.

```json
{ "x": 500, "y": 300, "button": "left", "doubleClick": false }
```

- `button`: `"left"` (default), `"right"`, `"middle"`
- `doubleClick`: `true` for double-click (default: `false`)
- **Tip:** Use `desktop_screenshot` first, then `desktop_screen_info` to understand the coordinate space.

### `desktop_window_list`

List all visible windows with their application names and titles. No parameters needed.

```json
{ }
```

### `desktop_window_focus`

Bring a window to the foreground by title. Supports partial matching.

```json
{ "title": "Visual Studio Code" }
```

### `desktop_open_app`

Launch a desktop application by name.

```json
{ "name": "TextEdit" }
```

**Platform-specific names:**
| Action | macOS | Windows | Linux |
|--------|-------|---------|-------|
| Text editor | `TextEdit` | `notepad` | `gedit` |
| File manager | `Finder` | `explorer` | `nautilus` |
| Calculator | `Calculator` | `calc` | `gnome-calculator` |
| Terminal | `Terminal` | `cmd` | `gnome-terminal` |
| Web browser | `Safari` | `msedge` | `firefox` |

### `desktop_screen_info`

Get display resolution and dimensions. Useful before clicking to understand coordinate bounds.

```json
{ }
```

## Workflow Examples

### Opening an app and typing into it

1. `desktop_open_app({ "name": "TextEdit" })` — Launch the app
2. Wait a moment for the app to load
3. `desktop_type({ "text": "Meeting Notes\n\n" })` — Type content
4. `desktop_key({ "keys": "cmd+s" })` — Save the file

### Finding and focusing a window

1. `desktop_window_list()` — See all open windows
2. `desktop_window_focus({ "title": "Slack" })` — Focus the target window
3. `desktop_type({ "text": "Hello team!" })` — Type into it

### Clicking a specific UI element

1. `desktop_screenshot()` — See the current screen
2. `desktop_screen_info()` — Get screen dimensions
3. `desktop_click({ "x": 150, "y": 400 })` — Click the target element
4. `desktop_screenshot()` — Verify the result

## Platform Notes

### macOS
- Requires **Accessibility** permission in System Preferences > Privacy & Security
- Uses AppleScript for keyboard/window operations
- Uses `screencapture` for screenshots
- Install `cliclick` (via Homebrew) for reliable mouse clicking

### Windows
- Uses PowerShell/.NET for automation
- May need to run as Administrator for some system-level actions
- Uses `SendKeys` for keyboard input

### Linux
- Uses `xdotool` for keyboard/mouse (install: `sudo apt install xdotool`)
- Uses `wmctrl` for window management (install: `sudo apt install wmctrl`)
- Uses `scrot` or `gnome-screenshot` for screenshots

## Limitations

- **Desktop actions are NOT undoable** — always confirm with the user before destructive operations
- **Screen coordinates vary** with display scaling and multi-monitor setups
- **Some apps** may block automated input (password managers, banking apps)
- **Accessibility permissions** must be granted by the user on macOS
