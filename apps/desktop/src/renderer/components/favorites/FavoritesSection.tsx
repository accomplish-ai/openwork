import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTaskStore } from '../../stores/taskStore';
import type { Task } from '@accomplish_ai/agent-core/common';
import { StarButton } from '../ui/StarButton';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FavoritesSectionProps {
  maxVisible?: number;
}

export function FavoritesSection({ maxVisible = 3 }: FavoritesSectionProps) {
  const { tasks, toggleFavorite } = useTaskStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const favorites = tasks.filter(task => task.isFavorite === true);

  if (favorites.length === 0) {
    return null;
  }

  const displayedFavorites = isExpanded ? favorites : favorites.slice(0, maxVisible);
  const hasMore = favorites.length > maxVisible;

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'just now';
    }
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    return `${diffDays}d ago`;
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-medium text-text flex items-center gap-2">
          <span>⭐ Favorites</span>
          <span className="text-sm text-text-muted">({favorites.length})</span>
        </h3>
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show {favorites.length - maxVisible} more
              </>
            )}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayedFavorites.map((task) => (
          <FavoriteItem
            key={task.id}
            task={task}
            onToggleFavorite={() => toggleFavorite(task.id)}
            getTimeAgo={getTimeAgo}
          />
        ))}
      </div>

      {hasMore && !isExpanded && (
        <div className="text-center pt-2">
          <button
            onClick={() => setIsExpanded(true)}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            View all {favorites.length} favorites
          </button>
        </div>
      )}
    </div>
  );
}

interface FavoriteItemProps {
  task: Task;
  onToggleFavorite: () => void;
  getTimeAgo: (dateString: string) => string;
}

function FavoriteItem({ task, onToggleFavorite, getTimeAgo }: FavoriteItemProps) {
  const timeAgo = getTimeAgo(task.createdAt);
  const navigate = useNavigate();

  const handleOpen = () => {
    navigate(`/execution/${task.id}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Open task ${task.summary || task.prompt}`}
      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background-card hover:shadow-card-hover transition-all group cursor-pointer"
    >
      <div className="w-2 h-2 rounded-full bg-success" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text truncate group-hover:text-primary transition-colors" title={task.summary || task.prompt}>
          {task.summary || task.prompt}
        </p>
        <p className="text-xs text-text-muted mt-1">
          Completed · {timeAgo} · {task.messages.length} messages
        </p>
      </div>
      <StarButton
        isFavorite={task.isFavorite || false}
        onToggle={onToggleFavorite}
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
  );
}
