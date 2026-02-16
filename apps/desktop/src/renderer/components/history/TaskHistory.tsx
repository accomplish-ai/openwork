import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTaskStore } from '../../stores/taskStore';
import type { Task } from '@accomplish_ai/agent-core/common';
import { Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
        <Star className={cn("h-4 w-4", task.favorite && "fill-current")} />
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
        <Trash2 className="h-4 w-4" />
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
