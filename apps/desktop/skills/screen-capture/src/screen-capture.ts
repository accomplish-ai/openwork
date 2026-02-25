import * as fs from 'fs';
import * as path from 'path';

import {
  CAPTURE_MAX_RETRIES,
  CAPTURE_RETRY_DELAY_MS,
  SCREENCAPTURE_BIN,
  TEMP_DIR,
} from './constants';
import { normalizeCaptureError, ToolError } from './errors';
import { safeUnlink, sleep } from './fs-utils';
import { execAsync } from './process-utils';
import type { CaptureMode } from './types';
import { getImageDimensions } from './screen-utils';

async function getActiveWindowRegionArg(): Promise<string | null> {
  try {
    const { stdout: boundsInfo } = await execAsync(`
      osascript -e 'tell application "System Events"
        tell (first application process whose frontmost is true)
          tell (first window)
            return {position, size}
          end tell
        end tell
      end tell'
    `);

    const boundsMatch = boundsInfo.match(/(-?\d+),\s*(-?\d+).*?(\d+),\s*(\d+)/);
    if (!boundsMatch) {
      console.error(
        'ERR_CAPTURE_COMMAND_FAILED|Could not parse active window bounds, falling back to full-screen capture.'
      );
      return null;
    }

    const [, x, y, width, height] = boundsMatch;
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (
      !Number.isFinite(numericWidth) ||
      !Number.isFinite(numericHeight) ||
      numericWidth <= 0 ||
      numericHeight <= 0
    ) {
      console.error(
        'ERR_CAPTURE_COMMAND_FAILED|Active window bounds were invalid, falling back to full-screen capture.'
      );
      return null;
    }

    return `-R${x},${y},${width},${height}`;
  } catch {
    console.error(
      'ERR_CAPTURE_COMMAND_FAILED|Active window lookup failed, falling back to full-screen capture.'
    );
    return null;
  }
}

async function getScreenSizeInPoints(): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout: screenSize } = await execAsync(`
      osascript -e 'tell application "Finder" to get bounds of window of desktop'
    `);
    const screenMatch = screenSize.match(/(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (!screenMatch) {
      return null;
    }

    const width = parseInt(screenMatch[3], 10);
    const height = parseInt(screenMatch[4], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  } catch {
    return null;
  }
}

/**
 * Capture a screenshot using macOS screencapture command
 */
export async function captureScreen(options: {
  includeCursor?: boolean;
  activeWindowOnly?: boolean;
}): Promise<{
  imageDataUrl: string;
  mode: CaptureMode;
  coordinateSpace: {
    origin: 'top-left';
    clickToolUnits: 'screen_points';
    screenshotPixels?: { width: number; height: number };
    screenPoints?: { width: number; height: number };
    pixelsPerPoint?: { x: number; y: number };
  };
}> {
  let regionArg = '';
  let mode: CaptureMode = 'full-screen';

  if (options.activeWindowOnly) {
    const activeWindowRegion = await getActiveWindowRegionArg();
    if (activeWindowRegion) {
      regionArg = ` ${activeWindowRegion}`;
      mode = 'active-window';
    }
  }

  for (let attempt = 1; attempt <= CAPTURE_MAX_RETRIES; attempt += 1) {
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}_${attempt}.png`;
    const filePath = path.join(TEMP_DIR, filename);

    let cmd = `${SCREENCAPTURE_BIN} -x`;
    if (options.includeCursor) {
      cmd += ' -C';
    }
    cmd += `${regionArg} "${filePath}"`;

    try {
      await execAsync(cmd);

      if (!fs.existsSync(filePath)) {
        throw new ToolError(
          'ERR_CAPTURE_OUTPUT_MISSING',
          'Capture output file was not created.',
          true
        );
      }

      const imageBuffer = fs.readFileSync(filePath);
      if (imageBuffer.length === 0) {
        throw new ToolError(
          'ERR_CAPTURE_OUTPUT_MISSING',
          'Capture output file was empty.',
          true
        );
      }

      const dimensions = await getImageDimensions(filePath).catch(() => ({}));
      const screenSizeInPoints = await getScreenSizeInPoints();

      const screenshotPixels =
        typeof dimensions.width === 'number' && typeof dimensions.height === 'number'
          ? { width: dimensions.width, height: dimensions.height }
          : undefined;
      const screenPoints = screenSizeInPoints
        ? { width: screenSizeInPoints.width, height: screenSizeInPoints.height }
        : undefined;
      const pixelsPerPoint =
        screenshotPixels &&
        screenPoints &&
        screenPoints.width > 0 &&
        screenPoints.height > 0
          ? {
              x: Number((screenshotPixels.width / screenPoints.width).toFixed(4)),
              y: Number((screenshotPixels.height / screenPoints.height).toFixed(4)),
            }
          : undefined;

      return {
        imageDataUrl: `data:image/png;base64,${imageBuffer.toString('base64')}`,
        mode,
        coordinateSpace: {
          origin: 'top-left',
          clickToolUnits: 'screen_points',
          screenshotPixels,
          screenPoints,
          pixelsPerPoint,
        },
      };
    } catch (error) {
      const captureError = normalizeCaptureError(error);
      if (captureError.recoverable && attempt < CAPTURE_MAX_RETRIES) {
        await sleep(CAPTURE_RETRY_DELAY_MS * attempt);
        continue;
      }
      if (captureError.recoverable) {
        throw new ToolError(
          'ERR_CAPTURE_RETRY_EXHAUSTED',
          `Screen capture failed after ${CAPTURE_MAX_RETRIES} attempts.`
        );
      }
      throw captureError;
    } finally {
      safeUnlink(filePath);
    }
  }

  throw new ToolError(
    'ERR_CAPTURE_RETRY_EXHAUSTED',
    `Screen capture failed after ${CAPTURE_MAX_RETRIES} attempts.`
  );
}

/**
 * Get information about the current screen state
 */
export async function getScreenInfo(): Promise<{
  activeApp: string;
  activeWindow: string;
  screenSize: { width: number; height: number };
  mousePosition: { x: number; y: number };
}> {
  try {
    const { stdout: appInfo } = await execAsync(`
      osascript -e 'tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        try
          set winTitle to name of first window of frontApp
        on error
          set winTitle to "No window"
        end try
        return appName & "|||" & winTitle
      end tell'
    `);

    const [activeApp, activeWindow] = appInfo.trim().split('|||');

    const screenSize = await getScreenSizeInPoints();
    const width = screenSize?.width ?? 1920;
    const height = screenSize?.height ?? 1080;

    let mouseX = 0;
    let mouseY = 0;

    try {
      const { stdout: mousePos } = await execAsync(`
        osascript -e 'tell application "System Events"
          set mousePos to do shell script "python3 -c \\\"import Quartz; loc = Quartz.NSEvent.mouseLocation(); print(int(loc.x), int(loc.y))\\\""
          return mousePos
        end tell'
      `);
      const mouseParts = mousePos.trim().split(' ');
      if (mouseParts.length >= 2) {
        mouseX = parseInt(mouseParts[0]);
        mouseY = height - parseInt(mouseParts[1]);
      }
    } catch {
      // Mouse position not available
    }

    return {
      activeApp: activeApp || 'Unknown',
      activeWindow: activeWindow || 'Unknown',
      screenSize: { width, height },
      mousePosition: { x: mouseX, y: mouseY },
    };
  } catch {
    throw new ToolError(
      'ERR_SCREEN_INFO_FAILED',
      'Unable to retrieve screen information.'
    );
  }
}
