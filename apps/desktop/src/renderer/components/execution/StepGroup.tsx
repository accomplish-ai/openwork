import { useState, memo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepGroupProps {
  children: ReactNode;
  defaultExpanded?: boolean;
}

export const StepGroup = memo(function StepGroup({
  children,
  defaultExpanded = true,
}: StepGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground',
          'hover:text-foreground transition-colors'
        )}
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-4 w-4" />
            <span>Hide steps</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            <span>Show steps</span>
          </>
        )}
      </button>

      {/* Steps container with timeline */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="relative pl-4 ml-2 border-l-2 border-border">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
