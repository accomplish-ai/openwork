import { memo } from 'react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  label: string;
  content: string;
  className?: string;
}

export const CodeBlock = memo(function CodeBlock({
  label,
  content,
  className,
}: CodeBlockProps) {
  return (
    <div className={cn('rounded-lg overflow-hidden', className)}>
      <div className="bg-zinc-800 px-3 py-1.5 border-b border-zinc-700">
        <span className="text-xs text-zinc-400 font-medium">{label}</span>
      </div>
      <div className="bg-zinc-900 p-3 overflow-x-auto">
        <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words">
          {content}
        </pre>
      </div>
    </div>
  );
});
