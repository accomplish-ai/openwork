/**
 * Browser automation utilities
 *
 * Platform-independent browser detection and dev-browser server management.
 */

export {
  isSystemChromeInstalled,
  isPlaywrightInstalled,
  hasBrowserAvailable,
} from './detection.js';

export {
  type BrowserServerConfig,
  type ServerStartResult,
  installPlaywrightChromium,
  isDevBrowserServerReady,
  waitForDevBrowserServer,
  startDevBrowserServer,
  ensureDevBrowserServer,
} from './server.js';
