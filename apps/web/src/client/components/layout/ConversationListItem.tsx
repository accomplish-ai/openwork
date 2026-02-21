import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Task } from '@accomplish_ai/agent-core/common';
import { cn } from '@/lib/utils';
import { X, Loader2, Star } from 'lucide-react';
import { useTaskStore } from '@/stores/taskStore';
import { STATUS_COLORS, extractDomains } from '@/lib/task-utils';

interface ConversationListItemProps {
  task: Task;
}

export function ConversationListItem({ task }: ConversationListItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('sidebar');
  const isActive = location.pathname === `/execution/${task.id}`;
  const { deleteTask, toggleTaskFavorite } = useTaskStore();
  const domains = useMemo(() => extractDomains(task), [task]);

  const handleClick = () => {
    navigate(`/execution/${task.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!window.confirm(t('confirmDelete'))) {
      return;
    }

    await deleteTask(task.id);

    if (isActive) {
      navigate('/');
    }
  };

  const statusColor = STATUS_COLORS[task.status] || 'bg-muted-foreground';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={task.summary || task.prompt}
      className={cn(
        'w-full text-left p-2 rounded-lg text-xs font-medium transition-colors duration-200',
        'text-foreground hover:bg-accent hover:text-foreground',
        'flex items-center gap-3 group relative cursor-pointer',
        isActive && 'bg-accent text-foreground',
      )}
    >
      <span className="flex items-center justify-center shrink-0 w-3 h-3">
        {task.status === 'running' || task.status === 'waiting_permission' ? (
          <SpinnerGap className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn('w-2 h-2 rounded-full', statusColor)} />
        )}
      </span>
      <span className="block truncate flex-1 tracking-[0.18px]">{task.summary || task.prompt}</span>
      <span className="relative flex items-center shrink-0 h-5">
        {domains.length > 0 && (
          <span className="flex items-center group-hover:opacity-0 transition-opacity duration-200">
            {domains.map((domain, i) => (
              <span
                key={domain}
                className={cn(
                  'flex items-center p-0.5 rounded-full bg-card shrink-0 relative',
                  i > 0 && '-ml-1',
                  i === 0 && 'z-30',
                  i === 1 && 'z-20',
                  i === 2 && 'z-10',
                )}
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt={domain}
                  className="w-3 h-3 rounded-full"
                  loading="lazy"
                />
              </span>
            ))}
          </span>
        )}
        <div
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            task.isFavorite && 'opacity-100', // Always show if favorite
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTaskFavorite(task.id, !task.isFavorite);
            }}
            title={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            className={cn(
              'p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800',
              task.isFavorite
                ? 'text-yellow-500 hover:text-yellow-600'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300',
            )}
            aria-label={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={cn('h-3 w-3', task.isFavorite && 'fill-current')} />
          </button>

          <button
            onClick={handleDelete}
            title="Remove task"
            className={cn(
              'p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20',
              'text-zinc-400 hover:text-red-600 dark:hover:text-red-400',
            )}
            aria-label="Remove task"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </span>
    </div>
  );
}

export default ConversationListItem;
