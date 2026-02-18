#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PERMISSION_API_PORT = process.env.PERMISSION_API_PORT || '9226';
const PERMISSION_API_URL = `http://localhost:${PERMISSION_API_PORT}/permission`;
const PLATFORM = process.platform;

// ─── Permission Helper ───────────────────────────────────────────────
async function requestDesktopPermission(action: string, details: string): Promise<boolean> {
  try {
    const response = await fetch(PERMISSION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'modify',
        filePath: `desktop-control://${action}`,
        contentPreview: `Desktop action: ${action}\n${details}`,
      }),
    });
    if (!response.ok) {
      return false;
    }
    const result = (await response.json()) as { allowed: boolean };
    return result.allowed;
  } catch {
    // If permission API is not available, default to allowed
    // (e.g. running standalone or in dev mode)
    console.error('[desktop-control] Permission API not available, defaulting to allowed');
    return true;
  }
}

// ─── Platform-specific helpers ───────────────────────────────────────

function runAppleScript(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}

function runPowerShell(script: string): string {
  return execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    timeout: 10000,
  }).trim();
}

// ─── Tool Implementations ────────────────────────────────────────────

async function desktopScreenshot(): Promise<CallToolResult> {
  const tmpDir = os.tmpdir();
  const filename = `desktop-screenshot-${Date.now()}.png`;
  const filepath = path.join(tmpDir, filename);

  try {
    if (PLATFORM === 'darwin') {
      execSync(`screencapture -x ${filepath}`, { timeout: 10000 });
    } else if (PLATFORM === 'win32') {
      // Use PowerShell to capture screen
      runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object {
          $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height);
          $graphics = [System.Drawing.Graphics]::FromImage($bitmap);
          $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size);
          $bitmap.Save('${filepath.replace(/\\/g, '\\\\')}');
        }
      `);
    } else {
      // Linux - try various tools
      try {
        execSync(`gnome-screenshot -f ${filepath}`, { timeout: 10000 });
      } catch {
        try {
          execSync(`scrot ${filepath}`, { timeout: 10000 });
        } catch {
          execSync(`import -window root ${filepath}`, { timeout: 10000 });
        }
      }
    }

    if (!fs.existsSync(filepath)) {
      return {
        content: [{ type: 'text', text: 'Error: Screenshot failed - file not created' }],
        isError: true,
      };
    }

    const imageData = fs.readFileSync(filepath);
    const base64 = imageData.toString('base64');
    // Clean up temp file
    fs.unlinkSync(filepath);

    return {
      content: [
        {
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        },
        {
          type: 'text',
          text: `Screenshot captured successfully (${imageData.length} bytes)`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error taking screenshot: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopClick(
  x: number,
  y: number,
  button: string = 'left',
): Promise<CallToolResult> {
  try {
    if (PLATFORM === 'darwin') {
      // Use cliclick if available, otherwise AppleScript + Python
      try {
        const clickCmd = button === 'right' ? 'rc' : 'c';
        execSync(`cliclick ${clickCmd}:${x},${y}`, { timeout: 5000 });
      } catch {
        // Fallback: use Python with Quartz
        const pyScript = `
import Quartz
event = Quartz.CGEventCreateMouseEvent(None, ${button === 'right' ? 'Quartz.kCGEventRightMouseDown' : 'Quartz.kCGEventLeftMouseDown'}, (${x}, ${y}), ${button === 'right' ? 'Quartz.kCGMouseButtonRight' : 'Quartz.kCGMouseButtonLeft'})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
event = Quartz.CGEventCreateMouseEvent(None, ${button === 'right' ? 'Quartz.kCGEventRightMouseUp' : 'Quartz.kCGEventLeftMouseUp'}, (${x}, ${y}), ${button === 'right' ? 'Quartz.kCGMouseButtonRight' : 'Quartz.kCGMouseButtonLeft'})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`;
        execSync(`python3 -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, {
          timeout: 5000,
        });
      }
    } else if (PLATFORM === 'win32') {
      runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y});
        Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class MouseOps {
          [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
        }
'@;
        [MouseOps]::mouse_event(${button === 'right' ? '0x0008' : '0x0002'}, 0, 0, 0, 0);
        [MouseOps]::mouse_event(${button === 'right' ? '0x0010' : '0x0004'}, 0, 0, 0, 0);
      `);
    } else {
      execSync(`xdotool mousemove ${x} ${y} click ${button === 'right' ? '3' : '1'}`, {
        timeout: 5000,
      });
    }

    return {
      content: [{ type: 'text', text: `Clicked at (${x}, ${y}) with ${button} button` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error clicking: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopType(text: string): Promise<CallToolResult> {
  try {
    if (PLATFORM === 'darwin') {
      try {
        // cliclick type
        execSync(`cliclick t:'${text.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
      } catch {
        // Fallback: AppleScript keystroke
        runAppleScript(
          `tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"`,
        );
      }
    } else if (PLATFORM === 'win32') {
      runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait('${text.replace(/'/g, "''")}');
      `);
    } else {
      execSync(`xdotool type -- '${text.replace(/'/g, "'\\''")}'`, { timeout: 10000 });
    }

    return {
      content: [{ type: 'text', text: `Typed: "${text}"` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error typing: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopHotkey(keys: string[]): Promise<CallToolResult> {
  try {
    if (PLATFORM === 'darwin') {
      // Convert key names to AppleScript format
      const modifiers: string[] = [];
      const keyParts: string[] = [];

      for (const key of keys) {
        const lower = key.toLowerCase();
        if (lower === 'command' || lower === 'cmd') {
          modifiers.push('command down');
        } else if (lower === 'shift') {
          modifiers.push('shift down');
        } else if (lower === 'option' || lower === 'alt') {
          modifiers.push('option down');
        } else if (lower === 'control' || lower === 'ctrl') {
          modifiers.push('control down');
        } else {
          keyParts.push(lower);
        }
      }

      const keyChar = keyParts[0] || '';
      const modString = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';
      runAppleScript(`tell application "System Events" to keystroke "${keyChar}"${modString}`);
    } else if (PLATFORM === 'win32') {
      // Convert to SendKeys format
      const keyMap: Record<string, string> = {
        ctrl: '^',
        control: '^',
        alt: '%',
        shift: '+',
        enter: '{ENTER}',
        tab: '{TAB}',
        escape: '{ESC}',
        esc: '{ESC}',
        delete: '{DELETE}',
        backspace: '{BACKSPACE}',
      };
      let sendKeysStr = '';
      for (const key of keys) {
        sendKeysStr += keyMap[key.toLowerCase()] || key;
      }
      runPowerShell(`
        Add-Type -AssemblyName System.Windows.Forms;
        [System.Windows.Forms.SendKeys]::SendWait('${sendKeysStr}');
      `);
    } else {
      execSync(`xdotool key ${keys.join('+')}`, { timeout: 5000 });
    }

    return {
      content: [{ type: 'text', text: `Pressed hotkey: ${keys.join('+')}` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error pressing hotkey: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopListWindows(): Promise<CallToolResult> {
  try {
    let windowList: string;

    if (PLATFORM === 'darwin') {
      // Use AppleScript to list all windows
      const script = `
set windowList to ""
tell application "System Events"
  set procList to every process whose visible is true
  repeat with proc in procList
    set procName to name of proc
    try
      set winList to every window of proc
      repeat with win in winList
        set winName to name of win
        set winPos to position of win
        set winSize to size of win
        set windowList to windowList & procName & " | " & winName & " | pos:" & (item 1 of winPos) & "," & (item 2 of winPos) & " | size:" & (item 1 of winSize) & "," & (item 2 of winSize) & "\\n"
      end repeat
    end try
  end repeat
end tell
return windowList`;
      windowList = runAppleScript(script);
    } else if (PLATFORM === 'win32') {
      windowList = runPowerShell(`
        Get-Process | Where-Object {$_.MainWindowTitle} | Format-Table Id, ProcessName, MainWindowTitle -AutoSize | Out-String
      `);
    } else {
      windowList = execSync(
        'wmctrl -l 2>/dev/null || xdotool search --name "" getwindowname %@ 2>/dev/null || echo "No window list tool available"',
        {
          encoding: 'utf8',
          timeout: 5000,
        },
      ).trim();
    }

    return {
      content: [
        {
          type: 'text',
          text: `Open windows:\n${windowList || 'No windows found'}`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error listing windows: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopFindWindow(title: string): Promise<CallToolResult> {
  try {
    let result: string;

    if (PLATFORM === 'darwin') {
      const script = `
set windowInfo to ""
tell application "System Events"
  set procList to every process whose visible is true
  repeat with proc in procList
    set procName to name of proc
    try
      set winList to every window of proc whose name contains "${title.replace(/"/g, '\\"')}"
      repeat with win in winList
        set winName to name of win
        set winPos to position of win
        set winSize to size of win
        set windowInfo to windowInfo & procName & " | " & winName & " | pos:" & (item 1 of winPos) & "," & (item 2 of winPos) & " | size:" & (item 1 of winSize) & "," & (item 2 of winSize) & "\\n"
      end repeat
    end try
  end repeat
end tell
return windowInfo`;
      result = runAppleScript(script);
    } else if (PLATFORM === 'win32') {
      result = runPowerShell(`
        Get-Process | Where-Object {$_.MainWindowTitle -like '*${title.replace(/'/g, "''")}*'} | Format-Table Id, ProcessName, MainWindowTitle -AutoSize | Out-String
      `);
    } else {
      result = execSync(
        `xdotool search --name "${title.replace(/"/g, '\\"')}" getwindowname %@ 2>/dev/null || echo "Not found"`,
        {
          encoding: 'utf8',
          timeout: 5000,
        },
      ).trim();
    }

    return {
      content: [
        {
          type: 'text',
          text: result
            ? `Windows matching "${title}":\n${result}`
            : `No windows found matching "${title}"`,
        },
      ],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error finding window: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopFocusWindow(appName: string): Promise<CallToolResult> {
  try {
    if (PLATFORM === 'darwin') {
      runAppleScript(`tell application "${appName.replace(/"/g, '\\"')}" to activate`);
    } else if (PLATFORM === 'win32') {
      runPowerShell(`
        $proc = Get-Process | Where-Object {$_.MainWindowTitle -like '*${appName.replace(/'/g, "''")}*'} | Select-Object -First 1;
        if ($proc) { [void][System.Runtime.InteropServices.Marshal]::GetActiveObject($proc.Id) }
      `);
    } else {
      execSync(`xdotool search --name "${appName.replace(/"/g, '\\"')}" windowactivate`, {
        timeout: 5000,
      });
    }

    return {
      content: [{ type: 'text', text: `Focused window: ${appName}` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error focusing window: ${msg}` }],
      isError: true,
    };
  }
}

async function desktopOpenApp(appName: string): Promise<CallToolResult> {
  try {
    if (PLATFORM === 'darwin') {
      execSync(`open -a "${appName.replace(/"/g, '\\"')}"`, { timeout: 10000 });
    } else if (PLATFORM === 'win32') {
      runPowerShell(`Start-Process "${appName.replace(/"/g, '\\"')}"`);
    } else {
      execSync(`${appName} &`, { timeout: 5000 });
    }

    return {
      content: [{ type: 'text', text: `Opened application: ${appName}` }],
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error opening app: ${msg}` }],
      isError: true,
    };
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────

const server = new Server(
  { name: 'desktop-control', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'desktop_screenshot',
      description:
        'Take a screenshot of the entire desktop. Returns the screenshot as a base64-encoded PNG image. Useful for seeing what is currently on screen before performing desktop actions.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'desktop_click',
      description:
        'Click at a specific screen coordinate. Use desktop_screenshot first to identify the coordinates of the target element.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate (pixels from left)' },
          y: { type: 'number', description: 'Y coordinate (pixels from top)' },
          button: {
            type: 'string',
            enum: ['left', 'right'],
            description: 'Mouse button to click (default: left)',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'desktop_type',
      description:
        'Type text at the current cursor position. The text is sent as keystrokes to the currently focused application.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
    {
      name: 'desktop_hotkey',
      description:
        'Press a keyboard shortcut (hotkey combination). Provide an array of key names. Modifier keys: "command"/"cmd", "control"/"ctrl", "alt"/"option", "shift". Regular keys: single characters or special keys like "enter", "tab", "escape", "delete", "backspace".',
      inputSchema: {
        type: 'object',
        properties: {
          keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of keys to press simultaneously. E.g. ["command", "c"] for Cmd+C',
          },
        },
        required: ['keys'],
      },
    },
    {
      name: 'desktop_list_windows',
      description:
        'List all visible windows on the desktop. Returns window titles, application names, positions, and sizes.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'desktop_find_window',
      description:
        'Find windows matching a title pattern. Returns matching window details including position and size.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Window title or partial title to search for' },
        },
        required: ['title'],
      },
    },
    {
      name: 'desktop_focus_window',
      description:
        'Focus/activate a window by application name. Brings the application to the foreground.',
      inputSchema: {
        type: 'object',
        properties: {
          appName: {
            type: 'string',
            description: 'Application name to focus (e.g. "Finder", "Slack", "Visual Studio Code")',
          },
        },
        required: ['appName'],
      },
    },
    {
      name: 'desktop_open_app',
      description:
        'Open/launch an application by name. On macOS this uses "open -a", on Windows uses Start-Process.',
      inputSchema: {
        type: 'object',
        properties: {
          appName: {
            type: 'string',
            description:
              'Application name to open (e.g. "Finder", "Slack", "Visual Studio Code", "System Preferences")',
          },
        },
        required: ['appName'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  // Request permission for any desktop action (except screenshot which is read-only)
  if (name !== 'desktop_screenshot') {
    const details = JSON.stringify(args, null, 2);
    const allowed = await requestDesktopPermission(name, details);
    if (!allowed) {
      return {
        content: [{ type: 'text', text: 'Permission denied by user for this desktop action.' }],
        isError: true,
      };
    }
  }

  switch (name) {
    case 'desktop_screenshot':
      return desktopScreenshot();

    case 'desktop_click': {
      const { x, y, button } = args as { x: number; y: number; button?: string };
      return desktopClick(x, y, button);
    }

    case 'desktop_type': {
      const { text } = args as { text: string };
      return desktopType(text);
    }

    case 'desktop_hotkey': {
      const { keys } = args as { keys: string[] };
      return desktopHotkey(keys);
    }

    case 'desktop_list_windows':
      return desktopListWindows();

    case 'desktop_find_window': {
      const { title } = args as { title: string };
      return desktopFindWindow(title);
    }

    case 'desktop_focus_window': {
      const { appName } = args as { appName: string };
      return desktopFocusWindow(appName);
    }

    case 'desktop_open_app': {
      const { appName } = args as { appName: string };
      return desktopOpenApp(appName);
    }

    default:
      return {
        content: [{ type: 'text', text: `Error: Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Desktop Control MCP Server started');
  console.error(`Platform: ${PLATFORM}`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
