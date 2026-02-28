import type { MouseButton, ScrollDirection, ModifierKey } from './constants';
import { DEFAULT_SCROLL_AMOUNT, KEY_CODES, APP_ACTIVATION_REMEDIATION } from './constants';
import {
  PYTHON_MOVE_MOUSE_SCRIPT,
  PYTHON_CLICK_SCRIPT,
  PYTHON_DOUBLE_CLICK_SCRIPT,
  PYTHON_SCROLL_SCRIPT,
  APPLESCRIPT_TYPE_TEXT,
  APPLESCRIPT_PRESS_KEY,
  APPLESCRIPT_ACTIVATE_APP,
} from './scripts';
import { runPythonScript, runAppleScript, runExecutable } from './executors';
import { ActionExecutorError, extractExecDetails, errorMessage } from './errors';

const POINTER_SETTLE_DELAY_MS = 80;

function waitForPointerSettle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, POINTER_SETTLE_DELAY_MS));
}

/**
 * Move the mouse to a specific position
 */
export async function moveMouse(x: number, y: number): Promise<void> {
  await runPythonScript(PYTHON_MOVE_MOUSE_SCRIPT, [String(x), String(y)], {
    action: 'move_mouse',
    x,
    y,
  });
}

/**
 * Click at a specific position
 */
export async function click(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
  await moveMouse(x, y);
  await waitForPointerSettle();
  await runPythonScript(PYTHON_CLICK_SCRIPT, [String(x), String(y), button], {
    action: 'click',
    x,
    y,
    button,
  });
}

/**
 * Double-click at a specific position
 */
export async function doubleClick(x: number, y: number): Promise<void> {
  await moveMouse(x, y);
  await waitForPointerSettle();
  await runPythonScript(PYTHON_DOUBLE_CLICK_SCRIPT, [String(x), String(y)], {
    action: 'double_click',
    x,
    y,
  });
}

/**
 * Type text using keyboard events
 */
export async function typeText(text: string): Promise<void> {
  await runAppleScript(APPLESCRIPT_TYPE_TEXT, [text], {
    action: 'type_text',
    textLength: text.length,
  });
}

/**
 * Press a specific key with optional modifiers
 */
export async function pressKey(
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
export async function activateApp(appName: string): Promise<void> {
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
export async function scroll(direction: ScrollDirection, amount: number = DEFAULT_SCROLL_AMOUNT): Promise<void> {
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
