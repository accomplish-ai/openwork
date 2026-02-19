import { AnimatePresence, motion } from 'framer-motion';
import { ImageIcon } from 'lucide-react';

interface DragOverlayProps {
  isDragging: boolean;
}

export function DragOverlay({ isDragging }: DragOverlayProps) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <ImageIcon className="h-5 w-5" />
            Drop images here
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
