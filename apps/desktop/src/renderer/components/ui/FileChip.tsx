import { X, FileText, Image, Table, Code, File } from 'lucide-react';
import { cn } from '@/lib/utils';

// FileType will be imported from @accomplish/shared once Task 1 is complete
// For now, define it locally
type FileType = 'pdf' | 'image' | 'csv' | 'code' | 'text' | 'other';

export interface AttachedFile {
  id: string;
  path: string;
  name: string;
  type: FileType;
}

interface FileChipProps {
  file: AttachedFile;
  onRemove?: () => void;
  readonly?: boolean;
}

const FILE_TYPE_ICONS: Record<FileType, typeof FileText> = {
  pdf: FileText,
  image: Image,
  csv: Table,
  code: Code,
  text: FileText,
  other: File,
};

const FILE_TYPE_COLORS: Record<FileType, string> = {
  pdf: 'bg-red-100 text-red-600',
  image: 'bg-blue-100 text-blue-600',
  csv: 'bg-green-100 text-green-600',
  code: 'bg-amber-100 text-amber-600',
  text: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

export function FileChip({ file, onRemove, readonly = false }: FileChipProps) {
  const Icon = FILE_TYPE_ICONS[file.type];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm',
        'bg-muted border border-border',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      title={file.path}
    >
      <span className={cn('p-1 rounded', FILE_TYPE_COLORS[file.type])}>
        <Icon className="h-3 w-3" />
      </span>
      <span className="max-w-[140px] truncate font-medium text-foreground">
        {file.name}
      </span>
      {!readonly && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
