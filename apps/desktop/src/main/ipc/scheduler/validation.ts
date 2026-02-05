// apps/desktop/src/main/ipc/scheduler/validation.ts

import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';
import type { ScheduledTask } from '@accomplish/shared';

function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeCronExpression(expression: string): string {
  return expression.trim().replace(/\s+/g, ' ');
}

function normalizeIsoDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid datetime');
  }
  return date.toISOString();
}

const timezoneSchema = z
  .string()
  .trim()
  .min(1, 'Timezone is required')
  .refine(isValidIanaTimezone, {
    message: 'Invalid timezone. Must be a valid IANA timezone (e.g., "America/New_York").',
  });

const cronExpressionSchema = z
  .string()
  .transform((val) => normalizeCronExpression(val))
  .refine((val) => val.split(/\s+/).length === 5, {
    message: 'Invalid cron expression. Must be 5 space-separated fields.',
  });

function validateCronExpression(cronExpression: string, timezone: string): boolean {
  try {
    const cron = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    });
    // Ensure at least one valid next occurrence exists
    cron.next();
    return true;
  } catch {
    return false;
  }
}

/**
 * Schema for creating a new scheduled task
 */
export const createScheduleSchema = z
  .object({
    prompt: z.string().trim().min(1, 'Prompt is required').max(8000, 'Prompt too long'),
    scheduleType: z.enum(['one-time', 'recurring']),
    scheduledAt: z.string().datetime().transform(normalizeIsoDateTime).optional(),
    cronExpression: cronExpressionSchema.optional(),
    timezone: timezoneSchema,
  })
  .superRefine((data, ctx) => {
    if (data.scheduleType === 'one-time') {
      if (!data.scheduledAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scheduledAt'],
          message: 'One-time schedules require scheduledAt',
        });
      }
      return;
    }

    // recurring
    if (!data.cronExpression) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cronExpression'],
        message: 'Recurring schedules require cronExpression',
      });
      return;
    }

    // Validate cron against cron-parser with timezone for real-world correctness
    if (!validateCronExpression(data.cronExpression, data.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cronExpression'],
        message: 'Invalid cron expression for the selected timezone',
      });
    }
  });

/**
 * Schema for updating a scheduled task
 */
export const updateScheduleSchema = z.object({
  prompt: z.string().trim().min(1).max(8000).optional(),
  scheduleType: z.enum(['one-time', 'recurring']).optional(),
  scheduledAt: z.string().datetime().transform(normalizeIsoDateTime).optional(),
  cronExpression: cronExpressionSchema.optional(),
  timezone: timezoneSchema.optional(),
  status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Validate and parse create schedule config
 */
export function validateCreateSchedule(config: unknown) {
  const result = createScheduleSchema.safeParse(config);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid schedule config: ${message}`);
  }
  return result.data;
}

/**
 * Validate and parse update schedule config
 */
export function validateUpdateSchedule(existing: ScheduledTask, updates: unknown) {
  const result = updateScheduleSchema.safeParse(updates);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid schedule updates: ${message}`);
  }

  const parsedUpdates = result.data;

  // Validate the merged state to prevent DB CHECK constraint violations
  const merged = {
    prompt: parsedUpdates.prompt ?? existing.prompt,
    scheduleType: parsedUpdates.scheduleType ?? existing.scheduleType,
    scheduledAt: parsedUpdates.scheduledAt ?? existing.scheduledAt,
    cronExpression: parsedUpdates.cronExpression ?? existing.cronExpression,
    timezone: parsedUpdates.timezone ?? existing.timezone,
  };

  const mergedResult = createScheduleSchema.safeParse(merged);
  if (!mergedResult.success) {
    const message = mergedResult.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid schedule updates: ${message}`);
  }

  return parsedUpdates;
}
