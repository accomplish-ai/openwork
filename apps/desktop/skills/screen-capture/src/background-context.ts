import * as fs from 'fs';

import {
  BACKGROUND_CACHE_TTL_MS,
  BACKGROUND_IMAGE_LIMITS,
  BACKGROUND_SAMPLE_INTERVAL_MS,
  SIPS_BIN,
  TINY_IMAGE_BYTES,
} from './constants';
import { desktopContextHelper } from './desktop-context-helper';
import { normalizeHelperFailure } from './errors';
import { safeUnlink } from './fs-utils';
import { execFileAsync } from './process-utils';
import { getImageDimensions } from './screen-utils';
import type {
  BackgroundSnapshot,
  BuildWindowContextOptions,
  DesktopContextWindow,
  WindowContextRecord,
  WindowImageLimits,
  WindowCaptureState,
} from './types';
import { buildWindowFingerprint, deriveCaptureState, selectCaptureWindowIds } from './window-selection';

const backgroundCache: {
  snapshot: BackgroundSnapshot | null;
  refreshPromise: Promise<BackgroundSnapshot> | null;
} = {
  snapshot: null,
  refreshPromise: null,
};

async function readWindowImage(
  filePath: string,
  limits: WindowImageLimits = BACKGROUND_IMAGE_LIMITS
): Promise<{
  imageBase64?: string;
  imageBytes: number;
  imageWidth?: number;
  imageHeight?: number;
  tooLarge: boolean;
}> {
  let width: number | undefined;
  let height: number | undefined;

  if (SIPS_BIN) {
    try {
      const dims = await getImageDimensions(filePath);
      width = dims.width;
      height = dims.height;

      if (
        typeof width === 'number' &&
        typeof height === 'number' &&
        (width > limits.maxDimension || height > limits.maxDimension)
      ) {
        await execFileAsync(SIPS_BIN, ['-Z', String(limits.maxDimension), filePath]);
        const resizedDims = await getImageDimensions(filePath);
        width = resizedDims.width ?? width;
        height = resizedDims.height ?? height;
      }
    } catch {
      // Ignore metadata/resize failures and continue with byte-size limits.
    }
  }

  let stats = fs.statSync(filePath);
  if (stats.size > limits.maxBytes && SIPS_BIN) {
    for (let attempt = 0; attempt < 3 && stats.size > limits.maxBytes; attempt += 1) {
      if (typeof width !== 'number' || typeof height !== 'number') {
        break;
      }
      const currentLongest = Math.max(width, height);
      if (!Number.isFinite(currentLongest) || currentLongest <= 400) {
        break;
      }

      const nextLongest = Math.max(400, Math.floor(currentLongest * 0.82));
      if (nextLongest >= currentLongest) {
        break;
      }

      try {
        await execFileAsync(SIPS_BIN, ['-Z', String(nextLongest), filePath]);
        const resizedDims = await getImageDimensions(filePath);
        width = resizedDims.width ?? width;
        height = resizedDims.height ?? height;
        stats = fs.statSync(filePath);
      } catch {
        break;
      }
    }
  }

  if (stats.size > limits.maxBytes) {
    return {
      imageBytes: stats.size,
      imageWidth: width,
      imageHeight: height,
      tooLarge: true,
    };
  }

  const buffer = fs.readFileSync(filePath);
  return {
    imageBase64: buffer.toString('base64'),
    imageBytes: buffer.length,
    imageWidth: width,
    imageHeight: height,
    tooLarge: false,
  };
}

export async function buildWindowContext(
  window: DesktopContextWindow,
  options: BuildWindowContextOptions = {}
): Promise<WindowContextRecord> {
  const imageLimits = options.imageLimits ?? BACKGROUND_IMAGE_LIMITS;
  const defaultState = deriveCaptureState(window);
  const base: Omit<WindowContextRecord, 'fingerprint'> = {
    window,
    captureState: defaultState,
    capturedAt: new Date().toISOString(),
  };

  if (defaultState === 'minimized') {
    return {
      ...base,
      fingerprint: buildWindowFingerprint(window),
    };
  }

  let imagePath: string | undefined;
  try {
    const result = await desktopContextHelper.captureWindow(window.id);
    imagePath = result.imagePath;

    const image = await readWindowImage(imagePath, imageLimits);

    if (image.tooLarge) {
      return {
        ...base,
        captureState: 'capturable',
        imageBytes: image.imageBytes,
        imageWidth: image.imageWidth,
        imageHeight: image.imageHeight,
        errorCode: 'ERR_IMAGE_TOO_LARGE',
        error: `Window image exceeded ${imageLimits.maxBytes} bytes and was omitted.`,
        fingerprint: buildWindowFingerprint(window),
      };
    }

    const captureState = image.imageBytes <= TINY_IMAGE_BYTES ? 'protected_or_blank' : 'capturable';

    return {
      ...base,
      captureState,
      imageBase64: image.imageBase64,
      imageMimeType: 'image/png',
      imageBytes: image.imageBytes,
      imageWidth: image.imageWidth,
      imageHeight: image.imageHeight,
      fingerprint: buildWindowFingerprint(window),
    };
  } catch (error) {
    const toolError = normalizeHelperFailure(error);

    let captureState: WindowCaptureState = 'unknown';
    if (toolError.code === 'ERR_DESKTOP_CONTEXT_PERMISSION_DENIED') {
      captureState = 'permission_denied';
    } else if (toolError.code === 'ERR_DESKTOP_CONTEXT_WINDOW_NOT_FOUND') {
      captureState = 'not_found';
    } else if (toolError.code === 'ERR_DESKTOP_CONTEXT_ACCESSIBILITY_DENIED') {
      captureState = 'unknown';
    } else if (defaultState === 'offscreen') {
      captureState = 'offscreen';
    }

    return {
      ...base,
      captureState,
      errorCode: toolError.code,
      error: toolError.message,
      fingerprint: buildWindowFingerprint(window),
    };
  } finally {
    if (imagePath) {
      safeUnlink(imagePath);
    }
  }
}

function shouldReuseCachedContext(
  cached: WindowContextRecord | undefined,
  window: DesktopContextWindow
): boolean {
  if (!cached) {
    return false;
  }

  return cached.fingerprint === buildWindowFingerprint(window);
}

async function refreshBackgroundSnapshot(forceRefresh: boolean): Promise<BackgroundSnapshot> {
  const windows = await desktopContextHelper.listWindows();
  const captureWindowIds = selectCaptureWindowIds(windows);

  const previousById = new Map<number, WindowContextRecord>(
    backgroundCache.snapshot?.windows.map((entry) => [entry.window.id, entry]) ?? []
  );

  const capturedById = new Map<number, WindowContextRecord>();
  const captureTargets = windows.filter((window) => captureWindowIds.has(window.id));

  await Promise.all(
    captureTargets.map(async (window) => {
      const cached = previousById.get(window.id);
      if (!forceRefresh && cached && shouldReuseCachedContext(cached, window)) {
        capturedById.set(window.id, {
          ...cached,
          window,
        });
        return;
      }

      const context = await buildWindowContext(window);
      capturedById.set(window.id, context);
    })
  );

  const nextWindows: WindowContextRecord[] = [];

  for (const window of windows) {
    const shouldCapture = captureWindowIds.has(window.id);

    if (!shouldCapture) {
      const captureState = deriveCaptureState(window);
      nextWindows.push({
        window,
        captureState,
        capturedAt: new Date().toISOString(),
        fingerprint: buildWindowFingerprint(window),
      });
      continue;
    }

    const context = capturedById.get(window.id);
    if (context) {
      nextWindows.push(context);
      continue;
    }

    nextWindows.push({
      window,
      captureState: deriveCaptureState(window),
      capturedAt: new Date().toISOString(),
      errorCode: 'ERR_INTERNAL',
      error: 'Window capture context was not available.',
      fingerprint: buildWindowFingerprint(window),
    });
  }

  const snapshot: BackgroundSnapshot = {
    capturedAt: new Date().toISOString(),
    refreshedAtMs: Date.now(),
    windows: nextWindows,
  };

  backgroundCache.snapshot = snapshot;
  return snapshot;
}

export async function getBackgroundSnapshot(forceRefresh: boolean): Promise<BackgroundSnapshot> {
  const snapshot = backgroundCache.snapshot;
  const isFresh =
    snapshot !== null &&
    Date.now() - snapshot.refreshedAtMs <= BACKGROUND_CACHE_TTL_MS;

  if (!forceRefresh && snapshot && isFresh) {
    return snapshot;
  }

  if (backgroundCache.refreshPromise) {
    return await backgroundCache.refreshPromise;
  }

  backgroundCache.refreshPromise = refreshBackgroundSnapshot(forceRefresh)
    .catch((error) => {
      throw normalizeHelperFailure(error);
    })
    .finally(() => {
      backgroundCache.refreshPromise = null;
    });

  return await backgroundCache.refreshPromise;
}

export function startBackgroundSampler(): void {
  if (!process.env.DESKTOP_CONTEXT_HELPER_PATH) {
    console.error('[screen-capture] Desktop context helper path is not configured; background sampling disabled.');
    return;
  }

  const timer = setInterval(() => {
    void getBackgroundSnapshot(false).catch((error) => {
      const toolError = normalizeHelperFailure(error);
      console.error(`[screen-capture] background sampling failed: ${toolError.code}|${toolError.message}`);
    });
  }, BACKGROUND_SAMPLE_INTERVAL_MS);

  timer.unref?.();
}

export { BACKGROUND_IMAGE_LIMITS };
