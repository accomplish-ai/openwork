import { Globe, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type BrowserPreviewStatus = 'starting' | 'streaming' | 'loading' | 'ready' | 'stopped' | 'error' | 'idle';

interface BrowserPreviewProps {
  frame: string | null;
  url: string;
  pageName: string;
  status: BrowserPreviewStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPopOut: () => void;
}

const STATUS_LABELS: Record<BrowserPreviewStatus, string> = {
  idle: 'Idle',
  starting: 'Starting',
  streaming: 'Live',
  loading: 'Loading',
  ready: 'Ready',
  stopped: 'Paused',
  error: 'Error',
};

export function BrowserPreview({
  frame,
  url,
  pageName,
  status,
  collapsed,
  onToggleCollapsed,
  onPopOut,
}: BrowserPreviewProps) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/70 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium text-foreground">
            {url || `Page: ${pageName}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              status === 'error'
                ? 'bg-destructive/10 text-destructive'
                : status === 'streaming'
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {STATUS_LABELS[status]}
          </span>
          <button
            type="button"
            onClick={onPopOut}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Pop out in browser"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={collapsed ? 'Expand preview' : 'Collapse preview'}
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/90">
          {frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Live browser preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-zinc-300">
              Waiting for browser frames...
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
