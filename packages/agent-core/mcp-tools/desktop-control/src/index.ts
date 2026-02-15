#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';

const execAsync = promisify(exec);

const PERMISSION_API_PORT = process.env.PERMISSION_API_PORT || '9226';
const PERMISSION_API_URL = `http://localhost:${PERMISSION_API_PORT}/permission`;

const platform = os.platform();

// ─── Permission helper ───────────────────────────────────────────────────────

async function requestDesktopPermission(
  action: string,
  details: string
): Promise<boolean> {
  try {
    const response = await fetch(PERMISSION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'modify',
        filePath: `[Desktop Action] ${action}`,
        contentPreview: details.substring(0, 500),
      }),
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as { allowed: boolean };
    return result.allowed;
  } catch {
    console.error('[desktop-control] Permission API unreachable, denying action');
    return false;
  }
}

// ─── Platform-specific implementations ───────────────────────────────────────

async function takeScreenshot(): Promise<{ filepath: string; base64: string }> {
  const tmpDir = os.tmpdir();
  const filename = `accomplish-screenshot-${Date.now()}.png`;
  const filepath = path.join(tmpDir, filename);

  if (platform === 'darwin') {
    await execAsync(`screencapture -x "${filepath}"`);
  } else if (platform === 'win32') {
    // PowerShell screenshot using .NET
    const escapedPath = filepath.replace(/\\/g, '\\\\');
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$screen = [System.Windows.Forms.Screen]::PrimaryScreen',
      '$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)',
      '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
      '$graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)',
      `$bitmap.Save('${escapedPath}')`,
      '$graphics.Dispose()',
      '$bitmap.Dispose()',
    ].join('; ');
    await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
  } else {
    // Linux - try multiple screenshot tools
    try {
      await execAsync(`gnome-screenshot -f "${filepath}" 2>/dev/null`);
    } catch {
      try {
        await execAsync(`scrot "${filepath}" 2>/dev/null`);
      } catch {
        await execAsync(`import -window root "${filepath}"`);
      }
    }
  }

  // Read image for base64 content
  const imageBuffer = await readFile(filepath);
  const base64 = imageBuffer.toString('base64');

  return { filepath, base64 };
}

async function typeText(text: string): Promise<void> {
  if (platform === 'darwin') {
    // Use AppleScript for typing
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await execAsync(
      `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`
    );
  } else if (platform === 'win32') {
    // Use PowerShell SendKeys
    const escaped = text
      .replace(/[+^%~(){}[\]]/g, '{$&}')
      .replace(/"/g, '`"');
    await execAsync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`
    );
  } else {
    // Linux - xdotool
    await execAsync(`xdotool type --delay 50 "${text.replace(/"/g, '\\"')}"`);
  }
}

async function pressKey(keys: string): Promise<void> {
  if (platform === 'darwin') {
    // Parse key combination and use AppleScript
    const parts = keys.toLowerCase().split('+').map(k => k.trim());
    const modifiers: string[] = [];
    let mainKey = '';

    for (const part of parts) {
      switch (part) {
        case 'cmd':
        case 'command':
          modifiers.push('command down');
          break;
        case 'ctrl':
        case 'control':
          modifiers.push('control down');
          break;
        case 'alt':
        case 'option':
          modifiers.push('option down');
          break;
        case 'shift':
          modifiers.push('shift down');
          break;
        default:
          mainKey = part;
      }
    }

    const keyCodeMap: Record<string, number> = {
      'return': 36, 'enter': 36, 'tab': 48, 'space': 49,
      'delete': 51, 'escape': 53, 'esc': 53,
      'up': 126, 'down': 125, 'left': 123, 'right': 124,
      'f1': 122, 'f2': 120, 'f3': 99, 'f4': 118,
      'f5': 96, 'f6': 97, 'f7': 98, 'f8': 100,
    };

    if (modifiers.length > 0) {
      const modString = modifiers.join(', ');
      if (keyCodeMap[mainKey] !== undefined) {
        await execAsync(
          `osascript -e 'tell application "System Events" to key code ${keyCodeMap[mainKey]} using {${modString}}'`
        );
      } else {
        await execAsync(
          `osascript -e 'tell application "System Events" to keystroke "${mainKey}" using {${modString}}'`
        );
      }
    } else if (keyCodeMap[mainKey] !== undefined) {
      await execAsync(
        `osascript -e 'tell application "System Events" to key code ${keyCodeMap[mainKey]}'`
      );
    } else {
      await execAsync(
        `osascript -e 'tell application "System Events" to keystroke "${mainKey}"'`
      );
    }
  } else if (platform === 'win32') {
    // Map key names to SendKeys format
    const keyMap: Record<string, string> = {
      'enter': '{ENTER}', 'return': '{ENTER}', 'tab': '{TAB}',
      'escape': '{ESC}', 'esc': '{ESC}', 'space': ' ',
      'delete': '{DELETE}', 'backspace': '{BACKSPACE}',
      'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
      'home': '{HOME}', 'end': '{END}', 'pageup': '{PGUP}', 'pagedown': '{PGDN}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
      'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
      'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
    };
    const parts = keys.toLowerCase().split('+').map(k => k.trim());
    let sendKeysStr = '';
    let mainKey = '';

    for (const part of parts) {
      switch (part) {
        case 'ctrl':
        case 'control':
          sendKeysStr += '^';
          break;
        case 'alt':
          sendKeysStr += '%';
          break;
        case 'shift':
          sendKeysStr += '+';
          break;
        default:
          mainKey = part;
      }
    }

    sendKeysStr += keyMap[mainKey] || mainKey;
    const escaped = sendKeysStr.replace(/'/g, "''");
    await execAsync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`
    );
  } else {
    // Linux - xdotool
    const parts = keys.toLowerCase().split('+').map(k => k.trim());
    const xdoKeyMap: Record<string, string> = {
      'ctrl': 'ctrl', 'control': 'ctrl', 'alt': 'alt',
      'shift': 'shift', 'cmd': 'super', 'command': 'super',
      'enter': 'Return', 'return': 'Return', 'tab': 'Tab',
      'escape': 'Escape', 'esc': 'Escape', 'space': 'space',
      'delete': 'Delete', 'backspace': 'BackSpace',
      'up': 'Up', 'down': 'Down', 'left': 'Left', 'right': 'Right',
    };
    const mapped = parts.map(p => xdoKeyMap[p] || p);
    await execAsync(`xdotool key ${mapped.join('+')}`);
  }
}

async function clickMouse(x: number, y: number, button: string = 'left', doubleClick: boolean = false): Promise<void> {
  if (platform === 'darwin') {
    // Use cliclick if available, otherwise AppleScript
    try {
      const btnFlag = button === 'right' ? 'rc' : (doubleClick ? 'dc' : 'c');
      await execAsync(`cliclick ${btnFlag}:${x},${y}`);
    } catch {
      // Fallback to AppleScript for mouse control
      const clickCount = doubleClick ? 2 : 1;
      await execAsync(
        `osascript -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'delay 0.05'`.repeat(clickCount)
      );
    }
  } else if (platform === 'win32') {
    const psLines = [
      'Add-Type -AssemblyName System.Windows.Forms',
      `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`,
      "Add-Type @'",
      'using System; using System.Runtime.InteropServices;',
      'public class MouseHelper {',
      '  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);',
      '}',
      "'@",
    ];
    const clickCount = doubleClick ? 2 : 1;
    for (let i = 0; i < clickCount; i++) {
      if (button === 'right') {
        psLines.push('[MouseHelper]::mouse_event(0x0008, 0, 0, 0, 0)');
        psLines.push('[MouseHelper]::mouse_event(0x0010, 0, 0, 0, 0)');
      } else {
        psLines.push('[MouseHelper]::mouse_event(0x0002, 0, 0, 0, 0)');
        psLines.push('[MouseHelper]::mouse_event(0x0004, 0, 0, 0, 0)');
      }
    }
    const psScript = psLines.join('; ');
    await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`);
  } else {
    // Linux - xdotool
    const btnNum = button === 'right' ? 3 : (button === 'middle' ? 2 : 1);
    const repeatFlag = doubleClick ? '--repeat 2 --delay 50' : '';
    await execAsync(`xdotool mousemove ${x} ${y} click ${repeatFlag} ${btnNum}`);
  }
}

async function listWindows(): Promise<string> {
  if (platform === 'darwin') {
    const { stdout } = await execAsync(
      `osascript -e '
        set windowList to ""
        tell application "System Events"
          set allProcesses to every process whose visible is true
          repeat with proc in allProcesses
            set procName to name of proc
            try
              set winNames to name of every window of proc
              repeat with w in winNames
                set windowList to windowList & procName & " - " & w & linefeed
              end repeat
            end try
          end repeat
        end tell
        return windowList
      '`
    );
    return stdout.trim() || 'No visible windows found.';
  } else if (platform === 'win32') {
    const { stdout } = await execAsync(
      `powershell -Command "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object ProcessName, MainWindowTitle | Format-Table -AutoSize | Out-String"`
    );
    return stdout.trim() || 'No visible windows found.';
  } else {
    // Linux - wmctrl or xdotool
    try {
      const { stdout } = await execAsync('wmctrl -l');
      return stdout.trim() || 'No visible windows found.';
    } catch {
      const { stdout } = await execAsync(
        'xdotool search --name "" getwindowname %@ 2>/dev/null | head -50'
      );
      return stdout.trim() || 'No visible windows found.';
    }
  }
}

async function focusWindow(title: string): Promise<string> {
  if (platform === 'darwin') {
    const { stdout } = await execAsync(
      `osascript -e '
        tell application "System Events"
          set allProcesses to every process whose visible is true
          repeat with proc in allProcesses
            try
              set winNames to name of every window of proc
              repeat with w in winNames
                if w contains "${title.replace(/"/g, '\\"')}" then
                  set frontmost of proc to true
                  perform action "AXRaise" of (first window of proc whose name contains "${title.replace(/"/g, '\\"')}")
                  return "Focused: " & name of proc & " - " & w
                end if
              end repeat
            end try
          end repeat
        end tell
        return "Window not found: ${title.replace(/"/g, '\\"')}"
      '`
    );
    return stdout.trim();
  } else if (platform === 'win32') {
    const escaped = title.replace(/'/g, "''");
    const { stdout } = await execAsync(
      `powershell -Command "$wnd = Get-Process | Where-Object { $_.MainWindowTitle -like '*${escaped}*' } | Select-Object -First 1; if ($wnd) { Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinHelper {
  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
'@; [WinHelper]::ShowWindow($wnd.MainWindowHandle, 9); [WinHelper]::SetForegroundWindow($wnd.MainWindowHandle); Write-Output ('Focused: ' + $wnd.ProcessName + ' - ' + $wnd.MainWindowTitle) } else { Write-Output 'Window not found: ${escaped}' }"`
    );
    return stdout.trim();
  } else {
    try {
      await execAsync(`wmctrl -a "${title.replace(/"/g, '\\"')}"`);
      return `Focused: ${title}`;
    } catch {
      try {
        const { stdout } = await execAsync(
          `xdotool search --name "${title.replace(/"/g, '\\"')}" | head -1`
        );
        const winId = stdout.trim();
        if (winId) {
          await execAsync(`xdotool windowactivate ${winId}`);
          return `Focused: ${title}`;
        }
      } catch {
        // fall through
      }
      return `Window not found: ${title}`;
    }
  }
}

async function openApplication(appName: string): Promise<string> {
  if (platform === 'darwin') {
    try {
      await execAsync(`open -a "${appName.replace(/"/g, '\\"')}"`);
      return `Opened: ${appName}`;
    } catch {
      return `Failed to open: ${appName}. Application may not be installed.`;
    }
  } else if (platform === 'win32') {
    try {
      // Try Start-Process first for common apps
      await execAsync(`powershell -Command "Start-Process '${appName.replace(/'/g, "''")}'" `);
      return `Opened: ${appName}`;
    } catch {
      return `Failed to open: ${appName}. Application may not be installed.`;
    }
  } else {
    try {
      await execAsync(`nohup ${appName.replace(/"/g, '\\"')} &>/dev/null &`);
      return `Opened: ${appName}`;
    } catch {
      return `Failed to open: ${appName}. Application may not be installed.`;
    }
  }
}

async function getScreenInfo(): Promise<string> {
  if (platform === 'darwin') {
    const { stdout } = await execAsync(
      `system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Resolution|Display Type" | head -5`
    );
    return stdout.trim() || 'Could not retrieve screen info.';
  } else if (platform === 'win32') {
    const { stdout } = await execAsync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + ': ' + $_.Bounds.Width + 'x' + $_.Bounds.Height + ' (Working: ' + $_.WorkingArea.Width + 'x' + $_.WorkingArea.Height + ')' }"`
    );
    return stdout.trim() || 'Could not retrieve screen info.';
  } else {
    try {
      const { stdout } = await execAsync('xrandr --current | grep " connected"');
      return stdout.trim() || 'Could not retrieve screen info.';
    } catch {
      return 'Could not retrieve screen info. xrandr not available.';
    }
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'desktop-control', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'desktop_screenshot',
      description:
        'Take a screenshot of the entire screen. Returns the file path of the saved screenshot image. Useful for seeing the current state of the desktop.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'desktop_type',
      description:
        'Type text into the currently focused application. The text will be sent as keystrokes to whatever window/input field is active.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text to type',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'desktop_key',
      description:
        'Press a keyboard shortcut or key combination. Use "+" to combine keys. Examples: "ctrl+c", "cmd+shift+s", "enter", "tab", "escape", "f5".',
      inputSchema: {
        type: 'object',
        properties: {
          keys: {
            type: 'string',
            description:
              'Key combination using "+" separator. Modifiers: ctrl, alt, shift, cmd/command. Keys: enter, tab, escape, space, delete, backspace, up, down, left, right, f1-f12, or any single character.',
          },
        },
        required: ['keys'],
      },
    },
    {
      name: 'desktop_click',
      description:
        'Click at specific screen coordinates. Use desktop_screenshot first to identify target positions.',
      inputSchema: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'X coordinate (pixels from left edge of screen)',
          },
          y: {
            type: 'number',
            description: 'Y coordinate (pixels from top edge of screen)',
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            description: 'Mouse button to click (default: left)',
          },
          doubleClick: {
            type: 'boolean',
            description: 'Whether to double-click (default: false)',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'desktop_window_list',
      description:
        'List all visible windows with their titles and application names. Useful for finding a window to focus on.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'desktop_window_focus',
      description:
        'Bring a specific window to the foreground by matching its title. Partial title matching is supported.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Full or partial window title to search for and focus',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'desktop_open_app',
      description:
        'Open/launch a desktop application by name. On macOS uses "open -a", on Windows uses Start-Process, on Linux runs the command directly.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Application name. macOS examples: "Safari", "Finder", "TextEdit". Windows examples: "notepad", "calc", "explorer". Linux examples: "firefox", "nautilus", "gedit".',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'desktop_screen_info',
      description:
        'Get information about connected displays including resolution and dimensions. Useful for understanding coordinate space before clicking.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const toolName = request.params.name;
  const args = request.params.arguments as Record<string, unknown>;

  try {
    switch (toolName) {
      case 'desktop_screenshot': {
        const allowed = await requestDesktopPermission(
          'screenshot',
          'Take a screenshot of the entire screen'
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the screenshot action.' }],
          };
        }

        const { filepath, base64 } = await takeScreenshot();
        return {
          content: [
            {
              type: 'image',
              data: base64,
              mimeType: 'image/png',
            },
            { type: 'text', text: `Screenshot saved to: ${filepath}` },
          ],
        };
      }

      case 'desktop_type': {
        const text = args.text as string;
        if (!text) {
          return {
            content: [{ type: 'text', text: 'Error: text parameter is required' }],
            isError: true,
          };
        }

        const allowed = await requestDesktopPermission(
          'type text',
          `Type "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" into the active window`
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the type action.' }],
          };
        }

        await typeText(text);
        return {
          content: [{ type: 'text', text: `Typed: "${text.substring(0, 200)}"` }],
        };
      }

      case 'desktop_key': {
        const keys = args.keys as string;
        if (!keys) {
          return {
            content: [{ type: 'text', text: 'Error: keys parameter is required' }],
            isError: true,
          };
        }

        const allowed = await requestDesktopPermission(
          'press keys',
          `Press key combination: ${keys}`
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the key press action.' }],
          };
        }

        await pressKey(keys);
        return {
          content: [{ type: 'text', text: `Pressed: ${keys}` }],
        };
      }

      case 'desktop_click': {
        const x = args.x as number;
        const y = args.y as number;
        const button = (args.button as string) || 'left';
        const doubleClick = (args.doubleClick as boolean) || false;

        if (x === undefined || y === undefined) {
          return {
            content: [{ type: 'text', text: 'Error: x and y coordinates are required' }],
            isError: true,
          };
        }

        const clickType = doubleClick ? 'double-click' : 'click';
        const allowed = await requestDesktopPermission(
          'mouse click',
          `${button} ${clickType} at screen position (${x}, ${y})`
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the click action.' }],
          };
        }

        await clickMouse(x, y, button, doubleClick);
        return {
          content: [{ type: 'text', text: `${doubleClick ? 'Double-clicked' : 'Clicked'} (${button}) at (${x}, ${y})` }],
        };
      }

      case 'desktop_window_list': {
        const result = await listWindows();
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'desktop_window_focus': {
        const title = args.title as string;
        if (!title) {
          return {
            content: [{ type: 'text', text: 'Error: title parameter is required' }],
            isError: true,
          };
        }

        const allowed = await requestDesktopPermission(
          'focus window',
          `Bring window to foreground: "${title}"`
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the focus window action.' }],
          };
        }

        const result = await focusWindow(title);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'desktop_open_app': {
        const name = args.name as string;
        if (!name) {
          return {
            content: [{ type: 'text', text: 'Error: name parameter is required' }],
            isError: true,
          };
        }

        const allowed = await requestDesktopPermission(
          'open application',
          `Open application: ${name}`
        );
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Permission denied: User declined the open app action.' }],
          };
        }

        const result = await openApplication(name);
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      case 'desktop_screen_info': {
        const result = await getScreenInfo();
        return {
          content: [{ type: 'text', text: result }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Error: Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error executing ${toolName}: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Desktop Control MCP Server started');
  console.error(`Platform: ${platform}`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
