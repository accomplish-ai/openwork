/**
 * Action Executor — thin adapter for executing mouse/keyboard actions
 * on macOS via Python Quartz bindings and AppleScript.
 *
 * Reuses the same approach as the action-executor MCP server
 * (`apps/desktop/skills/action-executor/src/index.ts`) but callable
 * directly from the main process without going through MCP.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type {
  DesktopActionRequest,
  DesktopActionResponse,
  ToolErrorCode,
  ToolFailure,
  ToolFailureSource,
} from '@accomplish/shared';

const execFileAsync = promisify(execFile);

// --- Constants ---

const MIN_COORDINATE = 0;
const MAX_COORDINATE = 100000;
const MAX_APP_NAME_LENGTH = 120;
const DEFAULT_SCROLL_AMOUNT = 3;
const MIN_SCROLL_AMOUNT = 0;
const MAX_SCROLL_AMOUNT = 100;
const EXECUTION_TIMEOUT_MS = 10_000;
const POINTER_SETTLE_DELAY_MS = 80;

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

// --- Python / AppleScript payloads ---

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

const APPLESCRIPT_ACTIVATE_APP = [
  'on run argv',
  '  set appName to item 1 of argv',
  '  tell application appName to activate',
  'end run',
];

const KEY_CODES: Record<string, number> = {
  a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38,
  k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12, r: 15, s: 1,
  t: 17, u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,
  '0': 29, '1': 18, '2': 19, '3': 20, '4': 21, '5': 23, '6': 22, '7': 26, '8': 28, '9': 25,
  return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51,
  escape: 53, esc: 53,
  up: 126, down: 125, left: 123, right: 124,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100,
  f9: 101, f10: 109, f11: 103, f12: 111,
  command: 55, cmd: 55, shift: 56, option: 58, alt: 58, control: 59, ctrl: 59,
  home: 115, end: 119, pageup: 116, pagedown: 121,
  '-': 27, '=': 24, '[': 33, ']': 30, '\\': 42, ';': 41, "'": 39,
  ',': 43, '.': 47, '/': 44, '`': 50,
};

const APPLESCRIPT_PRESS_KEY = [
  'on run argv',
  '  set keyValue to item 1 of argv',
  '  set useKeyCode to (item 2 of argv) is "true"',
  '  set modifiersCsv to item 3 of argv',
  '  set modifierList to {}',
  '  if modifiersCsv is not "" then',
  "    set AppleScript's text item delimiters to \",\"",
  '    set modifierTokens to text items of modifiersCsv',
  "    set AppleScript's text item delimiters to \"\"",
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

const VALID_BUTTONS = new Set(['left', 'right']);
const VALID_DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
const VALID_MODIFIERS = new Set(['command', 'shift', 'option', 'control']);

// --- Helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPermissionError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((p) => lower.includes(p));
}

function buildFailure(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolFailure {
  const CATEGORY_MAP: Record<ToolErrorCode, ToolFailure['category']> = {
    ERR_PERMISSION_DENIED: 'permission',
    ERR_TIMEOUT: 'timeout',
    ERR_UNAVAILABLE_BINARY: 'unavailable',
    ERR_VALIDATION_ERROR: 'validation',
    ERR_UNKNOWN: 'unknown',
  };
  const source: ToolFailureSource = 'action_execution';
  return {
    code,
    message,
    category: CATEGORY_MAP[code],
    source,
    retryable: code === 'ERR_TIMEOUT' || code === 'ERR_UNAVAILABLE_BINARY',
    details,
  };
}

async function runPython(script: string, args: string[]): Promise<void> {
  try {
    await execFileAsync('python3', ['-c', script, ...args], {
      timeout: EXECUTION_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: string; killed?: boolean; message?: string };
    if (err.killed || err.code === 'ETIMEDOUT') {
      throw buildFailure('ERR_TIMEOUT', 'Action timed out.');
    }
    const stderr = err.stderr ?? err.message ?? '';
    if (isPermissionError(stderr)) {
      throw buildFailure(
        'ERR_PERMISSION_DENIED',
        'Accessibility permission required. Grant access in System Settings > Privacy & Security > Accessibility.',
        { stderr },
      );
    }
    throw buildFailure('ERR_UNKNOWN', `Action execution failed: ${stderr}`, { stderr });
  }
}

async function runAppleScript(scriptLines: string[], args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'osascript',
      ['-e', scriptLines.join('\n'), ...args],
      { timeout: EXECUTION_TIMEOUT_MS },
    );
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: string; killed?: boolean; message?: string };
    if (err.killed || err.code === 'ETIMEDOUT') {
      throw buildFailure('ERR_TIMEOUT', 'Action timed out.');
    }
    const stderr = err.stderr ?? err.message ?? '';
    if (isPermissionError(stderr)) {
      throw buildFailure(
        'ERR_PERMISSION_DENIED',
        'Accessibility permission required. Grant access in System Settings > Privacy & Security > Accessibility.',
        { stderr },
      );
    }
    throw buildFailure('ERR_UNKNOWN', `Action execution failed: ${stderr}`, { stderr });
  }
}

function validateCoordinate(value: unknown, field: 'x' | 'y'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw buildFailure('ERR_VALIDATION_ERROR', `${field} must be a finite number.`);
  }
  return clamp(Math.round(value), MIN_COORDINATE, MAX_COORDINATE);
}

function waitForPointerSettle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POINTER_SETTLE_DELAY_MS));
}

// --- Action dispatch ---

async function executeMoveMouse(x: number, y: number): Promise<DesktopActionResponse> {
  const cx = validateCoordinate(x, 'x');
  const cy = validateCoordinate(y, 'y');
  await runPython(PYTHON_MOVE_MOUSE_SCRIPT, [String(cx), String(cy)]);
  return {
    action: { type: 'move_mouse', x: cx, y: cy },
    message: `Moved mouse to (${cx}, ${cy}).`,
    executedAt: new Date().toISOString(),
  };
}

async function executeClick(
  x: number,
  y: number,
  button: 'left' | 'right' = 'left',
): Promise<DesktopActionResponse> {
  const cx = validateCoordinate(x, 'x');
  const cy = validateCoordinate(y, 'y');
  if (!VALID_BUTTONS.has(button)) {
    throw buildFailure('ERR_VALIDATION_ERROR', `Unsupported button: ${button}`);
  }
  // Move to target first, then click
  await runPython(PYTHON_MOVE_MOUSE_SCRIPT, [String(cx), String(cy)]);
  await waitForPointerSettle();
  await runPython(PYTHON_CLICK_SCRIPT, [String(cx), String(cy), button]);
  return {
    action: { type: 'click', x: cx, y: cy, button },
    message: `Clicked ${button} at (${cx}, ${cy}).`,
    executedAt: new Date().toISOString(),
  };
}

async function executeDoubleClick(x: number, y: number): Promise<DesktopActionResponse> {
  const cx = validateCoordinate(x, 'x');
  const cy = validateCoordinate(y, 'y');
  await runPython(PYTHON_MOVE_MOUSE_SCRIPT, [String(cx), String(cy)]);
  await waitForPointerSettle();
  await runPython(PYTHON_DOUBLE_CLICK_SCRIPT, [String(cx), String(cy)]);
  return {
    action: { type: 'double_click', x: cx, y: cy },
    message: `Double-clicked at (${cx}, ${cy}).`,
    executedAt: new Date().toISOString(),
  };
}

async function executeScroll(
  direction: string,
  amount?: number,
): Promise<DesktopActionResponse> {
  if (!VALID_DIRECTIONS.has(direction)) {
    throw buildFailure('ERR_VALIDATION_ERROR', `Invalid scroll direction: ${direction}`);
  }
  const scrollAmount = clamp(
    Math.round(amount ?? DEFAULT_SCROLL_AMOUNT),
    MIN_SCROLL_AMOUNT,
    MAX_SCROLL_AMOUNT,
  );

  let deltaY = 0;
  let deltaX = 0;
  switch (direction) {
    case 'up': deltaY = scrollAmount; break;
    case 'down': deltaY = -scrollAmount; break;
    case 'left': deltaX = scrollAmount; break;
    case 'right': deltaX = -scrollAmount; break;
  }

  await runPython(PYTHON_SCROLL_SCRIPT, [String(deltaY), String(deltaX)]);
  return {
    action: { type: 'scroll', direction: direction as 'up' | 'down' | 'left' | 'right', amount: scrollAmount },
    message: `Scrolled ${direction} by ${scrollAmount}.`,
    executedAt: new Date().toISOString(),
  };
}

async function executeTypeText(text: string): Promise<DesktopActionResponse> {
  if (!text || typeof text !== 'string') {
    throw buildFailure('ERR_VALIDATION_ERROR', 'text is required.');
  }
  await runAppleScript(APPLESCRIPT_TYPE_TEXT, [text]);
  return {
    action: { type: 'type_text', text },
    message: `Typed text (${text.length} chars).`,
    executedAt: new Date().toISOString(),
  };
}

async function executePressKey(
  key: string,
  modifiers?: string[],
): Promise<DesktopActionResponse> {
  if (!key || typeof key !== 'string') {
    throw buildFailure('ERR_VALIDATION_ERROR', 'key is required.');
  }

  const normalizedKey = key.toLowerCase().trim();
  const validModifiers = (modifiers ?? []).filter((m) => VALID_MODIFIERS.has(m));
  const modifiersCsv = validModifiers.join(',');

  const keyCode = KEY_CODES[normalizedKey];
  const useKeyCode = keyCode !== undefined;
  const keyValue = useKeyCode ? String(keyCode) : normalizedKey;

  await runAppleScript(APPLESCRIPT_PRESS_KEY, [keyValue, String(useKeyCode), modifiersCsv]);
  return {
    action: { type: 'press_key', key: normalizedKey, modifiers: validModifiers as ('command' | 'shift' | 'option' | 'control')[] },
    message: `Pressed key: ${normalizedKey}${validModifiers.length ? ` with ${validModifiers.join('+')}` : ''}.`,
    executedAt: new Date().toISOString(),
  };
}

async function executeActivateApp(appName: string): Promise<DesktopActionResponse> {
  if (!appName || typeof appName !== 'string') {
    throw buildFailure('ERR_VALIDATION_ERROR', 'appName is required.');
  }
  const trimmed = appName.trim().slice(0, MAX_APP_NAME_LENGTH);
  await runAppleScript(APPLESCRIPT_ACTIVATE_APP, [trimmed]);
  return {
    action: { type: 'activate_app', appName: trimmed },
    message: `Activated app: ${trimmed}.`,
    executedAt: new Date().toISOString(),
  };
}

// --- Public API ---

export async function executeDesktopAction(
  request: DesktopActionRequest,
): Promise<DesktopActionResponse> {
  switch (request.type) {
    case 'move_mouse':
      return executeMoveMouse(request.x, request.y);
    case 'click':
      return executeClick(request.x, request.y, request.button);
    case 'double_click':
      return executeDoubleClick(request.x, request.y);
    case 'scroll':
      return executeScroll(request.direction, request.amount);
    case 'type_text':
      return executeTypeText(request.text);
    case 'press_key':
      return executePressKey(request.key, request.modifiers);
    case 'activate_app':
      return executeActivateApp(request.appName);
    default:
      throw buildFailure(
        'ERR_VALIDATION_ERROR',
        `Unknown action type: ${(request as { type: string }).type}`,
      );
  }
}

export { buildFailure, isPermissionError, validateCoordinate };
