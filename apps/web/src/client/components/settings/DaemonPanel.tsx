'use client';

import { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';

export function DaemonPanel() {
  const [runInBackground, setRunInBackground] = useState(false);
  const [socketPath, setSocketPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const accomplish = getAccomplish();

  useEffect(() => {
    accomplish.getRunInBackground().then(setRunInBackground);
    accomplish.getDaemonSocketPath().then(setSocketPath);
  }, [accomplish]);

  const handleToggle = async () => {
    const next = !runInBackground;
    setSaving(true);
    try {
      await accomplish.setRunInBackground(next);
      setRunInBackground(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Background Mode Toggle */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-foreground">Run in Background</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Keep Accomplish running in the system tray when the window is closed. Tasks continue
              running and the app can receive requests from external sources.
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ease-accomplish ${
              runInBackground ? 'bg-primary' : 'bg-muted'
            }`}
            aria-label="Toggle background mode"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                runInBackground ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {runInBackground && (
          <div className="mt-3 rounded-lg bg-primary/5 p-3">
            <p className="text-sm text-muted-foreground">
              Accomplish will stay active in the system tray when the window is closed. Use the tray
              icon to show the window or quit the app.
            </p>
          </div>
        )}
      </div>

      {/* Daemon Socket */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Daemon Socket</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          External clients (CLI tools, integrations, scheduled jobs) can send tasks to Accomplish
          via the local daemon socket using JSON-RPC 2.0.
        </p>

        {socketPath && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Socket Path
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground break-all overflow-hidden text-ellipsis">
                {socketPath}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(socketPath)}
                className="flex-shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Copy to clipboard"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Example: Send a task via CLI</p>
          <pre className="overflow-x-auto max-w-full rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {`echo '{"jsonrpc":"2.0","id":1,"method":"task.start","params":{"prompt":"List files in /tmp"}}' | nc -U "${socketPath ?? '/path/to/daemon.sock'}"`}
          </pre>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Architecture</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          The daemon architecture separates the always-on task execution engine from the UI,
          enabling background processing and external integrations.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">System Tray</div>
            <p className="text-xs text-muted-foreground">
              Runs in the background, accessible from the menu bar even when the window is hidden.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">Socket API</div>
            <p className="text-xs text-muted-foreground">
              JSON-RPC 2.0 over a local Unix socket. Allows CLI tools and other apps to dispatch
              tasks.
            </p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs font-semibold text-foreground mb-1">Always On</div>
            <p className="text-xs text-muted-foreground">
              Tasks continue running when the UI is closed. Results are available when you reopen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
