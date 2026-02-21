import { useEffect } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../../stores/taskStore';
import type { Task } from '@accomplish_ai/agent-core/common';

interface TaskHistoryProps {
  limit?: number;
  showTitle?: boolean;
}

export default function TaskHistory({ limit, showTitle = true }: TaskHistoryProps) {
  const { tasks, loadTasks, deleteTask, clearHistory } = useTaskStore();
  const { t } = useTranslation('history');
  const { t: tCommon } = useTranslation('common');

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const displayedTasks = limit ? tasks.slice(0, limit) : tasks;

  if (displayedTasks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted">{t('noTasks')}</p>
      </div>
    );
  }

  return (
    <div>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text">{t('recentTasks')}</h2>
          {tasks.length > 0 && !limit && (
            <button
              onClick={() => {
                if (confirm(t('confirmClear'))) {
                  clearHistory();
                }
              }}
              className="text-sm text-text-muted hover:text-danger transition-colors"
            >
              {tCommon('buttons.clearAll')}
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {displayedTasks.map((task) => (
          <TaskHistoryItem key={task.id} task={task} onDelete={() => deleteTask(task.id)} />
        ))}
      </div>

      {limit && tasks.length > limit && (
        <Link
          to="/history"
          className="block mt-4 text-center text-sm text-text-muted hover:text-text transition-colors"
        >
          {t('viewAll', { count: tasks.length })}
        </Link>
      )}
    </div>
  );
}

function TaskHistoryItem({ task, onDelete }: { task: Task; onDelete: () => void }) {
  const { toggleTaskFavorite } = useTaskStore();
  const statusConfig: Record<string, { color: string; label: string }> = {
    completed: { color: 'bg-success', label: 'Completed' },
    running: { color: 'bg-primary', label: 'Running' },
    failed: { color: 'bg-danger', label: 'Failed' },
    cancelled: { color: 'bg-text-muted', label: 'Cancelled' },
    pending: { color: 'bg-warning', label: 'Pending' },
    waiting_permission: { color: 'bg-warning', label: 'Waiting' },
  };

  const config = statusConfig[task.status] || statusConfig.pending;
  const timeAgo = getTimeAgo(task.createdAt, tCommon);

  return (
    <Link
      to={`/execution/${task.id}`}
      className="flex items-center gap-4 p-4 rounded-card border border-border bg-background-card hover:shadow-card-hover transition-all"
    >
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate" title={task.summary || task.prompt}>
          {task.summary || task.prompt}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {tCommon(config.labelKey)} · {timeAgo} ·{' '}
          {tCommon('messages', { count: task.messages.length })}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTaskFavorite(task.id, !task.isFavorite);
          }}
          className={`p-1 hover:bg-slate-200 rounded ${task.isFavorite ? 'text-yellow-400' : 'text-slate-300'}`}
          title={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={task.isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Delete this task?')) {
              onDelete();
            }
          }}
          className="p-1 text-text-muted hover:text-danger transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </Link>
  );
}

function getTimeAgo(
  dateString: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  return t('time.daysAgo', { count: diffDays });
}
