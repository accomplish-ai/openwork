'use client';

import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import type { DesktopControlStatusPayload } from '../../lib/accomplish';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface DesktopControlShellProps {
  status: DesktopControlStatusPayload | null;
  isChecking: boolean;
  errorMessage?: string | null;
  onRecheck: () => void | Promise<void>;
}

function LoadingState() {
  return (
    <Card className="border border-border/70 bg-muted/20 p-3" data-testid="desktop-control-shell-loading">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking desktop control readiness...</span>
      </div>
    </Card>
  );
}

function EmptyState({ onRecheck }: { onRecheck: () => void | Promise<void> }) {
  return (
    <Card className="border border-border/70 bg-muted/20 p-3" data-testid="desktop-control-shell-empty">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Desktop Control Diagnostics</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              No readiness snapshot yet. Run a check to load diagnostic status.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void onRecheck();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recheck
        </Button>
      </div>
    </Card>
  );
}

function ErrorState({
  errorMessage,
  onRecheck,
}: {
  errorMessage: string;
  onRecheck: () => void | Promise<void>;
}) {
  return (
    <Card
      className="border border-destructive/40 bg-destructive/5 p-3"
      data-testid="desktop-control-shell-error"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Desktop Control Diagnostics</h3>
            <p className="mt-0.5 text-xs text-destructive">{errorMessage}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void onRecheck();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    </Card>
  );
}

export function DesktopControlShell({
  status,
  isChecking,
  errorMessage,
  onRecheck,
}: DesktopControlShellProps) {
  if (isChecking && !status && !errorMessage) {
    return <LoadingState />;
  }

  if (errorMessage && !status) {
    return <ErrorState errorMessage={errorMessage} onRecheck={onRecheck} />;
  }

  if (!status) {
    return <EmptyState onRecheck={onRecheck} />;
  }

  return (
    <DiagnosticsPanel
      status={status}
      isChecking={isChecking}
      errorMessage={errorMessage}
      onRecheck={onRecheck}
    />
  );
}

export default DesktopControlShell;
