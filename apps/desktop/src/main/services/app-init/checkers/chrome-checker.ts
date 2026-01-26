import type { ComponentHealth } from '@accomplish/shared';
import { detectChrome, type ChromeDetectionResult } from '../../../utils/chrome-detector';

export { detectChrome, type ChromeDetectionResult };

export function toComponentHealth(result: ChromeDetectionResult): ComponentHealth {
  return {
    name: 'chrome',
    displayName: 'Google Chrome',
    status: result.found ? 'healthy' : 'failed',
    lastCheck: Date.now(),
    error: result.error,
    retryCount: 0,
  };
}
