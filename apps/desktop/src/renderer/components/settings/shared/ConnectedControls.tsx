// apps/desktop/src/renderer/components/settings/shared/ConnectedControls.tsx

import connectedIcon from '/assets/icons/connected.svg';

interface ConnectedControlsProps {
  onDisconnect: () => void;
}

export function ConnectedControls({ onDisconnect }: ConnectedControlsProps) {
  return (
    <div className="flex gap-2">
      <button
        className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#4A7C59] px-4 py-2.5 text-sm font-medium text-white"
        disabled
      >
        <img src={connectedIcon} alt="" className="h-4 w-4 brightness-0 invert" />
        Connected
      </button>
      <button
        onClick={onDisconnect}
        data-testid="disconnect-button"
        className="rounded-md border border-border p-2.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Disconnect"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
