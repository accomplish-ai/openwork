import { FileCode, ImageIcon, FileText, File as FileIcon } from 'lucide-react';

export function getAttachmentIcon(type: string) {
  switch (type) {
    case 'code':
      return <FileCode className="h-4 w-4 text-blue-500" />;
    case 'image':
      return <ImageIcon className="h-4 w-4 text-purple-500" />;
    case 'text':
      return <FileText className="h-4 w-4 text-green-500" />;
    case 'pdf':
      return <FileText className="h-4 w-4 text-red-500" />;
    default:
      return <FileIcon className="h-4 w-4 text-muted-foreground" />;
  }
}
