export type {
  BrowserMode,
  BrowserState,
  BrowserStatus,
  AcquireOptions,
  HealthCheck,
  HealthResult,
  PortPair,
  StateSubscriber,
  BrowserManagerConfig,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

export { findAvailablePorts, checkPortStatus, PortExhaustedError } from './port-finder.js';
export type { PortStatus } from './port-finder.js';

export { evaluateHealth, performHealthCheck } from './health.js';

// BrowserManager will be added in Task 8
