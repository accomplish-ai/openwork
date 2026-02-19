import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import type { TaskAttachment } from '@accomplish_ai/agent-core/common';

interface AttachmentThumbnailsProps {
  attachments: TaskAttachment[];
  isProcessing: boolean;
  onRemove: (index: number) => void;
}

export function AttachmentThumbnails({
  attachments,
  isProcessing,
  onRemove,
}: AttachmentThumbnailsProps) {
  if (attachments.length === 0 && !isProcessing) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden py-1">
      <AnimatePresence mode="popLayout">
        {attachments.map((att, i) => (
          <motion.div
            key={att.label ? `${att.label}-${i}` : `att-${i}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="relative group/thumb shrink-0"
          >
            <img
              src={att.data}
              alt={att.label || 'Attachment'}
              className="h-8 w-8 rounded-md object-cover border border-border"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted hover:bg-muted/80 border border-border text-muted-foreground flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
    </div>
  );
}
