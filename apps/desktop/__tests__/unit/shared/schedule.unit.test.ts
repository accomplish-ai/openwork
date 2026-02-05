/**
 * Unit tests for schedule types and utility functions
 *
 * Tests the pure functions in packages/shared/src/types/schedule.ts:
 * - builderToCron: Convert CronBuilderState to cron expression
 * - cronToBuilder: Parse cron expression to CronBuilderState
 * - cronToHumanReadable: Format cron for display
 *
 * @module __tests__/unit/shared/schedule.unit.test
 */

import { describe, it, expect } from 'vitest';
import {
  builderToCron,
  cronToBuilder,
  cronToHumanReadable,
  DEFAULT_CRON_BUILDER_STATE,
  type CronBuilderState,
} from '@accomplish/shared';

describe('Schedule Types', () => {
  describe('builderToCron()', () => {
    describe('hourly frequency', () => {
      it('should convert hourly at specific minute', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          minute: 30,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('30 * * * *');
      });

      it('should convert hourly at minute 0', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          minute: 0,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 * * * *');
      });

      it('should convert hourly with step minutes', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          minute: 0,
          stepMinutes: 15,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('*/15 * * * *');
      });

      it('should convert hourly with step minutes 30', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          stepMinutes: 30,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('*/30 * * * *');
      });

      it('should ignore stepMinutes of 0', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          minute: 15,
          stepMinutes: 0,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('15 * * * *');
      });

      it('should ignore stepMinutes >= 60', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'hourly',
          minute: 15,
          stepMinutes: 60,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('15 * * * *');
      });
    });

    describe('daily frequency', () => {
      it('should convert daily at 9:00 AM', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'daily',
          hour: 9,
          minute: 0,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 * * *');
      });

      it('should convert daily at 2:30 PM', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'daily',
          hour: 14,
          minute: 30,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('30 14 * * *');
      });

      it('should convert daily at midnight', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'daily',
          hour: 0,
          minute: 0,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 0 * * *');
      });
    });

    describe('weekly frequency', () => {
      it('should convert weekdays (Mon-Fri) at 9 AM', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'weekly',
          hour: 9,
          minute: 0,
          daysOfWeek: [1, 2, 3, 4, 5],
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 * * 1,2,3,4,5');
      });

      it('should convert weekend (Sat-Sun)', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'weekly',
          hour: 10,
          minute: 0,
          daysOfWeek: [0, 6],
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 10 * * 0,6');
      });

      it('should convert single day (Monday)', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'weekly',
          hour: 9,
          minute: 0,
          daysOfWeek: [1],
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 * * 1');
      });

      it('should default to daily when no days selected', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'weekly',
          hour: 9,
          minute: 0,
          daysOfWeek: [],
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 * * *');
      });

      it('should sort days in ascending order', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'weekly',
          hour: 9,
          minute: 0,
          daysOfWeek: [5, 1, 3], // Unordered
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 * * 1,3,5');
      });
    });

    describe('monthly frequency', () => {
      it('should convert monthly on day 1 at 9 AM', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'monthly',
          hour: 9,
          minute: 0,
          dayOfMonth: 1,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 9 1 * *');
      });

      it('should convert monthly on day 15 at 2:30 PM', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'monthly',
          hour: 14,
          minute: 30,
          dayOfMonth: 15,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('30 14 15 * *');
      });

      it('should convert monthly on day 31', () => {
        // Arrange
        const state: CronBuilderState = {
          ...DEFAULT_CRON_BUILDER_STATE,
          frequency: 'monthly',
          hour: 0,
          minute: 0,
          dayOfMonth: 31,
        };

        // Act
        const result = builderToCron(state);

        // Assert
        expect(result).toBe('0 0 31 * *');
      });
    });

  });

  describe('cronToBuilder()', () => {
    describe('hourly patterns', () => {
      it('should parse "30 * * * *" as hourly', () => {
        // Arrange
        const cron = '30 * * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('hourly');
        expect(result!.minute).toBe(30);
      });

      it('should parse "0 * * * *" as hourly at :00', () => {
        // Arrange
        const cron = '0 * * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('hourly');
        expect(result!.minute).toBe(0);
      });

      it('should parse "*/15 * * * *" as hourly with stepMinutes', () => {
        // Arrange
        const cron = '*/15 * * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('hourly');
        expect(result!.stepMinutes).toBe(15);
      });

      it('should parse "*/30 * * * *" as hourly with stepMinutes', () => {
        // Arrange
        const cron = '*/30 * * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('hourly');
        expect(result!.stepMinutes).toBe(30);
      });
    });

    describe('daily patterns', () => {
      it('should parse "0 9 * * *" as daily', () => {
        // Arrange
        const cron = '0 9 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('daily');
        expect(result!.hour).toBe(9);
        expect(result!.minute).toBe(0);
      });

      it('should parse "30 14 * * *" as daily', () => {
        // Arrange
        const cron = '30 14 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('daily');
        expect(result!.hour).toBe(14);
        expect(result!.minute).toBe(30);
      });

      it('should parse "0 0 * * *" as daily at midnight', () => {
        // Arrange
        const cron = '0 0 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('daily');
        expect(result!.hour).toBe(0);
        expect(result!.minute).toBe(0);
      });
    });

    describe('weekly patterns', () => {
      it('should parse "0 9 * * 1,2,3,4,5" as weekly (weekdays)', () => {
        // Arrange
        const cron = '0 9 * * 1,2,3,4,5';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('weekly');
        expect(result!.hour).toBe(9);
        expect(result!.minute).toBe(0);
        expect(result!.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
      });

      it('should parse "0 9 * * 1-5" as weekly (range)', () => {
        // Arrange
        const cron = '0 9 * * 1-5';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('weekly');
        expect(result!.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
      });

      it('should parse "0 10 * * 0,6" as weekly (weekend)', () => {
        // Arrange
        const cron = '0 10 * * 0,6';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('weekly');
        expect(result!.daysOfWeek).toEqual([0, 6]);
      });

      it('should parse "0 9 * * 3" as weekly (single day)', () => {
        // Arrange
        const cron = '0 9 * * 3';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('weekly');
        expect(result!.daysOfWeek).toEqual([3]);
      });
    });

    describe('monthly patterns', () => {
      it('should parse "0 9 1 * *" as monthly', () => {
        // Arrange
        const cron = '0 9 1 * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('monthly');
        expect(result!.hour).toBe(9);
        expect(result!.minute).toBe(0);
        expect(result!.dayOfMonth).toBe(1);
      });

      it('should parse "30 14 15 * *" as monthly', () => {
        // Arrange
        const cron = '30 14 15 * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('monthly');
        expect(result!.hour).toBe(14);
        expect(result!.minute).toBe(30);
        expect(result!.dayOfMonth).toBe(15);
      });
    });

    describe('invalid patterns', () => {
      it('should return null for unsupported hour step pattern', () => {
        // Arrange
        const cron = '0 */6 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for wrong field count (4 fields)', () => {
        // Arrange
        const cron = '0 9 * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for wrong field count (6 fields)', () => {
        // Arrange
        const cron = '0 9 * * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid minute (60)', () => {
        // Arrange
        const cron = '60 9 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid minute (-1)', () => {
        // Arrange
        const cron = '-1 9 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid hour (24)', () => {
        // Arrange
        const cron = '0 24 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid hour (-1)', () => {
        // Arrange
        const cron = '0 -1 * * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for month restriction (not *)', () => {
        // Arrange
        const cron = '0 9 * 6 *'; // June only - not supported by builder

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid day of week (7)', () => {
        // Arrange
        const cron = '0 9 * * 7';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid day range (1-8)', () => {
        // Arrange
        const cron = '0 9 * * 1-8';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid day of month (0)', () => {
        // Arrange
        const cron = '0 9 0 * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for invalid day of month (32)', () => {
        // Arrange
        const cron = '0 9 32 * *';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        // Arrange
        const cron = '';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null for random text', () => {
        // Arrange
        const cron = 'abc';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should handle extra whitespace', () => {
        // Arrange
        const cron = '  0   9   *   *   *  ';

        // Act
        const result = cronToBuilder(cron);

        // Assert
        expect(result).not.toBeNull();
        expect(result!.frequency).toBe('daily');
      });
    });
  });

  describe('cronToHumanReadable()', () => {
    describe('hourly patterns', () => {
      it('should format hourly at :30', () => {
        // Arrange
        const cron = '30 * * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Every hour at :30');
      });

      it('should format hourly at :00', () => {
        // Arrange
        const cron = '0 * * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Every hour at :00');
      });

      it('should format step minutes', () => {
        // Arrange
        const cron = '*/15 * * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Every 15 minutes');
      });
    });

    describe('daily patterns', () => {
      it('should format daily at 9:00 AM', () => {
        // Arrange
        const cron = '0 9 * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Daily at 9:00 AM');
      });

      it('should format daily at 2:30 PM', () => {
        // Arrange
        const cron = '30 14 * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Daily at 2:30 PM');
      });

      it('should format daily at 12:00 PM (noon)', () => {
        // Arrange
        const cron = '0 12 * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Daily at 12:00 PM');
      });

      it('should format daily at 12:00 AM (midnight)', () => {
        // Arrange
        const cron = '0 0 * * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Daily at 12:00 AM');
      });
    });

    describe('weekly patterns', () => {
      it('should format weekdays at 9:00 AM', () => {
        // Arrange
        const cron = '0 9 * * 1,2,3,4,5';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Mon, Tue, Wed, Thu, Fri at 9:00 AM');
      });

      it('should format weekend at 2:00 PM', () => {
        // Arrange
        const cron = '0 14 * * 0,6';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Sun, Sat at 2:00 PM');
      });

      it('should format Mon, Wed, Fri', () => {
        // Arrange
        const cron = '0 9 * * 1,3,5';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Mon, Wed, Fri at 9:00 AM');
      });
    });

    describe('monthly patterns', () => {
      it('should format monthly on day 1', () => {
        // Arrange
        const cron = '0 9 1 * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Monthly on day 1 at 9:00 AM');
      });

      it('should format monthly on day 15', () => {
        // Arrange
        const cron = '30 14 15 * *';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe('Monthly on day 15 at 2:30 PM');
      });
    });

    describe('invalid patterns', () => {
      it('should return raw cron for unparseable expressions', () => {
        // Arrange
        const cron = '0 9 * 6 *'; // Month restriction - not supported

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe(cron);
      });

      it('should return raw cron for invalid expressions', () => {
        // Arrange
        const cron = 'invalid cron';

        // Act
        const result = cronToHumanReadable(cron);

        // Assert
        expect(result).toBe(cron);
      });
    });
  });

  describe('roundtrip conversion', () => {
    it('should roundtrip hourly pattern', () => {
      // Arrange
      const original: CronBuilderState = {
        ...DEFAULT_CRON_BUILDER_STATE,
        frequency: 'hourly',
        minute: 30,
      };

      // Act
      const cron = builderToCron(original);
      const parsed = cronToBuilder(cron);

      // Assert
      expect(parsed).not.toBeNull();
      expect(parsed!.frequency).toBe('hourly');
      expect(parsed!.minute).toBe(30);
    });

    it('should roundtrip daily pattern', () => {
      // Arrange
      const original: CronBuilderState = {
        ...DEFAULT_CRON_BUILDER_STATE,
        frequency: 'daily',
        hour: 14,
        minute: 30,
      };

      // Act
      const cron = builderToCron(original);
      const parsed = cronToBuilder(cron);

      // Assert
      expect(parsed).not.toBeNull();
      expect(parsed!.frequency).toBe('daily');
      expect(parsed!.hour).toBe(14);
      expect(parsed!.minute).toBe(30);
    });

    it('should roundtrip weekly pattern', () => {
      // Arrange
      const original: CronBuilderState = {
        ...DEFAULT_CRON_BUILDER_STATE,
        frequency: 'weekly',
        hour: 9,
        minute: 0,
        daysOfWeek: [1, 3, 5],
      };

      // Act
      const cron = builderToCron(original);
      const parsed = cronToBuilder(cron);

      // Assert
      expect(parsed).not.toBeNull();
      expect(parsed!.frequency).toBe('weekly');
      expect(parsed!.daysOfWeek).toEqual([1, 3, 5]);
    });

    it('should roundtrip monthly pattern', () => {
      // Arrange
      const original: CronBuilderState = {
        ...DEFAULT_CRON_BUILDER_STATE,
        frequency: 'monthly',
        hour: 10,
        minute: 15,
        dayOfMonth: 15,
      };

      // Act
      const cron = builderToCron(original);
      const parsed = cronToBuilder(cron);

      // Assert
      expect(parsed).not.toBeNull();
      expect(parsed!.frequency).toBe('monthly');
      expect(parsed!.dayOfMonth).toBe(15);
    });
  });
});
