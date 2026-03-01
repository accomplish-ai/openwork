#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { execFile as execFileCb, spawn } from 'child_process';
import { readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

const PERMISSION_API_PORT = process.env.PERMISSION_API_PORT ?? '9226';
// Desktop actions use the dedicated /desktop-permission endpoint on the same
// port, which accepts { operation, ...details } without requiring a filePath.
const PERMISSION_API_URL = `http://localhost:${PERMISSION_API_PORT}/desktop-permission`;

type SupportedPlatform = 'darwin' | 'win32' | 'linux';
const PLATFORM = process.platform as SupportedPlatform;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResult(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

function denied(action: string): CallToolResult {
  return {
    content: [{ type: 'text', text: `Permission denied for desktop action: ${action}` }],
    isError: true,
  };
}

function tmpFile(prefix: string, ext: string): string {
  return join(tmpdir(), `dc-${prefix}-${randomUUID()}.${ext}`);
}

/** Escape a string for use inside an AppleScript double-quoted string literal. */
function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Permission ───────────────────────────────────────────────────────────────

/**
 * Request permission for a desktop action.
 * FAILS CLOSED: returns false when the permission API is unreachable or returns a non-200 status.
 */
async function checkPermission(action: string, details: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(PERMISSION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: `desktop:${action}`, ...details }),
    });
    if (!res.ok) {
      return false;
    }
    const body = (await res.json()) as { allowed: boolean };
    return body.allowed === true;
  } catch {
    // API unavailable or threw — deny by default (fail closed).
    return false;
  }
}

// ─── Screenshot ──────────────────────────────────────────────────────────────

/**
 * Session-level consent for screen capture. The user is prompted once per
 * MCP server process lifetime; subsequent calls skip the prompt.
 */
let screenshotSessionConsent: boolean | null = null;

async function captureScreenshot(): Promise<CallToolResult> {
  // Gate: request session-level consent the first time a screenshot is taken.
  if (screenshotSessionConsent === null) {
    screenshotSessionConsent = await checkPermission('screenshot', {
      name: 'Screen capture',
      details: 'Allow Accomplish to capture screenshots for this session?',
    });
  }
  if (!screenshotSessionConsent) {
    return denied('screenshot (session consent denied)');
  }
  // Audit: emit a structured log entry so the user can review captures.
  console.error(
    JSON.stringify({ audit: 'desktop:screenshot', timestamp: new Date().toISOString() }),
  );
  const png = tmpFile('screenshot', 'png');
  try {
    if (PLATFORM === 'darwin') {
      // Built-in macOS screen capture; -x suppresses the camera shutter sound.
      await execFile('screencapture', ['-x', '-t', 'png', png]);
    } else if (PLATFORM === 'win32') {
      // Write a parameterised PS1 script so the output path is a proper argument,
      // not interpolated into a command string.
      const ps1 = tmpFile('capture', 'ps1');
      await writeFile(
        ps1,
        // Capture the full screen, then scale to max 1280 px wide so the
        // base64 payload stays within model input limits.
        `param([string]$Out)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$full = New-Object System.Drawing.Bitmap $s.Width, $s.Height
$g = [System.Drawing.Graphics]::FromImage($full)
$g.CopyFromScreen($s.Location, [System.Drawing.Point]::Empty, $s.Size)
$g.Dispose()
$maxW = 1280
if ($s.Width -gt $maxW) {
  $scale = $maxW / $s.Width
  $newW = $maxW
  $newH = [int]($s.Height * $scale)
  $scaled = New-Object System.Drawing.Bitmap $newW, $newH
  $gs = [System.Drawing.Graphics]::FromImage($scaled)
  $gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gs.DrawImage($full, 0, 0, $newW, $newH)
  $gs.Dispose()
  $full.Dispose()
  $full = $scaled
}
$full.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$full.Dispose()`,
        'utf8',
      );
      try {
        await execFile('powershell', ['-NoProfile', '-NonInteractive', '-File', ps1, '-Out', png], {
          windowsHide: true,
        });
      } finally {
        await unlink(ps1).catch(() => undefined);
      }
    } else {
      // Linux: try scrot (lightweight), fall back to gnome-screenshot.
      try {
        await execFile('scrot', [png]);
      } catch {
        await execFile('gnome-screenshot', ['-f', png]);
      }
    }

    const data = await readFile(png);
    return {
      content: [{ type: 'image', data: data.toString('base64'), mimeType: 'image/png' }],
    };
  } finally {
    await unlink(png).catch(() => undefined);
  }
}

// ─── Mouse ───────────────────────────────────────────────────────────────────

async function mouseClick(
  x: number,
  y: number,
  button: 'left' | 'right' | 'double',
): Promise<void> {
  if (PLATFORM === 'darwin') {
    // System Events supports click, right click, and double click at screen coordinates.
    // x and y are validated numbers — no injection risk when embedded directly.
    const cmd = button === 'right' ? 'right click' : button === 'double' ? 'double click' : 'click';
    await execFile('osascript', [
      '-e',
      `tell application "System Events" to ${cmd} at {${x}, ${y}}`,
    ]);
  } else if (PLATFORM === 'win32') {
    // Use P/Invoke via a parameterised PS1 so x, y, and button values are
    // passed as typed PowerShell arguments, not interpolated into script text.
    const ps1 = tmpFile('click', 'ps1');
    await writeFile(
      ps1,
      `param([int]$X, [int]$Y, [int]$Btn, [int]$Cnt)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int d, int i);
  public const int LEFTDOWN  = 0x0002;
  public const int LEFTUP    = 0x0004;
  public const int RIGHTDOWN = 0x0008;
  public const int RIGHTUP   = 0x0010;
}
'@
[WinMouse]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 50
$down = if($Btn -eq 2) { [WinMouse]::RIGHTDOWN } else { [WinMouse]::LEFTDOWN }
$up   = if($Btn -eq 2) { [WinMouse]::RIGHTUP   } else { [WinMouse]::LEFTUP   }
for($i = 0; $i -lt $Cnt; $i++) {
  [WinMouse]::mouse_event($down, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 30
  [WinMouse]::mouse_event($up, 0, 0, 0, 0)
  if($i -lt $Cnt - 1) { Start-Sleep -Milliseconds 100 }
}`,
      'utf8',
    );
    const btnCode = button === 'right' ? '2' : '1';
    const cnt = button === 'double' ? '2' : '1';
    try {
      await execFile('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        ps1,
        '-X',
        String(x),
        '-Y',
        String(y),
        '-Btn',
        btnCode,
        '-Cnt',
        cnt,
      ]);
    } finally {
      await unlink(ps1).catch(() => undefined);
    }
  } else {
    // Linux: xdotool — x and y are numbers, no injection.
    if (button === 'double') {
      await execFile('xdotool', [
        'mousemove',
        String(x),
        String(y),
        'click',
        '--repeat',
        '2',
        '--delay',
        '100',
        '1',
      ]);
    } else {
      const btn = button === 'right' ? '3' : '1';
      await execFile('xdotool', ['mousemove', String(x), String(y), 'click', btn]);
    }
  }
}

async function mouseMove(x: number, y: number): Promise<void> {
  if (PLATFORM === 'darwin') {
    // cliclick is the simplest option on macOS for pure mouse movement.
    // x and y are validated numbers — template literal produces only digits and comma.
    await execFile('cliclick', [`m:${x},${y}`]);
  } else if (PLATFORM === 'win32') {
    const ps1 = tmpFile('move', 'ps1');
    await writeFile(
      ps1,
      `param([int]$X, [int]$Y)
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class WinMouse2 { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }
'@
[WinMouse2]::SetCursorPos($X, $Y)`,
      'utf8',
    );
    try {
      await execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-File', ps1, '-X', String(x), '-Y', String(y)],
        { windowsHide: true },
      );
    } finally {
      await unlink(ps1).catch(() => undefined);
    }
  } else {
    await execFile('xdotool', ['mousemove', String(x), String(y)]);
  }
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

/**
 * Type arbitrary text.
 *
 * macOS: Uses pbcopy (stdin) to set clipboard then pastes — zero injection risk.
 * Windows: Writes text to a temp file, reads into clipboard via PowerShell, then pastes.
 * Linux: Passes text as a discrete argument to xdotool — no shell involved.
 */
async function typeText(text: string): Promise<void> {
  if (PLATFORM === 'darwin') {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      proc.stdin!.write(text, 'utf8');
      proc.stdin!.end();
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`pbcopy exited ${code}`)),
      );
      proc.on('error', reject);
    });
    await execFile('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using {command down}',
    ]);
  } else if (PLATFORM === 'win32') {
    const txt = tmpFile('type', 'txt');
    const ps1 = tmpFile('type', 'ps1');
    // Both temp files must be cleaned up even if the second writeFile throws.
    try {
      await writeFile(txt, text, 'utf8');
      await writeFile(
        ps1,
        // Capture the current foreground window BEFORE doing anything else so we
        // can restore focus to it just before SendKeys fires. This is the
        // belt-and-suspenders fix on top of windowsHide:true: even with a hidden
        // console, the OS may briefly shift focus during process creation.
        `param([string]$F)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinType {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
'@
$target = [WinType]::GetForegroundWindow()
$content = [System.IO.File]::ReadAllText($F, [System.Text.Encoding]::UTF8)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Clipboard]::SetText($content)
Start-Sleep -Milliseconds 150
if ($target -ne [IntPtr]::Zero) { [WinType]::SetForegroundWindow($target) }
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait('^v')`,
        'utf8',
      );
      await execFile('powershell', ['-NoProfile', '-NonInteractive', '-File', ps1, '-F', txt], {
        windowsHide: true,
      });
    } finally {
      // Clean up both files regardless of which step failed.
      await unlink(txt).catch(() => undefined);
      await unlink(ps1).catch(() => undefined);
    }
  } else {
    // xdotool type -- text: text is a discrete argument, no shell involved.
    await execFile('xdotool', ['type', '--clearmodifiers', '--', text]);
  }
}

// AppleScript key codes for named keys.
const APPLE_KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  esc: 53,
  escape: 53,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  forwarddelete: 117,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const APPLE_MODIFIERS: Record<string, string> = {
  ctrl: 'control down',
  control: 'control down',
  cmd: 'command down',
  command: 'command down',
  meta: 'command down',
  alt: 'option down',
  option: 'option down',
  shift: 'shift down',
};

const WIN_MODIFIERS: Record<string, string> = {
  ctrl: '^',
  control: '^',
  cmd: '^',
  command: '^',
  meta: '^',
  alt: '%',
  option: '%',
  shift: '+',
};

const WIN_KEYS: Record<string, string> = {
  return: '{ENTER}',
  enter: '{ENTER}',
  esc: '{ESC}',
  escape: '{ESC}',
  tab: '{TAB}',
  delete: '{DELETE}',
  forwarddelete: '{DELETE}',
  backspace: '{BACKSPACE}',
  space: ' ',
  up: '{UP}',
  down: '{DOWN}',
  left: '{LEFT}',
  right: '{RIGHT}',
  home: '{HOME}',
  end: '{END}',
  pageup: '{PGUP}',
  pagedown: '{PGDN}',
  f1: '{F1}',
  f2: '{F2}',
  f3: '{F3}',
  f4: '{F4}',
  f5: '{F5}',
  f6: '{F6}',
  f7: '{F7}',
  f8: '{F8}',
  f9: '{F9}',
  f10: '{F10}',
  f11: '{F11}',
  f12: '{F12}',
};

function parseKeyParts(key: string): { modifiers: string[]; mainKey: string } {
  const parts = key.toLowerCase().split('+');
  const modifiers: string[] = [];
  let mainKey = '';
  for (const part of parts) {
    if (part in APPLE_MODIFIERS || part in WIN_MODIFIERS) {
      modifiers.push(part);
    } else {
      mainKey = part;
    }
  }
  return { modifiers, mainKey };
}

function buildAppleScriptForKey(key: string): string {
  const { modifiers, mainKey } = parseKeyParts(key);
  const modStr =
    modifiers.length > 0 ? ` using {${modifiers.map((m) => APPLE_MODIFIERS[m]).join(', ')}}` : '';

  if (mainKey in APPLE_KEY_CODES) {
    return `tell application "System Events" to key code ${APPLE_KEY_CODES[mainKey]}${modStr}`;
  }
  if (mainKey.length === 1) {
    return `tell application "System Events" to keystroke "${escapeAppleScriptString(mainKey)}"${modStr}`;
  }
  throw new Error(`Unknown key name: "${mainKey}"`);
}

function buildSendKeysString(key: string): string {
  const { modifiers, mainKey } = parseKeyParts(key);
  const prefix = modifiers.map((m) => WIN_MODIFIERS[m] ?? '').join('');
  const k =
    mainKey in WIN_KEYS
      ? WIN_KEYS[mainKey]
      : mainKey.length === 1
        ? mainKey
        : `{${mainKey.toUpperCase()}}`;
  return `${prefix}${k}`;
}

async function pressKey(key: string): Promise<void> {
  // Validate key string to prevent unexpected characters.
  if (!/^[a-zA-Z0-9+\-_ ]+$/.test(key)) {
    throw new Error(`Invalid key string "${key}". Use format like "ctrl+c", "Return", "shift+F5".`);
  }

  if (PLATFORM === 'darwin') {
    const script = buildAppleScriptForKey(key);
    await execFile('osascript', ['-e', script]);
  } else if (PLATFORM === 'win32') {
    const sendKeysStr = buildSendKeysString(key);
    const ps1 = tmpFile('key', 'ps1');
    await writeFile(
      ps1,
      `param([string]$K)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($K)`,
      'utf8',
    );
    try {
      await execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-File', ps1, '-K', sendKeysStr],
        { windowsHide: true },
      );
    } finally {
      await unlink(ps1).catch(() => undefined);
    }
  } else {
    // xdotool key accepts key names like "ctrl+c", "Return", "F5" directly.
    await execFile('xdotool', ['key', '--clearmodifiers', key]);
  }
}

// ─── Window management ───────────────────────────────────────────────────────

interface WindowInfo {
  name: string;
  title?: string;
  pid?: number;
}

async function listWindows(): Promise<WindowInfo[]> {
  if (PLATFORM === 'darwin') {
    // JXA returns a proper JSON array — no newline/delimiter parsing bugs.
    const { stdout } = await execFile('osascript', [
      '-l',
      'JavaScript',
      '-e',
      [
        'var se = Application("System Events");',
        'var procs = se.processes.whose({backgroundOnly: false});',
        'JSON.stringify(procs.map(function(p){',
        '  try{return{name:p.name(),pid:p.unixId()}}catch(e){return null}',
        '}).filter(function(x){return x!==null}))',
      ].join(''),
    ]);
    return JSON.parse(stdout.trim()) as WindowInfo[];
  } else if (PLATFORM === 'win32') {
    const { stdout } = await execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | Select-Object Name,Id,@{N="Title";E={$_.MainWindowTitle}} | ConvertTo-Json -Compress',
      ],
      { windowsHide: true },
    );
    const raw = JSON.parse(stdout.trim()) as Array<{ Name: string; Id: number; Title: string }>;
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((w) => ({ name: w.Name, title: w.Title, pid: w.Id }));
  } else {
    // Linux: list visible windows via xdotool search + getwindowname.
    const { stdout: idList } = await execFile('xdotool', [
      'search',
      '--onlyvisible',
      '--name',
      '.+',
    ]);
    const wids = idList.trim().split('\n').filter(Boolean);
    const results = await Promise.all(
      wids.map(async (wid) => {
        try {
          const { stdout: name } = await execFile('xdotool', ['getwindowname', wid]);
          // Retrieve the actual process ID; some windows may not have _NET_WM_PID set.
          const entry: WindowInfo = { name: name.trim() };
          try {
            const { stdout: pidOut } = await execFile('xdotool', ['getwindowpid', wid]);
            const parsed = parseInt(pidOut.trim(), 10);
            if (Number.isFinite(parsed) && parsed > 0) entry.pid = parsed;
          } catch {
            // PID unavailable for this window — leave absent.
          }
          return entry;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((r): r is WindowInfo => r !== null);
  }
}

async function focusWindow(name: string): Promise<void> {
  if (PLATFORM === 'darwin') {
    const safe = escapeAppleScriptString(name);
    await execFile('osascript', [
      '-e',
      `tell application "System Events" to set frontmost of (first process whose name is "${safe}") to true`,
    ]);
  } else if (PLATFORM === 'win32') {
    const ps1 = tmpFile('focus', 'ps1');
    await writeFile(
      ps1,
      `param([string]$Title)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
'@
$escapedTitle = [System.Management.Automation.WildcardPattern]::Escape($Title)
$proc = Get-Process | Where-Object {$_.MainWindowTitle -like "*$escapedTitle*"} | Select-Object -First 1
if($proc) {
  [WinFocus]::SetForegroundWindow($proc.MainWindowHandle)
  # Give the OS time to actually bring the window to the foreground before returning.
  Start-Sleep -Milliseconds 400
}
else { Write-Error "No window found matching: $Title"; exit 1 }`,

      'utf8',
    );
    try {
      await execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-File', ps1, '-Title', name],
        { windowsHide: true },
      );
    } finally {
      await unlink(ps1).catch(() => undefined);
    }
  } else {
    // xdotool search by window name and activate.
    const { stdout } = await execFile('xdotool', ['search', '--name', name]);
    const wid = stdout.trim().split('\n')[0];
    if (!wid) {
      throw new Error(`No window found with name matching "${name}"`);
    }
    await execFile('xdotool', ['windowactivate', '--sync', wid]);
  }
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'desktop-control', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'desktop_screenshot',
      description:
        'Capture a screenshot of the entire primary display. Returns the image as a base64-encoded PNG. ' +
        'Requires one-time session consent from the user before the first capture; subsequent calls in the same session are allowed automatically.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'desktop_mouse_click',
      description: 'Click the mouse at absolute screen coordinates. Requires user permission.',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate in screen pixels (0 = left edge)' },
          y: { type: 'number', description: 'Y coordinate in screen pixels (0 = top edge)' },
          button: {
            type: 'string',
            enum: ['left', 'right', 'double'],
            description: 'Mouse button to use (default: left)',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'desktop_mouse_move',
      description:
        'Move the mouse cursor to absolute screen coordinates without clicking. Requires user permission. Note: on macOS this requires cliclick (`brew install cliclick`).',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate in screen pixels' },
          y: { type: 'number', description: 'Y coordinate in screen pixels' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'desktop_type_text',
      description:
        'Type text at the current cursor position. Uses a clipboard-paste technique on macOS and Windows so arbitrary Unicode is supported without injection risk. Requires user permission.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to type' },
        },
        required: ['text'],
      },
    },
    {
      name: 'desktop_key_press',
      description:
        'Press a key or keyboard shortcut. Use "+" to combine modifiers with a key. ' +
        'Modifiers: ctrl, cmd (macOS)/ctrl (Windows/Linux), alt/option, shift. ' +
        'Special keys: Return, Escape, Tab, Space, Delete, Backspace, Up, Down, Left, Right, ' +
        'Home, End, PageUp, PageDown, F1-F12. ' +
        'Examples: "ctrl+c", "cmd+shift+t", "Return", "F5". Requires user permission.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Key or key combination to press (e.g. "ctrl+c", "Return", "F5")',
          },
        },
        required: ['key'],
      },
    },
    {
      name: 'desktop_list_windows',
      description:
        'List all visible application windows with their names and process IDs. No permission required — this is a read-only observation.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'desktop_focus_window',
      description:
        'Bring a window to the foreground by application/process name (exact or partial match). Requires user permission.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Application or window name to focus (e.g. "Chrome", "Terminal", "Notepad")',
          },
        },
        required: ['name'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case 'desktop_screenshot': {
      try {
        return await captureScreenshot();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_mouse_click': {
      const x = Number((args as Record<string, unknown>).x);
      const y = Number((args as Record<string, unknown>).y);
      const button =
        ((args as Record<string, unknown>).button as 'left' | 'right' | 'double') ?? 'left';

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return errorResult('x and y must be finite numbers');
      }
      if (!['left', 'right', 'double'].includes(button)) {
        return errorResult('button must be "left", "right", or "double"');
      }

      const allowed = await checkPermission('mouse_click', { x, y, button });
      if (!allowed) {
        return denied('mouse_click');
      }

      try {
        await mouseClick(x, y, button);
        return { content: [{ type: 'text', text: `Clicked ${button} at (${x}, ${y})` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_mouse_move': {
      const x = Number((args as Record<string, unknown>).x);
      const y = Number((args as Record<string, unknown>).y);

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return errorResult('x and y must be finite numbers');
      }

      const allowed = await checkPermission('mouse_move', { x, y });
      if (!allowed) {
        return denied('mouse_move');
      }

      try {
        await mouseMove(x, y);
        return { content: [{ type: 'text', text: `Moved mouse to (${x}, ${y})` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_type_text': {
      const text = String((args as Record<string, unknown>).text ?? '');
      if (!text) {
        return errorResult('text must not be empty');
      }

      const allowed = await checkPermission('type_text', { textLength: text.length });
      if (!allowed) {
        return denied('type_text');
      }

      try {
        await typeText(text);
        return { content: [{ type: 'text', text: `Typed ${text.length} character(s)` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_key_press': {
      const key = String((args as Record<string, unknown>).key ?? '');
      if (!key) {
        return errorResult('key must not be empty');
      }

      const allowed = await checkPermission('key_press', { key });
      if (!allowed) {
        return denied('key_press');
      }

      try {
        await pressKey(key);
        return { content: [{ type: 'text', text: `Pressed key: ${key}` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_list_windows': {
      try {
        const windows = await listWindows();
        return {
          content: [{ type: 'text', text: JSON.stringify(windows, null, 2) }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    case 'desktop_focus_window': {
      const windowName = String((args as Record<string, unknown>).name ?? '');
      if (!windowName) {
        return errorResult('name must not be empty');
      }

      const allowed = await checkPermission('focus_window', { name: windowName });
      if (!allowed) {
        return denied('focus_window');
      }

      try {
        await focusWindow(windowName);
        return { content: [{ type: 'text', text: `Focused window: ${windowName}` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }

    default:
      return errorResult(`Unknown tool: ${name}`);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Desktop Control MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start desktop-control MCP server:', error);
  process.exit(1);
});
