import { create } from 'zustand';
import type { SystemHealth, ComponentHealth } from '@accomplish/shared';
import { getAccomplish } from '../lib/accomplish';

interface HealthState {
  health: SystemHealth | null;
  progressMessage: string | null;
  isExpanded: boolean;

  // Actions
  loadHealth: () => Promise<void>;
  retry: () => Promise<void>;
  setExpanded: (expanded: boolean) => void;
  setProgressMessage: (message: string | null) => void;
  updateHealth: (health: SystemHealth) => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  health: null,
  progressMessage: null,
  isExpanded: false,

  loadHealth: async () => {
    const accomplish = getAccomplish();
    const health = await accomplish.getSystemHealth() as SystemHealth;
    set({ health });
  },

  retry: async () => {
    const accomplish = getAccomplish();
    const health = await accomplish.retrySystemHealth() as SystemHealth;
    set({ health });
  },

  setExpanded: (expanded: boolean) => {
    set({ isExpanded: expanded });
  },

  setProgressMessage: (message: string | null) => {
    set({ progressMessage: message });
  },

  updateHealth: (health: SystemHealth) => {
    set({ health, progressMessage: health.checkingComponent });
  },
}));

// Setup event listeners (call once at app startup)
export function setupHealthListeners(): void {
  const accomplish = getAccomplish();

  accomplish.onHealthChanged?.((health: unknown) => {
    useHealthStore.getState().updateHealth(health as SystemHealth);
  });

  accomplish.onHealthProgress?.((message: string) => {
    useHealthStore.getState().setProgressMessage(message);
  });
}
