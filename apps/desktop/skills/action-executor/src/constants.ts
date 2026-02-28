export type MouseButton = 'left' | 'right';
export type ScrollDirection = 'up' | 'down' | 'left' | 'right';
export type ModifierKey = 'command' | 'shift' | 'option' | 'control';
export type ActionExecutorErrorCode = 'INVALID_INPUT' | 'PERMISSION_MISSING' | 'RUNTIME_FAILURE';

export const MIN_COORDINATE = 0;
export const MAX_COORDINATE = 100000;
export const MAX_APP_NAME_LENGTH = 120;
export const DEFAULT_SCROLL_AMOUNT = 3;
export const MIN_SCROLL_AMOUNT = 0;
export const MAX_SCROLL_AMOUNT = 100;
export const EXECUTION_TIMEOUT_MS = 10000;

export const VALID_BUTTONS = new Set<MouseButton>(['left', 'right']);
export const VALID_DIRECTIONS = new Set<ScrollDirection>(['up', 'down', 'left', 'right']);
export const VALID_MODIFIERS = new Set<ModifierKey>(['command', 'shift', 'option', 'control']);

export const PERMISSION_REMEDIATION =
  'Grant Accessibility access to the host app in System Settings > Privacy & Security > Accessibility, then retry.';
export const INVALID_INPUT_REMEDIATION = 'Fix the tool arguments and retry with valid values.';
export const RUNTIME_REMEDIATION =
  'Verify required system dependencies are available (python3, osascript, Quartz) and retry.';
export const APP_ACTIVATION_REMEDIATION =
  'Verify the app name in Launchpad or /Applications and retry with the exact app name.';

export const PERMISSION_ERROR_PATTERNS = [
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

// Key code mappings for common keys (macOS virtual key codes)
export const KEY_CODES: Record<string, number> = {
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
