import { Star } from 'lucide-react';

interface StarButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StarButton({ 
  isFavorite, 
  onToggle, 
  size = 'md', 
  className = '' 
}: StarButtonProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  return (
    <button
      onClick={handleClick}
      className={`p-2 transition-all duration-200 ${className} ${
        isFavorite 
          ? 'text-yellow-500 hover:text-yellow-600' 
          : 'text-text-muted hover:text-yellow-400'
      }`}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star 
        className={`${sizeClasses[size]} ${
          isFavorite ? 'fill-current' : ''
        }`} 
        fill={isFavorite ? 'currentColor' : 'none'}
      />
    </button>
  );
}
