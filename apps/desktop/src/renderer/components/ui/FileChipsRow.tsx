import { FileChip, type AttachedFile } from './FileChip';
import { cn } from '@/lib/utils';

interface FileChipsRowProps {
  files: AttachedFile[];
  onRemove?: (id: string) => void;
  readonly?: boolean;
  className?: string;
}

export function FileChipsRow({ files, onRemove, readonly = false, className }: FileChipsRowProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {files.map((file) => (
        <FileChip
          key={file.id}
          file={file}
          onRemove={onRemove ? () => onRemove(file.id) : undefined}
          readonly={readonly}
        />
      ))}
    </div>
  );
}
