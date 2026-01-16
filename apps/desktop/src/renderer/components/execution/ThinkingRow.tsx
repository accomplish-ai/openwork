import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springs } from '../../lib/animations';
import loadingSymbol from '/assets/loading-symbol.svg';

// Spinning icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img
    src={loadingSymbol}
    alt=""
    className={cn('animate-spin-ccw', className)}
  />
);

export const ThinkingRow = memo(function ThinkingRow() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={springs.gentle}
      className="w-full"
      data-testid="execution-thinking-indicator"
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg',
          'bg-muted/50 text-sm text-muted-foreground'
        )}
      >
        <SpinningIcon className="h-4 w-4 shrink-0" />
        <span className="font-medium">Thinking...</span>
      </div>
    </motion.div>
  );
});
