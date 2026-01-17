/**
 * Process Tracker
 *
 * Tracks spawned child processes to prevent zombie processes when the app exits.
 * All detached/unreferenced processes should be registered here so they can be
 * properly cleaned up on application quit.
 *
 * @module main/utils/process-tracker
 */

/**
 * Information about a tracked process
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  startTime: Date;
}

/**
 * Signal types for process termination
 */
export type KillSignal = 'SIGTERM' | 'SIGKILL' | 'SIGINT';

/**
 * ProcessTracker manages spawned child processes to prevent zombies
 */
export class ProcessTracker {
  private trackedProcesses: Map<number, ProcessInfo> = new Map();

  /**
   * Track a spawned process
   * @param pid - Process ID to track
   * @param name - Human-readable name for logging
   */
  trackProcess(pid: number, name: string): void {
    if (this.trackedProcesses.has(pid)) {
      console.log(`[ProcessTracker] Process ${pid} (${name}) already tracked, updating`);
    }

    this.trackedProcesses.set(pid, {
      pid,
      name,
      startTime: new Date(),
    });

    console.log(`[ProcessTracker] Now tracking process ${pid} (${name}). Total: ${this.trackedProcesses.size}`);
  }

  /**
   * Stop tracking a process (e.g., when it exits normally)
   * @param pid - Process ID to untrack
   */
  untrackProcess(pid: number): void {
    const info = this.trackedProcesses.get(pid);
    if (info) {
      this.trackedProcesses.delete(pid);
      console.log(`[ProcessTracker] Untracked process ${pid} (${info.name}). Remaining: ${this.trackedProcesses.size}`);
    }
  }

  /**
   * Check if a process is being tracked
   * @param pid - Process ID to check
   */
  isTracked(pid: number): boolean {
    return this.trackedProcesses.has(pid);
  }

  /**
   * Get the number of tracked processes
   */
  getTrackedCount(): number {
    return this.trackedProcesses.size;
  }

  /**
   * Get all tracked PIDs
   */
  getTrackedPids(): number[] {
    return Array.from(this.trackedProcesses.keys());
  }

  /**
   * Get information about a tracked process
   * @param pid - Process ID
   */
  getProcessInfo(pid: number): ProcessInfo | undefined {
    return this.trackedProcesses.get(pid);
  }

  /**
   * Kill a specific tracked process
   * @param pid - Process ID to kill
   * @param signal - Signal to send (default: SIGTERM)
   * @returns true if process was tracked and kill was attempted
   */
  killProcess(pid: number, signal: KillSignal = 'SIGTERM'): boolean {
    const info = this.trackedProcesses.get(pid);
    if (!info) {
      return false;
    }

    try {
      process.kill(pid, signal);
      console.log(`[ProcessTracker] Sent ${signal} to process ${pid} (${info.name})`);
    } catch (error) {
      // Process may have already exited
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ESRCH') {
        console.log(`[ProcessTracker] Process ${pid} (${info.name}) already exited`);
      } else {
        console.error(`[ProcessTracker] Failed to kill process ${pid}:`, error);
      }
    }

    // Always untrack after kill attempt
    this.trackedProcesses.delete(pid);
    return true;
  }

  /**
   * Kill all tracked processes
   * Should be called on app quit to prevent zombie processes
   * @param signal - Signal to send (default: SIGTERM)
   */
  killAllTrackedProcesses(signal: KillSignal = 'SIGTERM'): void {
    const count = this.trackedProcesses.size;
    if (count === 0) {
      console.log('[ProcessTracker] No tracked processes to kill');
      return;
    }

    console.log(`[ProcessTracker] Killing ${count} tracked processes with ${signal}`);

    // Create a copy of entries to avoid modification during iteration
    const entries = Array.from(this.trackedProcesses.entries());

    for (const [pid, info] of entries) {
      try {
        process.kill(pid, signal);
        console.log(`[ProcessTracker] Sent ${signal} to process ${pid} (${info.name})`);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ESRCH') {
          console.log(`[ProcessTracker] Process ${pid} (${info.name}) already exited`);
        } else {
          console.error(`[ProcessTracker] Failed to kill process ${pid}:`, error);
        }
      }
    }

    // Clear all tracked processes
    this.trackedProcesses.clear();
    console.log('[ProcessTracker] All tracked processes cleared');
  }

  /**
   * Forcefully kill all tracked processes (SIGKILL)
   * Use when graceful shutdown fails
   */
  forceKillAll(): void {
    this.killAllTrackedProcesses('SIGKILL');
  }
}

// Singleton instance
let processTrackerInstance: ProcessTracker | null = null;

/**
 * Get the global ProcessTracker instance
 */
export function getProcessTracker(): ProcessTracker {
  if (!processTrackerInstance) {
    processTrackerInstance = new ProcessTracker();
  }
  return processTrackerInstance;
}

/**
 * Dispose the global ProcessTracker instance
 * Kills all tracked processes and clears the singleton
 * Should be called on app quit
 */
export function disposeProcessTracker(): void {
  if (processTrackerInstance) {
    processTrackerInstance.killAllTrackedProcesses();
    processTrackerInstance = null;
    console.log('[ProcessTracker] Disposed');
  }
}
