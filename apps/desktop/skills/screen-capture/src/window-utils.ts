import type {
  CaptureSelectionContext,
  DesktopContextWindow,
  WindowContextRecord,
} from './types';
import { deriveCaptureState, isBackgroundWindow } from './window-selection';

export function filterWindows(
  windows: DesktopContextWindow[],
  options: { includeMinimized: boolean; includeOffscreen: boolean }
): DesktopContextWindow[] {
  return windows.filter((window) => {
    if (!options.includeMinimized && window.isMinimized) {
      return false;
    }

    if (!options.includeOffscreen && (!window.isOnScreen || !window.isVisible || window.appIsHidden)) {
      return false;
    }

    return true;
  });
}

export function buildWindowSummary(
  record: WindowContextRecord,
  context?: CaptureSelectionContext
): Record<string, unknown> {
  return {
    id: record.window.id,
    appName: record.window.appName,
    pid: record.window.pid,
    title: record.window.title,
    bounds: record.window.bounds,
    zOrder: record.window.zOrder,
    stackIndex: record.window.stackIndex,
    isOnScreen: record.window.isOnScreen,
    isMinimized: record.window.isMinimized,
    isVisible: record.window.isVisible,
    isFrontmostApp: record.window.isFrontmostApp,
    appIsHidden: record.window.appIsHidden,
    isBackground: context ? isBackgroundWindow(record.window, context) : undefined,
    layer: record.window.layer,
    captureState: record.captureState,
    capturedAt: record.capturedAt,
    imageBytes: record.imageBytes,
    imageWidth: record.imageWidth,
    imageHeight: record.imageHeight,
    errorCode: record.errorCode,
    error: record.error,
  };
}

export function buildWindowMetadataOnly(
  window: DesktopContextWindow,
  context?: CaptureSelectionContext
): Record<string, unknown> {
  return {
    id: window.id,
    appName: window.appName,
    pid: window.pid,
    title: window.title,
    bounds: window.bounds,
    zOrder: window.zOrder,
    stackIndex: window.stackIndex,
    isOnScreen: window.isOnScreen,
    isMinimized: window.isMinimized,
    isVisible: window.isVisible,
    isFrontmostApp: window.isFrontmostApp,
    appIsHidden: window.appIsHidden,
    isBackground: context ? isBackgroundWindow(window, context) : undefined,
    layer: window.layer,
    captureState: deriveCaptureState(window),
  };
}

export function getWindowById(
  windows: DesktopContextWindow[],
  windowId: number
): DesktopContextWindow | undefined {
  return windows.find((entry) => entry.id === windowId);
}
