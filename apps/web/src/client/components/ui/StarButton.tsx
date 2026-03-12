import { Star } from '@phosphor-icons/react';

interface StarButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'data-testid'?: string;
}

/**
 * Reusable star/favorite toggle button.
 * Renders a filled star when favorited, outline when not.
 */
export function StarButton({
  isFavorite,
  onToggle,
  size = 'md',
  className = '',
  'data-testid': testId,
}: StarButtonProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid={testId}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={`p-1 rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring ${
        isFavorite
          ? 'text-yellow-500 hover:text-yellow-600'
          : 'text-muted-foreground hover:text-yellow-400'
      } ${className}`}
    >
      <Star className={sizeClasses[size]} weight={isFavorite ? 'fill' : 'regular'} />
    </button>
  );
}
