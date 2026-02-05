// apps/desktop/src/renderer/stores/scheduleStore.ts

import { create } from 'zustand';
import type { ScheduledTask, CreateScheduleConfig, UpdateScheduleConfig } from '@accomplish/shared';
import { getAccomplish } from '../lib/accomplish';

interface ScheduleState {
  // Data
  schedules: ScheduledTask[];
  isLoading: boolean;
  error: string | null;
  activeCount: number;

  // Actions
  loadSchedules: () => Promise<void>;
  loadActiveCount: () => Promise<void>;
  createSchedule: (config: CreateScheduleConfig) => Promise<ScheduledTask | null>;
  updateSchedule: (id: string, updates: UpdateScheduleConfig) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
  toggleSchedule: (id: string, enabled: boolean) => Promise<void>;
  runScheduleNow: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  isLoading: false,
  error: null,
  activeCount: 0,

  loadSchedules: async () => {
    set({ isLoading: true, error: null });
    try {
      const accomplish = getAccomplish();
      const schedules = await accomplish.scheduler.listSchedules();
      const activeCount = await accomplish.scheduler.getActiveCount();
      set({ schedules, activeCount, isLoading: false });
    } catch (error) {
      console.error('[ScheduleStore] Failed to load schedules:', error);
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  loadActiveCount: async () => {
    try {
      const accomplish = getAccomplish();
      const activeCount = await accomplish.scheduler.getActiveCount();
      set({ activeCount });
    } catch (error) {
      console.error('[ScheduleStore] Failed to load active count:', error);
    }
  },

  createSchedule: async (config) => {
    set({ error: null });
    try {
      const accomplish = getAccomplish();
      const schedule = await accomplish.scheduler.createSchedule(config);
      set((state) => ({
        schedules: [schedule, ...state.schedules],
        activeCount: state.activeCount + 1,
      }));
      return schedule;
    } catch (error) {
      console.error('[ScheduleStore] Failed to create schedule:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  updateSchedule: async (id, updates) => {
    set({ error: null });
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.updateSchedule(id, updates);
      // Refresh the schedule list to get updated data
      const schedules = await accomplish.scheduler.listSchedules();
      const activeCount = await accomplish.scheduler.getActiveCount();
      set({ schedules, activeCount });
    } catch (error) {
      console.error('[ScheduleStore] Failed to update schedule:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteSchedule: async (id) => {
    set({ error: null });
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.deleteSchedule(id);
      set((state) => {
        const scheduleToDelete = state.schedules.find((s) => s.id === id);
        const shouldDecrement = scheduleToDelete?.status === 'active' && scheduleToDelete.enabled;

        return {
          schedules: state.schedules.filter((s) => s.id !== id),
          activeCount: Math.max(0, state.activeCount - (shouldDecrement ? 1 : 0)),
        };
      });
    } catch (error) {
      console.error('[ScheduleStore] Failed to delete schedule:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  toggleSchedule: async (id, enabled) => {
    set({ error: null });
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.toggleSchedule(id, enabled);
      // Update the local state optimistically
      set((state) => {
        const current = state.schedules.find((s) => s.id === id);
        if (!current) {
          return state;
        }

        const wasCounted = current.status === 'active' && current.enabled;
        const isCounted = current.status === 'active' && enabled;
        let delta = 0;
        if (!wasCounted && isCounted) {
          delta = 1;
        } else if (wasCounted && !isCounted) {
          delta = -1;
        }

        return {
          schedules: state.schedules.map((s) => (s.id === id ? { ...s, enabled } : s)),
          activeCount: Math.max(0, state.activeCount + delta),
        };
      });
    } catch (error) {
      console.error('[ScheduleStore] Failed to toggle schedule:', error);
      set({ error: (error as Error).message });
      // Reload to get correct state
      get().loadSchedules();
      throw error;
    }
  },

  runScheduleNow: async (id) => {
    set({ error: null });
    try {
      const accomplish = getAccomplish();
      await accomplish.scheduler.runScheduleNow(id);
      // Refresh schedules to show updated lastRunAt
      get().loadSchedules();
    } catch (error) {
      console.error('[ScheduleStore] Failed to run schedule:', error);
      set({ error: (error as Error).message });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Subscribe to schedule updates from main process
if (typeof window !== 'undefined' && window.accomplish?.onScheduleUpdated) {
  window.accomplish.onScheduleUpdated(() => {
    // Reload schedules when notified of changes
    useScheduleStore.getState().loadSchedules();
  });
}
