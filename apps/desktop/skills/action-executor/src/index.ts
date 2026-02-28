#!/usr/bin/env node
/**
 * Action Executor MCP Server
 *
 * Provides tools for executing mouse and keyboard actions on macOS
 * using AppleScript/osascript and Python's Quartz bindings.
 * 
 * Requires Accessibility permissions to be granted to the parent app.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type MouseButton = 'left' | 'right';
type ScrollDirection = 'up' | 'down' | 'left' | 'right';
type ModifierKey = 'command' | 'shift' | 'option' | 'control';
type ActionExecutorErrorCode = 'INVALID_INPUT' | 'PERMISSION_MISSING' | 'RUNTIME_FAILURE';

const MIN_COORDINATE = 0;
const MAX_COORDINATE = 100000;
const MAX_APP_NAME_LENGTH = 120;
const DEFAULT_SCROLL_AMOUNT = 3;
const MIN_SCROLL_AMOUNT = 0;
const MAX_SCROLL_AMOUNT = 100;
const EXECUTION_TIMEOUT_MS = 10000;

const VALID_BUTTONS = new Set<MouseButton>(['left', 'right']);
const VALID_DIRECTIONS = new Set<ScrollDirection>(['up', 'down', 'left', 'right']);
const VALID_MODIFIERS = new Set<ModifierKey>(['command', 'shift', 'option', 'control']);

const PERMISSION_REMEDIATION =
  'Grant Accessibility access to the host app in System Settings > Privacy & Security > Accessibility, then retry.';
const INVALID_INPUT_REMEDIATION = 'Fix the tool arguments and retry with valid values.';
const RUNTIME_REMEDIATION =
  'Verify required system dependencies are available (python3, osascript, Quartz) and retry.';
const APP_ACTIVATION_REMEDIATION =
  'Verify the app name in Launchpad or /Applications and retry with the exact app name.';

const PERMISSION_ERROR_PATTERNS = [
  'accessibility',
  'assistive access',
  'not authorized',
  'not authorised',
  'not allowed',
  'permission denied',
  'operation not permitted',
  'not permitted',
  '(-1719)',
  '(-1743)',
];

const PYTHON_MOVE_MOUSE_SCRIPT = `
import Quartz
import math
import sys
import time

target_x = float(sys.argv[1])
target_y = float(sys.argv[2])

current_event = Quartz.CGEventCreate(None)
if current_event is None:
    start_x = target_x
    start_y = target_y
else:
    current_location = Quartz.CGEventGetLocation(current_event)
    start_x = float(current_location.x)
    start_y = float(current_location.y)

dx = target_x - start_x
dy = target_y - start_y
distance = math.hypot(dx, dy)

if distance <= 18.0:
    event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, (target_x, target_y), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    sys.exit(0)

# Keep cursor motion visible, but prioritize responsiveness for UI automation.
duration_ms = max(35.0, min(180.0, distance * 0.22))
steps = int(max(3, min(20, round(distance / 38.0))))
sleep_seconds = (duration_ms / 1000.0) / steps

for step in range(1, steps + 1):
    linear_progress = step / steps
    eased_progress = 0.5 - (0.5 * math.cos(math.pi * linear_progress))
    next_x = start_x + (dx * eased_progress)
    next_y = start_y + (dy * eased_progress)
    event = Quartz.CGEventCreateMouseEvent(
        None, Quartz.kCGEventMouseMoved, (next_x, next_y), Quartz.kCGMouseButtonLeft
    )
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    if step < steps:
        time.sleep(sleep_seconds)
`.trim();

const PYTHON_CLICK_SCRIPT = `
import Quartz
import sys
import time

x = float(sys.argv[1])
y = float(sys.argv[2])
button = sys.argv[3]

if button == "right":
    button_code = Quartz.kCGMouseButtonRight
    down_event = Quartz.kCGEventRightMouseDown
    up_event = Quartz.kCGEventRightMouseUp
else:
    button_code = Quartz.kCGMouseButtonLeft
    down_event = Quartz.kCGEventLeftMouseDown
    up_event = Quartz.kCGEventLeftMouseUp

pos = (x, y)
down = Quartz.CGEventCreateMouseEvent(None, down_event, pos, button_code)
up = Quartz.CGEventCreateMouseEvent(None, up_event, pos, button_code)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
time.sleep(0.05)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
`.trim();

const PYTHON_DOUBLE_CLICK_SCRIPT = `
import Quartz
import sys
import time

x = float(sys.argv[1])
y = float(sys.argv[2])
pos = (x, y)

for i in range(2):
    down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, Quartz.kCGMouseButtonLeft)
    up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, Quartz.kCGMouseButtonLeft)
    Quartz.CGEventSetIntegerValueField(down, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventSetIntegerValueField(up, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
    time.sleep(0.05)
`.trim();

const PYTHON_SCROLL_SCRIPT = `
import Quartz
import sys

delta_y = int(sys.argv[1])
delta_x = int(sys.argv[2])
event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 2, delta_y, delta_x)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
`.trim();

const APPLESCRIPT_TYPE_TEXT = [
  'on run argv',
  '  tell application "System Events" to keystroke (item 1 of argv)',
  'end run',
];

const APPLESCRIPT_PRESS_KEY = [
  'on run argv',
  '  set keyValue to item 1 of argv',
  '  set useKeyCode to (item 2 of argv) is "true"',
  '  set modifiersCsv to item 3 of argv',
  '  set modifierList to {}',
  '  if modifiersCsv is not "" then',
  '    set AppleScript\'s text item delimiters to ","',
  '    set modifierTokens to text items of modifiersCsv',
  '    set AppleScript\'s text item delimiters to ""',
  '    repeat with token in modifierTokens',
  '      if token is "command" then',
  '        copy command down to end of modifierList',
  '      else if token is "shift" then',
  '        copy shift down to end of modifierList',
  '      else if token is "option" then',
  '        copy option down to end of modifierList',
  '      else if token is "control" then',
  '        copy control down to end of modifierList',
  '      end if',
  '    end repeat',
  '  end if',
  '  tell application "System Events"',
  '    if useKeyCode then',
  '      set keyCodeValue to keyValue as integer',
  '      if (count of modifierList) > 0 then',
  '        key code keyCodeValue using modifierList',
  '      else',
  '        key code keyCodeValue',
  '      end if',
  '    else',
  '      if (count of modifierList) > 0 then',
  '        keystroke keyValue using modifierList',
  '      else',
  '        keystroke keyValue',
  '      end if',
  '    end if',
  '  end tell',
  'end run',
];

const APPLESCRIPT_ACTIVATE_APP = [
  'on run argv',
  '  set appName to item 1 of argv',
  '  tell application appName to activate',
  'end run',
];

class ActionExecutorError extends Error {
  code: ActionExecutorErrorCode;
  details: Record<string, unknown> | undefined;
  remediation: string;

  constructor(
    code: ActionExecutorErrorCode,
    message: string,
    details?: Record<string, unknown>,
    remediation?: string
  ) {
    super(message);
    this.name = 'ActionExecutorError';
    this.code = code;
    this.details = details;
    this.remediation = remediation ?? remediationForCode(code);
  }
}

// Key code mappings for common keys (macOS virtual key codes)
const KEY_CODES: Record<string, number> = {
  // Letters
  a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38,
  k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12, r: 15, s: 1,
  t: 17, u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,
  // Numbers
  '0': 29, '1': 18, '2': 19, '3': 20, '4': 21, '5': 23, '6': 22, '7': 26, '8': 28, '9': 25,
  // Special keys
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51,
  escape: 53, esc: 53,
  // Arrow keys
  up: 126, down: 125, left: 123, right: 124,
  // Function keys
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
  // Modifiers (for reference, handled separately)
  command: 55, cmd: 55, shift: 56, option: 58, alt: 58, control: 59, ctrl: 59,
  // Other common keys
  home: 115, end: 119, pageup: 116, pagedown: 121,
  // Symbols (with shift implied in typing)
  '-': 27, '=': 24, '[': 33, ']': 30, '\\': 42, ';': 41, "'": 39,
  ',': 43, '.': 47, '/': 44, '`': 50,
};

function remediationForCode(code: ActionExecutorErrorCode): string {
  switch (code) {
    case 'INVALID_INPUT':
      return INVALID_INPUT_REMEDIATION;
    case 'PERMISSION_MISSING':
      return PERMISSION_REMEDIATION;
    case 'RUNTIME_FAILURE':
      return RUNTIME_REMEDIATION;
  }
}

function invalidInput(message: string, details?: Record<string, unknown>): never {
  throw new ActionExecutorError('INVALID_INPUT', message, details, INVALID_INPUT_REMEDIATION);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidInput('Tool arguments must be an object', { receivedType: typeof value });
  }
  return value as Record<string, unknown>;
}

function parseFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalidInput(`${field} must be a finite number`, { field, received: value });
  }
  return value;
}

function parseCoordinate(value: unknown, field: 'x' | 'y'): number {
  const numericValue = parseFiniteNumber(value, field);
  return clampNumber(Math.round(numericValue), MIN_COORDINATE, MAX_COORDINATE);
}

function parseButton(value: unknown): MouseButton {
  if (value === undefined) {
    return 'left';
  }

  if (typeof value !== 'string' || !VALID_BUTTONS.has(value as MouseButton)) {
    invalidInput('button must be one of: left, right', { field: 'button', received: value });
  }

  return value as MouseButton;
}

function parseDirection(value: unknown): ScrollDirection {
  if (typeof value !== 'string' || !VALID_DIRECTIONS.has(value as ScrollDirection)) {
    invalidInput('direction must be one of: up, down, left, right', { field: 'direction', received: value });
  }

  return value as ScrollDirection;
}

function parseScrollAmount(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_SCROLL_AMOUNT;
  }

  const numericValue = parseFiniteNumber(value, 'amount');
  if (numericValue < 0) {
    invalidInput('amount must be greater than or equal to 0', { field: 'amount', received: value });
  }

  return clampNumber(Math.round(numericValue), MIN_SCROLL_AMOUNT, MAX_SCROLL_AMOUNT);
}

function parseText(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('text must be a string', { field: 'text', receivedType: typeof value });
  }

  return value;
}

function parseAppName(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('app_name must be a string', { field: 'app_name', receivedType: typeof value });
  }

  const appName = value.trim();
  if (appName.length === 0) {
    invalidInput('app_name cannot be empty', { field: 'app_name' });
  }

  if (appName.length > MAX_APP_NAME_LENGTH) {
    invalidInput(`app_name must be ${MAX_APP_NAME_LENGTH} characters or fewer`, {
      field: 'app_name',
      length: appName.length,
    });
  }

  return appName;
}

function parseKey(value: unknown): string {
  if (typeof value !== 'string') {
    invalidInput('key must be a string', { field: 'key', receivedType: typeof value });
  }

  const key = value.trim();
  if (key.length === 0) {
    invalidInput('key cannot be empty', { field: 'key' });
  }

  if (key.length === 1) {
    if (!/^[\x20-\x7E]$/.test(key)) {
      invalidInput('key must be a printable ASCII character or a supported key name', {
        field: 'key',
        received: value,
      });
    }
    return key;
  }

  const normalizedKey = key.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(KEY_CODES, normalizedKey)) {
    invalidInput(`Unsupported key: ${key}`, { field: 'key', received: value });
  }

  return normalizedKey;
}

function parseModifiers(value: unknown): ModifierKey[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    invalidInput('modifiers must be an array of strings', {
      field: 'modifiers',
      receivedType: typeof value,
    });
  }

  const parsed: ModifierKey[] = [];
  const seen = new Set<ModifierKey>();

  for (const modifierValue of value) {
    if (typeof modifierValue !== 'string') {
      invalidInput('modifiers must be an array of strings', {
        field: 'modifiers',
        received: modifierValue,
      });
    }

    const normalizedModifier = modifierValue.toLowerCase() as ModifierKey;
    if (!VALID_MODIFIERS.has(normalizedModifier)) {
      invalidInput('modifiers must be one or more of: command, shift, option, control', {
        field: 'modifiers',
        received: modifierValue,
      });
    }

    if (seen.has(normalizedModifier)) {
      invalidInput(`Duplicate modifier is not allowed: ${normalizedModifier}`, {
        field: 'modifiers',
        received: value,
      });
    }

    seen.add(normalizedModifier);
    parsed.push(normalizedModifier);
  }

  return parsed;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractExecDetails(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const raw = error as {
    stdout?: unknown;
    stderr?: unknown;
    code?: unknown;
    signal?: unknown;
    cmd?: unknown;
  };
  const details: Record<string, unknown> = {};

  if (typeof raw.stdout === 'string' && raw.stdout.trim().length > 0) {
    details.stdout = raw.stdout.trim();
  }

  if (typeof raw.stderr === 'string' && raw.stderr.trim().length > 0) {
    details.stderr = raw.stderr.trim();
  }

  if (raw.code !== undefined) {
    details.exitCode = raw.code;
  }

  if (raw.signal !== undefined) {
    details.signal = raw.signal;
  }

  if (typeof raw.cmd === 'string' && raw.cmd.length > 0) {
    details.command = raw.cmd;
  }

  return details;
}

function isPermissionError(error: unknown): boolean {
  const details = extractExecDetails(error);
  const text = `${errorMessage(error)} ${String(details.stderr ?? '')} ${String(details.stdout ?? '')}`.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

function normalizeError(error: unknown): ActionExecutorError {
  if (error instanceof ActionExecutorError) {
    return error;
  }

  const details = extractExecDetails(error);
  details.cause = errorMessage(error);

  if (isPermissionError(error)) {
    return new ActionExecutorError(
      'PERMISSION_MISSING',
      'Accessibility permission is required to run mouse and keyboard actions.',
      details,
      PERMISSION_REMEDIATION
    );
  }

  return new ActionExecutorError('RUNTIME_FAILURE', 'Action execution failed.', details, RUNTIME_REMEDIATION);
}

function buildErrorResult(error: unknown): CallToolResult {
  const normalizedError = normalizeError(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: false,
            error: {
              code: normalizedError.code,
              message: normalizedError.message,
              remediation: normalizedError.remediation,
              details: normalizedError.details ?? {},
            },
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

async function runExecutable(command: string, args: string[], context: Record<string, unknown>): Promise<void> {
  try {
    await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024,
      timeout: EXECUTION_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    });
  } catch (error) {
    const details = { ...context, command, args };
    if (isPermissionError(error)) {
      throw new ActionExecutorError(
        'PERMISSION_MISSING',
        'Accessibility permission is required to run mouse and keyboard actions.',
        { ...details, ...extractExecDetails(error), cause: errorMessage(error) },
        PERMISSION_REMEDIATION
      );
    }
    throw new ActionExecutorError(
      'RUNTIME_FAILURE',
      'Action execution failed.',
      { ...details, ...extractExecDetails(error), cause: errorMessage(error) },
      RUNTIME_REMEDIATION
    );
  }
}

async function runPythonScript(
  script: string,
  scriptArgs: string[],
  context: Record<string, unknown>
): Promise<void> {
  await runExecutable('python3', ['-c', script, ...scriptArgs], context);
}

async function runAppleScript(
  lines: string[],
  scriptArgs: string[],
  context: Record<string, unknown>
): Promise<void> {
  const args = lines.flatMap((line) => ['-e', line]);
  // `--` prevents osascript from treating user-supplied values as additional CLI flags (for example, `-e`).
  await runExecutable('osascript', [...args, '--', ...scriptArgs], context);
}

const POINTER_SETTLE_DELAY_MS = 80;
const POINTER_Y_CALIBRATION_OFFSET = 14;

function waitForPointerSettle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POINTER_SETTLE_DELAY_MS));
}

function applyPointerCalibration(x: number, y: number): { x: number; y: number } {
  return {
    x,
    y: y + POINTER_Y_CALIBRATION_OFFSET,
  };
}

/**
 * Move the mouse to a specific position
 */
async function moveMouse(x: number, y: number): Promise<void> {
  const calibrated = applyPointerCalibration(x, y);
  await runPythonScript(PYTHON_MOVE_MOUSE_SCRIPT, [String(calibrated.x), String(calibrated.y)], {
    action: 'move_mouse',
    x,
    y,
    calibratedX: calibrated.x,
    calibratedY: calibrated.y,
  });
}

/**
 * Click at a specific position
 */
async function click(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
  const calibrated = applyPointerCalibration(x, y);
  await moveMouse(x, y);
  await waitForPointerSettle();
  await runPythonScript(PYTHON_CLICK_SCRIPT, [String(calibrated.x), String(calibrated.y), button], {
    action: 'click',
    x,
    y,
    calibratedX: calibrated.x,
    calibratedY: calibrated.y,
    button,
  });
}

/**
 * Double-click at a specific position
 */
async function doubleClick(x: number, y: number): Promise<void> {
  const calibrated = applyPointerCalibration(x, y);
  await moveMouse(x, y);
  await waitForPointerSettle();
  await runPythonScript(PYTHON_DOUBLE_CLICK_SCRIPT, [String(calibrated.x), String(calibrated.y)], {
    action: 'double_click',
    x,
    y,
    calibratedX: calibrated.x,
    calibratedY: calibrated.y,
  });
}

/**
 * Type text using keyboard events
 */
async function typeText(text: string): Promise<void> {
  await runAppleScript(APPLESCRIPT_TYPE_TEXT, [text], {
    action: 'type_text',
    textLength: text.length,
  });
}

/**
 * Press a specific key with optional modifiers
 */
async function pressKey(
  key: string,
  modifiers: ModifierKey[] = []
): Promise<void> {
  const keyForCodeLookup = key.toLowerCase();
  const keyCode = KEY_CODES[keyForCodeLookup];
  const useKeyCode = keyCode !== undefined && (keyForCodeLookup.length > 1 || modifiers.length > 0);
  const keyArg = useKeyCode ? String(keyCode) : key;

  await runAppleScript(APPLESCRIPT_PRESS_KEY, [keyArg, useKeyCode ? 'true' : 'false', modifiers.join(',')], {
    action: 'press_key',
    key: keyForCodeLookup,
    modifiers,
  });
}

/**
 * Bring a macOS app to the foreground by name.
 * AppleScript is primary (reliable focus behavior), with `open -a` as fallback.
 */
async function activateApp(appName: string): Promise<void> {
  try {
    await runAppleScript(APPLESCRIPT_ACTIVATE_APP, [appName], {
      action: 'activate_app',
      appName,
      method: 'osascript',
    });
    return;
  } catch (appleScriptError) {
    try {
      await runExecutable('open', ['-a', appName], {
        action: 'activate_app',
        appName,
        method: 'open',
        fallbackFrom: 'osascript',
      });
      return;
    } catch (openError) {
      throw new ActionExecutorError(
        'RUNTIME_FAILURE',
        `Failed to activate app "${appName}".`,
        {
          action: 'activate_app',
          appName,
          osascriptError: {
            ...extractExecDetails(appleScriptError),
            cause: errorMessage(appleScriptError),
          },
          openError: {
            ...extractExecDetails(openError),
            cause: errorMessage(openError),
          },
        },
        APP_ACTIVATION_REMEDIATION
      );
    }
  }
}

/**
 * Scroll in a direction
 */
async function scroll(direction: ScrollDirection, amount: number = DEFAULT_SCROLL_AMOUNT): Promise<void> {
  // Calculate scroll deltas
  let deltaX = 0;
  let deltaY = 0;
  
  switch (direction) {
    case 'up':
      deltaY = amount;
      break;
    case 'down':
      deltaY = -amount;
      break;
    case 'left':
      deltaX = amount;
      break;
    case 'right':
      deltaX = -amount;
      break;
  }

  await runPythonScript(PYTHON_SCROLL_SCRIPT, [String(deltaY), String(deltaX)], {
    action: 'scroll',
    direction,
    amount,
  });
}

// Create MCP server
const server = new Server(
  { name: 'action-executor', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'move_mouse',
      description: 'Move the mouse cursor to a specific screen position',
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
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'click',
      description: 'Click at a specific screen position',
      inputSchema: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'X coordinate (pixels from left edge)',
          },
          y: {
            type: 'number',
            description: 'Y coordinate (pixels from top edge)',
          },
          button: {
            type: 'string',
            enum: ['left', 'right'],
            description: 'Mouse button to click (default: left)',
            default: 'left',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'double_click',
      description: 'Double-click at a specific screen position',
      inputSchema: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'X coordinate (pixels from left edge)',
          },
          y: {
            type: 'number',
            description: 'Y coordinate (pixels from top edge)',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'activate_app',
      description: 'Bring an application to the foreground by app name',
      inputSchema: {
        type: 'object',
        properties: {
          app_name: {
            type: 'string',
            description: 'Application name as shown in Launchpad/Dock (for example: "Codex", "Cursor", "Terminal")',
          },
        },
        required: ['app_name'],
      },
    },
    {
      name: 'type_text',
      description: 'Type text as if using the keyboard. Good for filling in forms or text fields.',
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
      name: 'press_key',
      description: 'Press a specific key, optionally with modifiers. Use for keyboard shortcuts or special keys like Enter, Tab, Escape, arrow keys, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'The key to press (e.g., "return", "tab", "escape", "up", "down", "a", "1", "f1")',
          },
          modifiers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['command', 'shift', 'option', 'control'],
            },
            description: 'Modifier keys to hold while pressing (e.g., ["command", "shift"] for Cmd+Shift)',
            default: [],
          },
        },
        required: ['key'],
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the screen in a direction',
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Direction to scroll',
          },
          amount: {
            type: 'number',
            description: 'Number of "lines" to scroll (default: 3)',
            default: 3,
          },
        },
        required: ['direction'],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
  const { name, arguments: args } = request.params;

  try {
    const parsedArgs = asObject(args);

    switch (name) {
      case 'move_mouse': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        await moveMouse(x, y);
        return {
          content: [{ type: 'text', text: `Mouse moved to (${x}, ${y})` }],
        };
      }

      case 'click': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        const button = parseButton(parsedArgs.button);
        await click(x, y, button);
        return {
          content: [{ type: 'text', text: `${button === 'right' ? 'Right-clicked' : 'Clicked'} at (${x}, ${y})` }],
        };
      }

      case 'double_click': {
        const x = parseCoordinate(parsedArgs.x, 'x');
        const y = parseCoordinate(parsedArgs.y, 'y');
        await doubleClick(x, y);
        return {
          content: [{ type: 'text', text: `Double-clicked at (${x}, ${y})` }],
        };
      }

      case 'type_text': {
        const text = parseText(parsedArgs.text);
        await typeText(text);
        return {
          content: [{ type: 'text', text: `Typed: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` }],
        };
      }

      case 'activate_app': {
        const appName = parseAppName(parsedArgs.app_name);
        await activateApp(appName);
        return {
          content: [{ type: 'text', text: `Activated app: ${appName}` }],
        };
      }

      case 'press_key': {
        const key = parseKey(parsedArgs.key);
        const modifiers = parseModifiers(parsedArgs.modifiers);
        await pressKey(key, modifiers);
        const modStr = modifiers.length > 0 ? `${modifiers.join('+')}+` : '';
        return {
          content: [{ type: 'text', text: `Pressed: ${modStr}${key}` }],
        };
      }

      case 'scroll': {
        const direction = parseDirection(parsedArgs.direction);
        const amount = parseScrollAmount(parsedArgs.amount);
        await scroll(direction, amount);
        return {
          content: [{ type: 'text', text: `Scrolled ${direction} by ${amount} lines` }],
        };
      }

      default:
        throw new ActionExecutorError(
          'INVALID_INPUT',
          `Unknown tool: ${name}`,
          { tool: name },
          'Use one of the declared action-executor tools.'
        );
    }
  } catch (error) {
    return buildErrorResult(error);
  }
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Action Executor MCP Server started');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
