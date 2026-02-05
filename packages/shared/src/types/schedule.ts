/**
 * Task Scheduling Types
 * Supports one-time and recurring (cron-based) task scheduling
 */

export type ScheduleType = 'one-time' | 'recurring';
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'cancelled';

/**
 * A scheduled task configuration stored in the database
 */
export interface ScheduledTask {
  id: string;
  prompt: string;
  scheduleType: ScheduleType;

  /** ISO timestamp for one-time schedules */
  scheduledAt?: string;

  /**
   * Standard 5-field cron expression for recurring schedules.
   * Format: minute hour day-of-month month day-of-week
   *
   * @example "0 9 * * 1-5" - weekdays at 9am
   * @example "0 0 1 * *" - first of month at midnight
   */
  cronExpression?: string;

  /** IANA timezone (e.g., 'America/New_York', 'Europe/London') */
  timezone: string;

  /** Computed next execution time (ISO timestamp) */
  nextRunAt?: string;

  /** Last execution time (ISO timestamp) */
  lastRunAt?: string;

  /** ID of the last task created from this schedule */
  lastTaskId?: string;

  /** Schedule status */
  status: ScheduleStatus;

  /** Whether the schedule is enabled (can be toggled without changing status) */
  enabled: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Configuration for creating a new scheduled task
 */
export interface CreateScheduleConfig {
  prompt: string;
  scheduleType: ScheduleType;
  scheduledAt?: string;
  cronExpression?: string;
  timezone: string;
}

/**
 * Configuration for updating a scheduled task
 */
export interface UpdateScheduleConfig {
  prompt?: string;
  scheduleType?: ScheduleType;
  scheduledAt?: string;
  cronExpression?: string;
  timezone?: string;
  status?: ScheduleStatus;
  enabled?: boolean;
}

/**
 * Frequency options for the friendly cron builder UI
 */
export type CronFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

/**
 * State for the friendly cron builder UI
 * Used to build cron expressions visually
 */
export interface CronBuilderState {
  frequency: CronFrequency;
  /** Minutes (0-59) */
  minute: number;
  /** Hour (0-23) for daily, weekly, monthly frequencies */
  hour: number;
  /** Days of week (0=Sunday, 1=Monday, ..., 6=Saturday) for weekly frequency */
  daysOfWeek: number[];
  /** Day of month (1-31) for monthly frequency */
  dayOfMonth: number;
  /** Step interval in minutes for "every X minutes" patterns */
  stepMinutes?: number;
}

/**
 * Default state for a new cron builder
 */
export const DEFAULT_CRON_BUILDER_STATE: CronBuilderState = {
  frequency: 'daily',
  minute: 0,
  hour: 9, // 9 AM
  daysOfWeek: [1, 2, 3, 4, 5], // Weekdays
  dayOfMonth: 1,
};

/**
 * Convert a CronBuilderState to a 5-field cron expression
 */
export function builderToCron(state: CronBuilderState): string {
  const { frequency, minute, hour, daysOfWeek, dayOfMonth, stepMinutes } = state;

  switch (frequency) {
    case 'hourly': {
      // Every hour at specified minute, or every N minutes
      if (stepMinutes && stepMinutes > 0 && stepMinutes < 60) {
        return `*/${stepMinutes} * * * *`;
      }
      return `${minute} * * * *`;
    }

    case 'daily': {
      // Every day at specified time
      return `${minute} ${hour} * * *`;
    }

    case 'weekly': {
      // Specific days of the week at specified time
      if (daysOfWeek.length === 0) {
        // Default to every day if none selected
        return `${minute} ${hour} * * *`;
      }
      const days = [...daysOfWeek].sort((a, b) => a - b).join(',');
      return `${minute} ${hour} * * ${days}`;
    }

    case 'monthly': {
      // Specific day of month at specified time
      return `${minute} ${hour} ${dayOfMonth} * *`;
    }

    default: {
      // Fall back to daily at specified time
      return `${minute} ${hour} * * *`;
    }
  }
}

/**
 * Attempt to parse a cron expression into a CronBuilderState
 * Returns null if the expression is too complex for the builder
 */
export function cronToBuilder(cron: string): CronBuilderState | null {
  const normalizedCron = cron.trim().replace(/\s+/g, ' ');
  const parts = normalizedCron.split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayOfMonthPart, monthPart, dayOfWeekPart] = parts;

  const isSimpleNumber = (value: string): boolean => /^\d+$/.test(value);

  // Check for step pattern in minutes (e.g., */30)
  const stepMatch = minutePart.match(/^\*\/(\d+)$/);
  if (stepMatch && hourPart === '*' && dayOfMonthPart === '*' && monthPart === '*' && dayOfWeekPart === '*') {
    const stepMinutes = parseInt(stepMatch[1], 10);
    if (isNaN(stepMinutes) || stepMinutes <= 0 || stepMinutes >= 60) {
      return null;
    }
    return {
      frequency: 'hourly',
      minute: 0,
      hour: 9,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1,
      stepMinutes,
    };
  }

  // Parse minute and hour (must be simple numbers for builder)
  if (!isSimpleNumber(minutePart)) {
    return null;
  }
  const minute = parseInt(minutePart, 10);
  if (isNaN(minute) || minute < 0 || minute > 59) {
    return null;
  }

  // Hourly pattern: N * * * *
  if (hourPart === '*' && dayOfMonthPart === '*' && monthPart === '*' && dayOfWeekPart === '*') {
    return {
      frequency: 'hourly',
      minute,
      hour: 9,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1,
    };
  }

  if (!isSimpleNumber(hourPart)) {
    return null;
  }
  const hour = parseInt(hourPart, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) {
    return null;
  }

  // Month must be * for builder
  if (monthPart !== '*') {
    return null;
  }

  // Monthly pattern: N N D * *
  if (dayOfMonthPart !== '*' && dayOfWeekPart === '*') {
    if (!isSimpleNumber(dayOfMonthPart)) {
      return null;
    }
    const dayOfMonth = parseInt(dayOfMonthPart, 10);
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return null;
    }
    return {
      frequency: 'monthly',
      minute,
      hour,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth,
    };
  }

  // Daily pattern: N N * * *
  if (dayOfMonthPart === '*' && dayOfWeekPart === '*') {
    return {
      frequency: 'daily',
      minute,
      hour,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1,
    };
  }

  // Weekly pattern: N N * * D,D,D or N N * * D-D
  if (dayOfMonthPart === '*' && dayOfWeekPart !== '*') {
    const daysOfWeek = parseDaysOfWeek(dayOfWeekPart);
    if (daysOfWeek === null) {
      return null;
    }
    return {
      frequency: 'weekly',
      minute,
      hour,
      daysOfWeek,
      dayOfMonth: 1,
    };
  }

  return null;
}

/**
 * Parse day of week cron field into array of day numbers
 * Supports: single numbers, comma-separated, ranges (e.g., "1-5")
 */
function parseDaysOfWeek(part: string): number[] | null {
  const days: Set<number> = new Set();

  const segments = part.split(',');
  for (const segment of segments) {
    const trimmed = segment.trim();

    // Range pattern (e.g., "1-5")
    const rangeMatch = trimmed.match(/^(\d)-(\d)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start < 0 || start > 6 || end < 0 || end > 6 || start > end) {
        return null;
      }
      for (let i = start; i <= end; i++) {
        days.add(i);
      }
      continue;
    }

    // Single number
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0 || num > 6) {
      return null;
    }
    days.add(num);
  }

  return Array.from(days).sort((a, b) => a - b);
}

/**
 * Format a cron expression to human-readable text
 * Note: For full human-readable descriptions, use the cronstrue library
 */
export function cronToHumanReadable(cron: string): string {
  const state = cronToBuilder(cron);
  if (!state) {
    return cron; // Return raw cron if can't parse
  }

  const timeStr = formatTime(state.hour, state.minute);

  switch (state.frequency) {
    case 'hourly':
      if (state.stepMinutes) {
        return `Every ${state.stepMinutes} minutes`;
      }
      return `Every hour at :${state.minute.toString().padStart(2, '0')}`;

    case 'daily':
      return `Daily at ${timeStr}`;

    case 'weekly': {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = state.daysOfWeek.map((d) => dayNames[d]).join(', ');
      return `${days} at ${timeStr}`;
    }

    case 'monthly':
      return `Monthly on day ${state.dayOfMonth} at ${timeStr}`;

    default:
      return cron;
  }
}

function formatTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const m = minute.toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}

/**
 * Template Categories for organizing schedule templates
 */
export type TemplateCategory =
  | 'developer'
  | 'productivity'
  | 'monitoring'
  | 'learning'
  | 'creative'
  | 'maintenance';

/**
 * A schedule template with pre-configured prompt and schedule
 */
export interface ScheduleTemplate {
  /** Unique template identifier */
  id: string;
  /** Display name for the template */
  name: string;
  /** Short description of what the template does */
  description: string;
  /** Category for grouping templates */
  category: TemplateCategory;
  /** Lucide icon name for visual display */
  icon: string;
  /** Pre-written prompt with optional {placeholder} variables */
  prompt: string;
  /** Suggested cron expression for the schedule */
  suggestedCron: string;
  /** Corresponding frequency for the cron builder UI */
  suggestedFrequency: CronFrequency;
  /** Tags for search and filtering */
  tags: string[];
}

/**
 * Category metadata for UI display
 */
export interface TemplateCategoryInfo {
  id: TemplateCategory;
  label: string;
  icon: string;
  description: string;
}

/**
 * All template categories with metadata
 */
export const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
  {
    id: 'developer',
    label: 'Developer',
    icon: 'Code',
    description: 'Code reviews, dependency checks, and development workflows',
  },
  {
    id: 'productivity',
    label: 'Productivity',
    icon: 'Briefcase',
    description: 'Reports, meeting prep, and task management',
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: 'Activity',
    description: 'Health checks, log analysis, and alerts',
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: 'BookOpen',
    description: 'Daily learning, tutorials, and skill building',
  },
  {
    id: 'creative',
    label: 'Creative',
    icon: 'Sparkles',
    description: 'Ideas, inspiration, and creative exploration',
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: 'Wrench',
    description: 'Cleanup, backups, and system upkeep',
  },
];
