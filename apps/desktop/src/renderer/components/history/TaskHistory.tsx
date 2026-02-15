import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTaskStore } from '../../stores/taskStore';
import type { Task } from '@accomplish_ai/agent-core/common';

interface TaskHistoryProps {
  limit?: number;
  showTitle?: boolean;
}

export default function TaskHistory({ limit, showTitle = true }: TaskHistoryProps) {
  const { tasks, loadTasks, deleteTask, clearHistory, toggleTaskFavorite } = useTaskStore();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const displayedTasks = limit ? tasks.slice(0, limit) : tasks;

  if (displayedTasks.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-text-muted">No tasks yet. Start by describing what you want to accomplish.</p>
      </div>
    );
  }

  return (
    <div>
      {showTitle && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-text">Recent Tasks</h2>
          {tasks.length > 0 && !limit && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear all task history?')) {
                  clearHistory();
                }
              }}
              className="text-sm text-text-muted hover:text-danger transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {displayedTasks.map((task) => (
          <TaskHistoryItem
            key={task.id}
            task={task}
            onDelete={() => deleteTask(task.id)}
            onToggleFavorite={() => toggleTaskFavorite(task.id)}
          />
        ))}
      </div>

      {limit && tasks.length > limit && (
        <Link
          to="/history"
          className="block mt-4 text-center text-sm text-text-muted hover:text-text transition-colors"
        >
          View all {tasks.length} tasks
        </Link>
      )}
    </div>
  );
}

function TaskHistoryItem({
  task,
  onDelete,
  onToggleFavorite,
}: {
  task: Task;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    completed: { color: 'bg-success', label: 'Completed' },
    running: { color: 'bg-primary', label: 'Running' },
    failed: { color: 'bg-danger', label: 'Failed' },
    cancelled: { color: 'bg-text-muted', label: 'Cancelled' },
    pending: { color: 'bg-warning', label: 'Pending' },
    waiting_permission: { color: 'bg-warning', label: 'Waiting' },
  };

  const config = statusConfig[task.status] || statusConfig.pending;
  const timeAgo = getTimeAgo(task.createdAt);

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
          {config.label} · {timeAgo} · {task.messages.length} messages
        </p>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`p-2 transition-colors ${
          task.favorite
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-text-muted hover:text-yellow-500'
        }`}
        title={task.favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg className="h-4 w-4" fill={task.favorite ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
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
        className="p-2 text-text-muted hover:text-danger transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </Link>
  );
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
