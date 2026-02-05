// apps/desktop/src/renderer/pages/Scheduled.tsx

import { useEffect, useState, useCallback } from 'react';
import { CalendarClock, Plus, LayoutGrid } from 'lucide-react';
import type { ScheduledTask, ScheduleTemplate } from '@accomplish/shared';
import { cronToBuilder, DEFAULT_CRON_BUILDER_STATE } from '@accomplish/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleCard, ScheduleDialog, TemplateGallery } from '@/components/schedule';
import { useScheduleStore } from '@/stores/scheduleStore';

export default function ScheduledPage() {
  const { schedules, isLoading, error, loadSchedules, deleteSchedule, toggleSchedule, runScheduleNow, createSchedule, updateSchedule } =
    useScheduleStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledTask | null>(null);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ScheduleTemplate | null>(null);

  // Handle template selection from the gallery
  const handleSelectTemplate = useCallback((template: ScheduleTemplate) => {
    setSelectedTemplate(template);
    setShowCreateDialog(true);
  }, []);

  // Load schedules on mount
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleCreateSchedule = async (config: Parameters<typeof createSchedule>[0]) => {
    await createSchedule(config);
    setSelectedTemplate(null);
  };

  // Handle dialog close to clear selected template
  const handleCreateDialogChange = (open: boolean) => {
    setShowCreateDialog(open);
    if (!open) {
      setSelectedTemplate(null);
    }
  };

  const handleEditSchedule = async (config: Parameters<typeof createSchedule>[0]) => {
    if (!editingSchedule) return;
    await updateSchedule(editingSchedule.id, config);
    setEditingSchedule(null);
  };

  const handleRunNow = async (schedule: ScheduledTask) => {
    try {
      await runScheduleNow(schedule.id);
    } catch (err) {
      console.error('Failed to run schedule:', err);
    }
  };

  const handleToggle = async (schedule: ScheduledTask, enabled: boolean) => {
    try {
      await toggleSchedule(schedule.id, enabled);
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  const handleDelete = async (schedule: ScheduledTask) => {
    try {
      await deleteSchedule(schedule.id);
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  // Separate active and inactive schedules
  const activeSchedules = schedules.filter((s) => s.status === 'active');
  const completedSchedules = schedules.filter((s) => s.status === 'completed' || s.status === 'cancelled');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Scheduled Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {activeSchedules.length} active schedule{activeSchedules.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowTemplateGallery(true)}>
            <LayoutGrid className="h-4 w-4 mr-2" />
            Templates
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && schedules.length === 0 ? (
          // Loading skeleton
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          // Error state
          <div className="text-center py-12">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => loadSchedules()} className="mt-4">
              Retry
            </Button>
          </div>
        ) : schedules.length === 0 ? (
          // Empty state
          <div className="text-center py-12">
            <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No scheduled tasks</h2>
            <p className="text-muted-foreground mb-6">
              Schedule tasks to run at specific times or on a recurring basis
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setShowTemplateGallery(true)}>
                <LayoutGrid className="h-4 w-4 mr-2" />
                Browse Templates
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create from scratch
              </Button>
            </div>
          </div>
        ) : (
          // Schedule list
          <div className="space-y-6">
            {/* Active schedules */}
            {activeSchedules.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Active
                </h2>
                <div className="space-y-2">
                  {activeSchedules.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      onRunNow={() => handleRunNow(schedule)}
                      onToggle={(enabled) => handleToggle(schedule, enabled)}
                      onEdit={() => setEditingSchedule(schedule)}
                      onDelete={() => handleDelete(schedule)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed/cancelled schedules */}
            {completedSchedules.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Completed
                </h2>
                <div className="space-y-2">
                  {completedSchedules.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      onRunNow={() => handleRunNow(schedule)}
                      onToggle={(enabled) => handleToggle(schedule, enabled)}
                      onEdit={() => setEditingSchedule(schedule)}
                      onDelete={() => handleDelete(schedule)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <ScheduleDialog
        open={showCreateDialog}
        onOpenChange={handleCreateDialogChange}
        initialTemplate={selectedTemplate}
        onSubmit={handleCreateSchedule}
      />

      {/* Edit dialog */}
      <ScheduleDialog
        open={!!editingSchedule}
        onOpenChange={(open) => !open && setEditingSchedule(null)}
        editingSchedule={editingSchedule}
        onSubmit={handleEditSchedule}
      />

      {/* Template gallery */}
      <TemplateGallery
        open={showTemplateGallery}
        onOpenChange={setShowTemplateGallery}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
