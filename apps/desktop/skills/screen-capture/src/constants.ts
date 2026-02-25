import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { WindowImageLimits } from './types';

export const CAPTURE_MAX_RETRIES = 3;
export const CAPTURE_RETRY_DELAY_MS = 250;
export const HELPER_REQUEST_TIMEOUT_MS = 12000;
export const BACKGROUND_SAMPLE_INTERVAL_MS = 5000;
export const BACKGROUND_CACHE_TTL_MS = 7000;
export const BACKGROUND_MAX_WINDOW_IMAGE_BYTES = 512 * 1024;
export const BACKGROUND_MAX_IMAGE_DIMENSION = 1000;
export const TARGET_WINDOW_IMAGE_BYTES = 2 * 1024 * 1024;
export const TARGET_IMAGE_DIMENSION = 1800;
export const TINY_IMAGE_BYTES = 1024;
export const MAX_CAPTURED_WINDOWS_PER_REFRESH = 3;
export const MIN_BACKGROUND_WINDOWS_PER_REFRESH = 2;
export const MIN_FOREGROUND_WINDOWS_PER_REFRESH = 1;

export const SCREENCAPTURE_BIN = fs.existsSync('/usr/sbin/screencapture')
  ? '/usr/sbin/screencapture'
  : 'screencapture';

export const SIPS_BIN = fs.existsSync('/usr/bin/sips') ? '/usr/bin/sips' : null;

export const BACKGROUND_IMAGE_LIMITS: WindowImageLimits = {
  maxBytes: BACKGROUND_MAX_WINDOW_IMAGE_BYTES,
  maxDimension: BACKGROUND_MAX_IMAGE_DIMENSION,
};

export const TARGET_IMAGE_LIMITS: WindowImageLimits = {
  maxBytes: TARGET_WINDOW_IMAGE_BYTES,
  maxDimension: TARGET_IMAGE_DIMENSION,
};

export const TEXT_INPUT_ROLES = new Set([
  'AXTextArea',
  'AXTextField',
  'AXSearchField',
  'AXComboBox',
  'AXEditableText',
]);

export const COMPOSER_HINTS = [
  'message',
  'compose',
  'chat',
  'ask codex',
  'type',
  'prompt',
  'reply',
  'send',
];

// Temporary directory for screenshots
export const TEMP_DIR = path.join(os.tmpdir(), 'screen-agent-captures');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
