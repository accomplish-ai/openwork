import {
  MAX_CAPTURED_WINDOWS_PER_REFRESH,
  MIN_BACKGROUND_WINDOWS_PER_REFRESH,
  MIN_FOREGROUND_WINDOWS_PER_REFRESH,
} from './constants';
import type { CaptureSelectionContext, DesktopContextWindow, WindowCaptureState } from './types';

export function buildWindowFingerprint(window: DesktopContextWindow): string {
  return [
    window.id,
    window.appName,
    window.title,
    window.bounds.x,
    window.bounds.y,
    window.bounds.width,
    window.bounds.height,
    window.zOrder,
    window.stackIndex ?? '',
    window.isOnScreen,
    window.isMinimized,
    window.isVisible,
    window.isFrontmostApp ?? '',
    window.appIsHidden ?? '',
    window.layer,
  ].join('|');
}

export function deriveCaptureState(window: DesktopContextWindow): WindowCaptureState {
  if (window.isMinimized) {
    return 'minimized';
  }
  if (!window.isOnScreen || !window.isVisible || window.appIsHidden) {
    return 'offscreen';
  }
  return 'capturable';
}

export function buildSelectionContext(windows: DesktopContextWindow[]): CaptureSelectionContext {
  const active = windows.filter((window) => !window.isMinimized);
  if (active.length === 0) {
    return {
      foregroundAppName: null,
      topWindowId: null,
    };
  }

  const topWindow = [...active].sort((a, b) => b.zOrder - a.zOrder)[0];
  const explicitFrontmost = active.find((window) => window.isFrontmostApp === true);

  return {
    foregroundAppName: explicitFrontmost?.appName ?? topWindow?.appName ?? null,
    topWindowId: topWindow?.id ?? null,
  };
}

export function isBackgroundWindow(
  window: DesktopContextWindow,
  context: CaptureSelectionContext
): boolean {
  if (window.isMinimized) {
    return true;
  }

  if (!window.isOnScreen || !window.isVisible || window.appIsHidden) {
    return true;
  }

  if (window.isFrontmostApp === false) {
    return true;
  }

  if (context.foregroundAppName) {
    return window.appName !== context.foregroundAppName;
  }

  if (context.topWindowId !== null) {
    return window.id !== context.topWindowId;
  }

  return true;
}

export function windowCapturePriority(
  window: DesktopContextWindow,
  context: CaptureSelectionContext
): number {
  const hasTitle = window.title.trim().length > 0;
  const background = isBackgroundWindow(window, context) ? 1 : 0;
  const onScreen = window.isOnScreen ? 1 : 0;
  const visible = window.isVisible ? 1 : 0;
  const appHidden = window.appIsHidden ? 1 : 0;
  const active = window.isMinimized ? 0 : 1;
  const area = Math.max(0, window.bounds.width) * Math.max(0, window.bounds.height);
  const areaScore = Math.min(Math.floor(area / 10000), 120);

  return (
    (hasTitle ? 200 : 0) +
    (background * 170) +
    (appHidden * 40) +
    areaScore +
    (onScreen * 20) +
    (visible * 20) +
    (active * 20) +
    window.zOrder
  );
}

export function selectCaptureWindowIds(windows: DesktopContextWindow[]): Set<number> {
  const context = buildSelectionContext(windows);
  const ranked = [...windows]
    .filter((window) => deriveCaptureState(window) !== 'minimized')
    .sort((a, b) => windowCapturePriority(b, context) - windowCapturePriority(a, context));

  const selected: DesktopContextWindow[] = [];
  const selectedIds = new Set<number>();

  const backgroundPreferred = ranked
    .filter((window) => isBackgroundWindow(window, context) && window.title.trim().length > 0)
    .slice(0, MIN_BACKGROUND_WINDOWS_PER_REFRESH);

  for (const window of backgroundPreferred) {
    if (selectedIds.has(window.id)) {
      continue;
    }
    selected.push(window);
    selectedIds.add(window.id);
  }

  const foregroundPreferred = ranked
    .filter((window) => !isBackgroundWindow(window, context) && window.title.trim().length > 0)
    .slice(0, MIN_FOREGROUND_WINDOWS_PER_REFRESH);

  for (const window of foregroundPreferred) {
    if (selected.length >= MAX_CAPTURED_WINDOWS_PER_REFRESH || selectedIds.has(window.id)) {
      continue;
    }
    selected.push(window);
    selectedIds.add(window.id);
  }

  for (const window of ranked) {
    if (selected.length >= MAX_CAPTURED_WINDOWS_PER_REFRESH) {
      break;
    }
    if (selectedIds.has(window.id)) {
      continue;
    }
    selected.push(window);
    selectedIds.add(window.id);
  }

  return selectedIds;
}
