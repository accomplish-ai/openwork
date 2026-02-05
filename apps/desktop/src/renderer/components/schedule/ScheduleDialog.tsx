// apps/desktop/src/renderer/components/schedule/ScheduleDialog.tsx

import { useState, useCallback, useMemo, useEffect } from 'react';
import { CalendarClock, LayoutGrid } from 'lucide-react';
import type { ScheduleType, CronBuilderState, ScheduledTask, ScheduleTemplate } from '@accomplish/shared';
import { DEFAULT_CRON_BUILDER_STATE, builderToCron, cronToBuilder } from '@accomplish/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScheduleTypeSelector } from './ScheduleTypeSelector';
import { OneTimeScheduler } from './OneTimeScheduler';
import { TimezoneSelector, getLocalTimezone } from './TimezoneSelector';
import { CronBuilder } from './CronBuilder';
import { TemplateGallery } from './TemplateGallery';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPrompt?: string;
  initialTemplate?: ScheduleTemplate | null;
  editingSchedule?: ScheduledTask | null;
  onSubmit: (config: {
    prompt: string;
    scheduleType: ScheduleType;
    scheduledAt?: string;
    cronExpression?: string;
    timezone: string;
  }) => Promise<void>;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  defaultPrompt = '',
  initialTemplate,
  editingSchedule,
  onSubmit,
}: ScheduleDialogProps) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>('one-time');
  const [scheduledAt, setScheduledAt] = useState<string | undefined>();
  const [cronState, setCronState] = useState<CronBuilderState>(DEFAULT_CRON_BUILDER_STATE);
  const [timezone, setTimezone] = useState(getLocalTimezone());
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Handle template selection from the gallery
  const handleSelectTemplate = useCallback((template: ScheduleTemplate) => {
    setPrompt(template.prompt);
    setScheduleType('recurring');
    // Parse the suggested cron expression into the builder state
    const parsed = cronToBuilder(template.suggestedCron);
    setCronState(parsed ?? DEFAULT_CRON_BUILDER_STATE);
    setError(null);
  }, []);

  // Reset form when dialog opens/closes or when editing schedule changes
  useEffect(() => {
    if (open) {
      if (editingSchedule) {
        setPrompt(editingSchedule.prompt);
        setScheduleType(editingSchedule.scheduleType);
        setTimezone(editingSchedule.timezone);
        if (editingSchedule.scheduledAt) {
          setScheduledAt(editingSchedule.scheduledAt);
        }
        if (editingSchedule.cronExpression) {
          const parsed = cronToBuilder(editingSchedule.cronExpression);
          if (parsed) {
            setCronState(parsed);
          }
        }
        setShowTemplates(false);
      } else if (initialTemplate) {
        // Initialize from template (recurring by default)
        setPrompt(initialTemplate.prompt);
        setScheduleType('recurring');
        setScheduledAt(undefined);
        const parsed = cronToBuilder(initialTemplate.suggestedCron);
        setCronState(parsed ?? DEFAULT_CRON_BUILDER_STATE);
        setTimezone(getLocalTimezone());
        setShowTemplates(false);
      } else {
        setPrompt(defaultPrompt);
        setScheduleType('one-time');
        setScheduledAt(undefined);
        setCronState(DEFAULT_CRON_BUILDER_STATE);
        setTimezone(getLocalTimezone());
        setShowTemplates(false);
      }
      setError(null);
    }
  }, [open, defaultPrompt, editingSchedule, initialTemplate]);

  // Validate the schedule
  const validation = useMemo(() => {
    if (!prompt.trim()) {
      return { valid: false, error: 'Please enter a task prompt' };
    }

    if (scheduleType === 'one-time') {
      if (!scheduledAt) {
        return { valid: false, error: 'Please select a date and time' };
      }
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return { valid: false, error: 'Schedule time must be in the future' };
      }
    }

    return { valid: true, error: null };
  }, [prompt, scheduleType, scheduledAt]);

  const handleSubmit = useCallback(async () => {
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        prompt: prompt.trim(),
        scheduleType,
        scheduledAt: scheduleType === 'one-time' ? scheduledAt : undefined,
        cronExpression: scheduleType === 'recurring' ? builderToCron(cronState) : undefined,
        timezone,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, scheduleType, scheduledAt, cronState, timezone, validation, onSubmit, onOpenChange]);

  const isEditing = !!editingSchedule;
  let submitButtonText = 'Schedule';
  if (isEditing) {
    submitButtonText = 'Save Changes';
  }
  if (isSubmitting) {
    submitButtonText = 'Saving...';
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            {isEditing ? 'Edit Schedule' : 'Schedule Task'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modify your scheduled task'
              : 'Schedule this task to run later or on a recurring basis'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Task prompt (shown if creating new or editing) */}
          {!defaultPrompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Task</label>
                {!isEditing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTemplates(true)}
                    className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Browse Templates
                  </Button>
                )}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What would you like to accomplish?"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
              />
            </div>
          )}

          {/* Show the prompt as read-only if provided */}
          {defaultPrompt && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Task</label>
              <div className="p-3 rounded-md bg-muted text-sm text-muted-foreground line-clamp-3">
                {prompt}
              </div>
            </div>
          )}

          <ScheduleTypeSelector value={scheduleType} onChange={setScheduleType} />

          {scheduleType === 'one-time' ? (
            <OneTimeScheduler value={scheduledAt} onChange={setScheduledAt} />
          ) : (
            <CronBuilder value={cronState} onChange={setCronState} timezone={timezone} />
          )}

          <TimezoneSelector value={timezone} onChange={setTimezone} />

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !validation.valid}>
            {submitButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Template Gallery Modal */}
      <TemplateGallery
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelectTemplate={handleSelectTemplate}
      />
    </Dialog>
  );
}
