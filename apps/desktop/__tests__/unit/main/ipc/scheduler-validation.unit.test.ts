/**
 * Unit tests for scheduler IPC validation
 *
 * Tests the Zod validation schemas in src/main/ipc/scheduler/validation.ts:
 * - createScheduleSchema: Validates new schedule creation
 * - updateScheduleSchema: Validates schedule updates
 *
 * @module __tests__/unit/main/ipc/scheduler-validation.unit.test
 */

import { describe, it, expect } from 'vitest';
import {
  createScheduleSchema,
  updateScheduleSchema,
  validateCreateSchedule,
  validateUpdateSchedule,
} from '../../../../src/main/ipc/scheduler/validation';

describe('Scheduler Validation', () => {
  describe('createScheduleSchema', () => {
    describe('valid one-time schedules', () => {
      it('should accept valid one-time schedule', () => {
        // Arrange
        const config = {
          prompt: 'Test task',
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'America/New_York',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.prompt).toBe('Test task');
          expect(result.data.scheduleType).toBe('one-time');
          expect(result.data.scheduledAt).toBe('2026-03-01T09:00:00.000Z');
          expect(result.data.timezone).toBe('America/New_York');
        }
      });

      it('should accept one-time schedule with long prompt', () => {
        // Arrange
        const config = {
          prompt: 'A'.repeat(8000),
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
      });
    });

    describe('valid recurring schedules', () => {
      it('should accept valid recurring schedule with simple cron', () => {
        // Arrange
        const config = {
          prompt: 'Daily task',
          scheduleType: 'recurring',
          cronExpression: '0 9 * * *',
          timezone: 'Europe/London',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.cronExpression).toBe('0 9 * * *');
        }
      });

      it('should accept recurring schedule with step cron', () => {
        // Arrange
        const config = {
          prompt: 'Every 15 minutes',
          scheduleType: 'recurring',
          cronExpression: '*/15 * * * *',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
      });

      it('should accept recurring schedule with range cron', () => {
        // Arrange
        const config = {
          prompt: 'Weekdays at 9 AM',
          scheduleType: 'recurring',
          cronExpression: '0 9 * * 1-5',
          timezone: 'America/Los_Angeles',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
      });

      it('should accept recurring schedule with list cron', () => {
        // Arrange
        const config = {
          prompt: 'Mon, Wed, Fri',
          scheduleType: 'recurring',
          cronExpression: '0 9 * * 1,3,5',
          timezone: 'Asia/Tokyo',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
      });

      it('should accept recurring schedule with complex day-of-month', () => {
        // Arrange
        const config = {
          prompt: 'On days 1-15',
          scheduleType: 'recurring',
          cronExpression: '0 9 1-15 * *',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(true);
      });
    });

    describe('invalid prompts', () => {
      it('should reject missing prompt', () => {
        // Arrange
        const config = {
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject empty prompt', () => {
        // Arrange
        const config = {
          prompt: '',
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('required');
        }
      });

      it('should reject prompt exceeding max length', () => {
        // Arrange
        const config = {
          prompt: 'A'.repeat(8001),
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('long');
        }
      });
    });

    describe('invalid schedule types', () => {
      it('should reject one-time without scheduledAt', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'one-time',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message).join(' ');
          expect(messages).toContain('scheduledAt');
        }
      });

      it('should reject recurring without cronExpression', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message).join(' ');
          expect(messages).toContain('cronExpression');
        }
      });

      it('should reject invalid schedule type', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'weekly', // Invalid - not 'one-time' or 'recurring'
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });
    });

    describe('invalid cron expressions', () => {
      it('should reject cron with out-of-range minute (60)', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: '60 9 * * *',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject 4-field cron', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: '0 9 * *', // Only 4 fields
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('cron');
        }
      });

      it('should reject 6-field cron', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: '0 0 9 * * *', // 6 fields (with seconds)
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject empty cron expression', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: '',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject cron with invalid characters', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: 'abc * * * *',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });
    });

    describe('invalid scheduledAt', () => {
      it('should reject invalid ISO date format', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01 09:00:00', // Missing T and Z
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject non-date string', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'one-time',
          scheduledAt: 'tomorrow',
          timezone: 'UTC',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });
    });

    describe('invalid timezone', () => {
      it('should reject invalid IANA timezone', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'recurring',
          cronExpression: '0 9 * * *',
          timezone: 'Not/A_Timezone',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });

      it('should reject empty timezone', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
          timezone: '',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('required');
        }
      });

      it('should reject missing timezone', () => {
        // Arrange
        const config = {
          prompt: 'Test',
          scheduleType: 'one-time',
          scheduledAt: '2026-03-01T09:00:00.000Z',
        };

        // Act
        const result = createScheduleSchema.safeParse(config);

        // Assert
        expect(result.success).toBe(false);
      });
    });
  });

  describe('updateScheduleSchema', () => {
    it('should accept partial updates', () => {
      // Arrange
      const updates = {
        prompt: 'Updated task',
      };

      // Act
      const result = updateScheduleSchema.safeParse(updates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe('Updated task');
      }
    });

    it('should accept status update', () => {
      // Arrange
      const updates = {
        status: 'paused',
      };

      // Act
      const result = updateScheduleSchema.safeParse(updates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('paused');
      }
    });

    it('should accept enabled update', () => {
      // Arrange
      const updates = {
        enabled: false,
      };

      // Act
      const result = updateScheduleSchema.safeParse(updates);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
      }
    });

    it('should accept empty object', () => {
      // Arrange
      const updates = {};

      // Act
      const result = updateScheduleSchema.safeParse(updates);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should accept all status values', () => {
      const statuses = ['active', 'paused', 'completed', 'cancelled'];
      for (const status of statuses) {
        const result = updateScheduleSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      // Arrange
      const updates = {
        status: 'stopped',
      };

      // Act
      const result = updateScheduleSchema.safeParse(updates);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('validateCreateSchedule()', () => {
    it('should return validated data for valid config', () => {
      // Arrange
      const config = {
        prompt: 'Test task',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
      };

      // Act
      const result = validateCreateSchedule(config);

      // Assert
      expect(result.prompt).toBe('Test task');
      expect(result.scheduleType).toBe('one-time');
    });

    it('should throw error for invalid config', () => {
      // Arrange
      const config = {
        prompt: '',
        scheduleType: 'one-time',
        scheduledAt: '2026-03-01T09:00:00.000Z',
        timezone: 'UTC',
      };

      // Act & Assert
      expect(() => validateCreateSchedule(config)).toThrow('Invalid schedule config');
    });

    it('should throw with descriptive error message', () => {
      // Arrange
      const config = {
        prompt: 'Test',
        scheduleType: 'one-time',
        // Missing scheduledAt
        timezone: 'UTC',
      };

      // Act & Assert
      expect(() => validateCreateSchedule(config)).toThrow('scheduledAt');
    });
  });

  describe('validateUpdateSchedule()', () => {
    const existingSchedule = {
      id: 'sched_existing',
      prompt: 'Existing task',
      scheduleType: 'one-time' as const,
      scheduledAt: '2026-03-01T09:00:00.000Z',
      timezone: 'UTC',
      nextRunAt: '2026-03-01T09:00:00.000Z',
      status: 'active' as const,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('should return validated data for valid updates', () => {
      // Arrange
      const updates = {
        prompt: 'Updated task',
        enabled: false,
      };

      // Act
      const result = validateUpdateSchedule(existingSchedule, updates);

      // Assert
      expect(result.prompt).toBe('Updated task');
      expect(result.enabled).toBe(false);
    });

    it('should throw error for invalid updates', () => {
      // Arrange
      const updates = {
        status: 'invalid',
      };

      // Act & Assert
      expect(() => validateUpdateSchedule(existingSchedule, updates)).toThrow('Invalid schedule updates');
    });

    it('should reject scheduleType change to one-time without scheduledAt', () => {
      // Arrange
      const recurringExisting = {
        ...existingSchedule,
        scheduleType: 'recurring' as const,
        scheduledAt: undefined,
        cronExpression: '0 9 * * *',
      };

      // Act & Assert
      expect(() => validateUpdateSchedule(recurringExisting, { scheduleType: 'one-time' })).toThrow('scheduledAt');
    });

    it('should reject scheduleType change to recurring without cronExpression', () => {
      // Arrange
      const oneTimeExisting = {
        ...existingSchedule,
        scheduleType: 'one-time' as const,
        scheduledAt: '2026-03-01T09:00:00.000Z',
        cronExpression: undefined,
      };

      // Act & Assert
      expect(() => validateUpdateSchedule(oneTimeExisting, { scheduleType: 'recurring' })).toThrow('cronExpression');
    });
  });
});
