import Store from 'electron-store';
import type { SelectedModel, OllamaConfig, DesktopControlStatusSnapshot } from '@accomplish/shared';

export interface ScreenAgentLifecycleState {
  /** Unique ID for the current process run */
  runId: string | null;
  /** Number of non-idempotent startups observed */
  startupCount: number;
  /** Number of non-idempotent restarts observed */
  restartCount: number;
  /** ISO timestamp of the last startup transition */
  lastStartupAt: string | null;
  /** ISO timestamp of the last restart transition */
  lastRestartAt: string | null;
  /** Restart token used to dedupe repeated restart requests */
  lastRestartToken: string | null;
}

const DEFAULT_SCREEN_AGENT_LIFECYCLE_STATE: ScreenAgentLifecycleState = {
  runId: null,
  startupCount: 0,
  restartCount: 0,
  lastStartupAt: null,
  lastRestartAt: null,
  lastRestartToken: null,
};

/**
 * App settings schema
 */
interface AppSettingsSchema {
  /** Enable debug mode to show backend logs in UI */
  debugMode: boolean;
  /** Whether the user has completed the onboarding wizard */
  onboardingComplete: boolean;
  /** Feature flag to enable desktop control preflight checks */
  desktopControlPreflight: boolean;
  /** Feature flag to enable sampled live screen sessions */
  liveScreenSampling: boolean;
  /** Allow agent to control mouse and keyboard via desktop actions */
  allowMouseControl: boolean;
  /** Allow agent to see other apps' windows (requires Accessibility and Screen Recording permissions) */
  allowDesktopContext: boolean;
  /** Enable background polling for desktop context (always-on mode) */
  desktopContextBackgroundPolling: boolean;
  /** Selected AI model (provider/model format) */
  selectedModel: SelectedModel | null;
  /** Ollama server configuration */
  ollamaConfig: OllamaConfig | null;
  /** Screen Agent lifecycle metadata for deterministic restart/recheck flow */
  screenAgentLifecycle: ScreenAgentLifecycleState;
  /** Cached readiness snapshot for instant UI on app restart */
  cachedReadinessSnapshot: DesktopControlStatusSnapshot | null;
  /** ISO timestamp of when cachedReadinessSnapshot was stored */
  cachedReadinessSnapshotAt: string | null;
}

const appSettingsStore = new Store<AppSettingsSchema>({
  name: 'app-settings',
  defaults: {
    debugMode: false,
    onboardingComplete: false,
    // Conservative rollout defaults: both features are opt-in.
    desktopControlPreflight: false,
    liveScreenSampling: false,
    allowMouseControl: false,
    allowDesktopContext: false,
    desktopContextBackgroundPolling: false,
    selectedModel: {
      provider: 'anthropic',
      model: 'anthropic/claude-opus-4-5',
    },
    ollamaConfig: null,
    screenAgentLifecycle: { ...DEFAULT_SCREEN_AGENT_LIFECYCLE_STATE },
    cachedReadinessSnapshot: null,
    cachedReadinessSnapshotAt: null,
  },
});

function cloneLifecycleState(state: ScreenAgentLifecycleState): ScreenAgentLifecycleState {
  return {
    ...state,
  };
}

/**
 * Get debug mode setting
 */
export function getDebugMode(): boolean {
  return appSettingsStore.get('debugMode');
}

/**
 * Set debug mode setting
 */
export function setDebugMode(enabled: boolean): void {
  appSettingsStore.set('debugMode', enabled);
}

/**
 * Get onboarding complete setting
 */
export function getOnboardingComplete(): boolean {
  return appSettingsStore.get('onboardingComplete');
}

/**
 * Set onboarding complete setting
 */
export function setOnboardingComplete(complete: boolean): void {
  appSettingsStore.set('onboardingComplete', complete);
}

/**
 * Get desktop control preflight feature flag
 */
export function getDesktopControlPreflight(): boolean {
  return appSettingsStore.get('desktopControlPreflight');
}

/**
 * Set desktop control preflight feature flag
 */
export function setDesktopControlPreflight(enabled: boolean): void {
  appSettingsStore.set('desktopControlPreflight', enabled);
}

/**
 * Get live screen sampling feature flag
 */
export function getLiveScreenSampling(): boolean {
  return appSettingsStore.get('liveScreenSampling');
}

/**
 * Set live screen sampling feature flag
 */
export function setLiveScreenSampling(enabled: boolean): void {
  appSettingsStore.set('liveScreenSampling', enabled);
}

/**
 * Get selected model
 */
export function getSelectedModel(): SelectedModel | null {
  return appSettingsStore.get('selectedModel');
}

/**
 * Set selected model
 */
export function setSelectedModel(model: SelectedModel): void {
  appSettingsStore.set('selectedModel', model);
}

/**
 * Get Ollama configuration
 */
export function getOllamaConfig(): OllamaConfig | null {
  return appSettingsStore.get('ollamaConfig');
}

/**
 * Set Ollama configuration
 */
export function setOllamaConfig(config: OllamaConfig | null): void {
  appSettingsStore.set('ollamaConfig', config);
}

/**
 * Get the persisted screen-agent lifecycle state.
 */
export function getScreenAgentLifecycleState(): ScreenAgentLifecycleState {
  return cloneLifecycleState(appSettingsStore.get('screenAgentLifecycle'));
}

/**
 * Record a startup transition in an idempotent way for a run ID.
 */
export function recordScreenAgentStartup(
  runId: string,
  startedAt: string
): ScreenAgentLifecycleState {
  const current = getScreenAgentLifecycleState();
  if (current.runId === runId) {
    return current;
  }

  const next: ScreenAgentLifecycleState = {
    ...current,
    runId,
    startupCount: current.startupCount + 1,
    lastStartupAt: startedAt,
    lastRestartToken: null,
  };
  appSettingsStore.set('screenAgentLifecycle', next);
  return cloneLifecycleState(next);
}

/**
 * Record a restart transition in an idempotent way for a run ID and token.
 */
export function recordScreenAgentRestart(
  runId: string,
  restartToken: string,
  restartedAt: string
): ScreenAgentLifecycleState {
  const current = getScreenAgentLifecycleState();
  if (current.runId === runId && current.lastRestartToken === restartToken) {
    return current;
  }

  const next: ScreenAgentLifecycleState = {
    ...current,
    runId,
    restartCount: current.restartCount + 1,
    lastRestartAt: restartedAt,
    lastRestartToken: restartToken,
  };
  appSettingsStore.set('screenAgentLifecycle', next);
  return cloneLifecycleState(next);
}

/**
 * Clear only lifecycle metadata while keeping other user settings.
 */
export function clearScreenAgentLifecycleState(): void {
  appSettingsStore.set('screenAgentLifecycle', { ...DEFAULT_SCREEN_AGENT_LIFECYCLE_STATE });
}

/**
 * Get the cached readiness snapshot (if any).
 */
export function getCachedReadinessSnapshot(): DesktopControlStatusSnapshot | null {
  return appSettingsStore.get('cachedReadinessSnapshot');
}

/**
 * Get the ISO timestamp of the cached readiness snapshot.
 */
export function getCachedReadinessSnapshotAt(): string | null {
  return appSettingsStore.get('cachedReadinessSnapshotAt');
}

/**
 * Persist a readiness snapshot for instant UI on next app launch.
 */
export function setCachedReadinessSnapshot(snapshot: DesktopControlStatusSnapshot): void {
  appSettingsStore.set('cachedReadinessSnapshot', snapshot);
  appSettingsStore.set('cachedReadinessSnapshotAt', new Date().toISOString());
}

/**
 * Clear the cached readiness snapshot.
 */
export function clearCachedReadinessSnapshot(): void {
  appSettingsStore.set('cachedReadinessSnapshot', null);
  appSettingsStore.set('cachedReadinessSnapshotAt', null);
}

/**
 * Get all app settings
 */
export function getAppSettings(): AppSettingsSchema {
  return {
    debugMode: appSettingsStore.get('debugMode'),
    onboardingComplete: appSettingsStore.get('onboardingComplete'),
    desktopControlPreflight: appSettingsStore.get('desktopControlPreflight'),
    liveScreenSampling: appSettingsStore.get('liveScreenSampling'),
    allowMouseControl: appSettingsStore.get('allowMouseControl'),
    allowDesktopContext: appSettingsStore.get('allowDesktopContext'),
    desktopContextBackgroundPolling: appSettingsStore.get('desktopContextBackgroundPolling'),
    selectedModel: appSettingsStore.get('selectedModel'),
    ollamaConfig: appSettingsStore.get('ollamaConfig'),
    screenAgentLifecycle: cloneLifecycleState(appSettingsStore.get('screenAgentLifecycle')),
  };
}

/**
 * Get allowMouseControl feature flag
 */
export function getAllowMouseControl(): boolean {
  return appSettingsStore.get('allowMouseControl');
}

/**
 * Set allowMouseControl feature flag
 */
export function setAllowMouseControl(enabled: boolean): void {
  appSettingsStore.set('allowMouseControl', enabled);
}

/**
 * Get allowDesktopContext feature flag
 */
export function getAllowDesktopContext(): boolean {
  return appSettingsStore.get('allowDesktopContext');
}

/**
 * Set allowDesktopContext feature flag
 */
export function setAllowDesktopContext(enabled: boolean): void {
  appSettingsStore.set('allowDesktopContext', enabled);
}

/**
 * Get desktopContextBackgroundPolling feature flag
 */
export function getDesktopContextBackgroundPolling(): boolean {
  return appSettingsStore.get('desktopContextBackgroundPolling');
}

/**
 * Set desktopContextBackgroundPolling feature flag
 */
export function setDesktopContextBackgroundPolling(enabled: boolean): void {
  appSettingsStore.set('desktopContextBackgroundPolling', enabled);
}

/**
 * Clear all app settings (reset to defaults)
 * Used during fresh install cleanup
 */
export function clearAppSettings(): void {
  appSettingsStore.clear();
}
