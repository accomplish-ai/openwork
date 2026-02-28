import { COMPOSER_HINTS, TEXT_INPUT_ROLES } from './constants';
import { ToolError } from './errors';
import { asRecord, toOptionalBoolean, toOptionalString } from './parsing';
import type {
  AccessibleNodeFrame,
  AccessibleNodeLike,
  DesktopContextWindow,
  TextInputCandidate,
} from './types';

function toAccessibleFrame(value: unknown): AccessibleNodeFrame | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const x = record.x;
  const y = record.y;
  const width = record.width;
  const height = record.height;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function frameIntersectsWindow(
  frame: AccessibleNodeFrame,
  window: DesktopContextWindow
): boolean {
  const left = window.bounds.x;
  const top = window.bounds.y;
  const right = left + window.bounds.width;
  const bottom = top + window.bounds.height;

  const frameRight = frame.x + frame.width;
  const frameBottom = frame.y + frame.height;

  return frameRight >= left && frame.x <= right && frameBottom >= top && frame.y <= bottom;
}

function safeClickPointForFrame(
  frame: AccessibleNodeFrame,
  options?: { preferLowerHalf?: boolean }
): { x: number; y: number } {
  const insetX = Math.min(16, Math.max(4, frame.width * 0.12));
  const insetY = Math.min(12, Math.max(4, frame.height * 0.2));
  const x = clamp(frame.x + frame.width / 2, frame.x + insetX, frame.x + frame.width - insetX);
  const preferredY = options?.preferLowerHalf
    ? frame.y + frame.height * 0.6
    : frame.y + frame.height / 2;
  const y = clamp(preferredY, frame.y + insetY, frame.y + frame.height - insetY);
  return { x: Math.round(x), y: Math.round(y) };
}

function sanitizeValuePreview(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function scoreTextInputCandidate(
  role: string,
  frame: AccessibleNodeFrame,
  window: DesktopContextWindow,
  focused: boolean | undefined,
  hintText: string
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (role === 'AXTextArea') {
    score += 30;
    reasons.push('textarea-role');
  } else if (role === 'AXTextField') {
    score += 22;
    reasons.push('textfield-role');
  } else {
    score += 12;
    reasons.push('editable-role');
  }

  const widthRatio = frame.width / Math.max(window.bounds.width, 1);
  if (widthRatio >= 0.5) {
    score += 40;
    reasons.push('wide-input');
  } else if (widthRatio >= 0.3) {
    score += 20;
    reasons.push('medium-width-input');
  }

  const bottomDistance = Math.max(0, (frame.y + frame.height) - window.bounds.y);
  const bottomRatio = bottomDistance / Math.max(window.bounds.height, 1);
  if (bottomRatio >= 0.75) {
    score += 40;
    reasons.push('near-window-bottom');
  } else if (bottomRatio >= 0.55) {
    score += 20;
    reasons.push('lower-half-input');
  }

  if (frame.height >= 32 && frame.height <= 180) {
    score += 15;
    reasons.push('chat-like-height');
  }

  if (focused) {
    score += 25;
    reasons.push('already-focused');
  }

  if (hintText.length > 0) {
    const matches = COMPOSER_HINTS.filter((hint) => hintText.includes(hint));
    if (matches.length > 0) {
      score += 18 + Math.min(matches.length * 4, 16);
      reasons.push('composer-hint');
    }
  }

  if (window.appName.toLowerCase().includes('codex') && widthRatio >= 0.5 && bottomRatio >= 0.65) {
    score += 30;
    reasons.push('codex-bottom-composer-shape');
  }

  return { score, reasons };
}

export function collectTextInputCandidates(tree: unknown, window: DesktopContextWindow): TextInputCandidate[] {
  const root = asRecord(tree);
  if (!root) {
    return [];
  }

  const stack: Record<string, unknown>[] = [root];
  const candidates: TextInputCandidate[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const node = current as AccessibleNodeLike;
    const role = typeof node.role === 'string' ? node.role : '';

    if (TEXT_INPUT_ROLES.has(role)) {
      const frame = toAccessibleFrame(node.frame);
      if (frame && frameIntersectsWindow(frame, window)) {
        const title = toOptionalString(node.title);
        const description = toOptionalString(node.description);
        const value = toOptionalString(node.value);
        const focused = toOptionalBoolean(node.focused);
        const enabled = toOptionalBoolean(node.enabled);

        const hintText = `${title ?? ''} ${description ?? ''} ${value ?? ''}`.toLowerCase();
        const { score, reasons } = scoreTextInputCandidate(role, frame, window, focused, hintText);
        const preferLowerHalf =
          reasons.includes('codex-bottom-composer-shape') || reasons.includes('composer-hint');

        candidates.push({
          role,
          title,
          description,
          valuePreview: sanitizeValuePreview(value),
          frame,
          clickPoint: safeClickPointForFrame(frame, { preferLowerHalf }),
          enabled,
          focused,
          score,
          reasons,
        });
      }
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = asRecord(children[index]);
      if (child) {
        stack.push(child);
      }
    }
  }

  return candidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    const aFocused = a.focused ? 1 : 0;
    const bFocused = b.focused ? 1 : 0;
    if (aFocused !== bFocused) {
      return bFocused - aFocused;
    }
    return (b.frame.width * b.frame.height) - (a.frame.width * a.frame.height);
  });
}

export function resolveWindowForTextInputs(
  windows: DesktopContextWindow[],
  args: { windowId: number | null; appName: string | null }
): DesktopContextWindow {
  const interactiveWindows = windows.filter((window) =>
    !window.isMinimized && window.isOnScreen && window.isVisible && !window.appIsHidden
  );
  const pool = interactiveWindows.length > 0 ? interactiveWindows : windows;

  if (args.windowId !== null) {
    const byId = pool.find((window) => window.id === args.windowId);
    if (!byId) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND',
        `Window ${args.windowId} was not found. Run list_windows and retry.`
      );
    }
    return byId;
  }

  if (args.appName) {
    const appNameLower = args.appName.toLowerCase();
    const matches = pool.filter((window) => window.appName.toLowerCase().includes(appNameLower));
    if (matches.length === 0) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND',
        `No visible window matched app_name "${args.appName}". Run list_windows and retry.`
      );
    }
    return [...matches].sort((a, b) => b.zOrder - a.zOrder)[0];
  }

  const frontmost = pool.find((window) => window.isFrontmostApp === true);
  if (frontmost) {
    return frontmost;
  }

  if (pool.length === 0) {
    throw new ToolError(
      'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND',
      'No candidate windows are available for text-input discovery.'
    );
  }

  return [...pool].sort((a, b) => b.zOrder - a.zOrder)[0];
}
