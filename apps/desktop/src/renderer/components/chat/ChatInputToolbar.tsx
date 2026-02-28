import React from 'react';
import {
  Send,
  Camera,
  AudioLines,
  Settings,
  Plus,
  Mic,
  MicOff,
  Monitor,
  Workflow,
  Square,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { DICTATION_FALLBACK_HINT } from '../../hooks/useSpeechDictation';
import type { DesktopControlPreferences } from '../desktop-control/useDesktopControlPreferences';
import { Textarea } from '../ui/textarea';

const WORK_WITH_APPS = [
  'Codex',
];

interface ChatInputToolbarProps {
  input: string;
  isLoading: boolean;
  isDictating: boolean;
  isDictationSupported: boolean;
  pendingVoiceSend: boolean;
  dictationError: string | null;
  selectedWorkWithApp: string | null;
  screenCaptureQueued: boolean;
  liveGuidanceEnabled: boolean;
  liveGuidanceByDefault: boolean;
  screenCaptureByDefault: boolean;
  keepDiagnosticsPanelVisible: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendMessage: () => void;
  onStopCurrentTask: () => void;
  onToggleDictation: () => void;
  onTalkToAgent: () => void;
  onArmLiveGuidance: () => void;
  onRecheckDesktopControl: () => void;
  onSelectWorkWithApp: (appName: string) => void;
  onClearWorkWithApp: () => void;
  onSetScreenCaptureQueued: (queued: boolean) => void;
  onSetLiveGuidanceEnabled: (enabled: boolean) => void;
  onSetDictationError: (error: string | null) => void;
  setDesktopControlPreferences: (next: Partial<DesktopControlPreferences>) => void;
  setShowMenuPanel: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenSettings?: () => void;
}

export function ChatInputToolbar({
  input,
  isLoading,
  isDictating,
  isDictationSupported,
  pendingVoiceSend,
  dictationError,
  selectedWorkWithApp,
  screenCaptureQueued,
  liveGuidanceEnabled,
  liveGuidanceByDefault,
  screenCaptureByDefault,
  keepDiagnosticsPanelVisible,
  inputRef,
  onInputChange,
  onKeyDown,
  onSendMessage,
  onStopCurrentTask,
  onToggleDictation,
  onTalkToAgent,
  onArmLiveGuidance,
  onRecheckDesktopControl,
  onSelectWorkWithApp,
  onClearWorkWithApp,
  onSetScreenCaptureQueued,
  onSetLiveGuidanceEnabled,
  onSetDictationError,
  setDesktopControlPreferences,
  setShowMenuPanel,
  onOpenSettings,
}: ChatInputToolbarProps) {
  return (
    <div className="p-4 border-t border-border bg-muted/20 space-y-2">
      {selectedWorkWithApp && (
        <div className="flex items-center justify-between rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-foreground truncate">
            <Workflow className="h-3.5 w-3.5 text-primary shrink-0" />
            Work with: {selectedWorkWithApp}
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClearWorkWithApp}
          >
            Clear
          </button>
        </div>
      )}
      {screenCaptureQueued && (
        <div className="flex items-center justify-between rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-foreground truncate">
            <Camera className="h-3.5 w-3.5 text-primary shrink-0" />
            Next message will include screen capture mode
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSetScreenCaptureQueued(false)}
          >
            Clear
          </button>
        </div>
      )}
      {liveGuidanceEnabled && (
        <div className="flex items-center justify-between rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 text-foreground truncate">
            <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
            Next message will include live guidance mode
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSetLiveGuidanceEnabled(false)}
          >
            Clear
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={isLoading}
              title="Open quick actions and defaults"
              aria-label="Open quick actions and defaults"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem
              onSelect={() => {
                onArmLiveGuidance();
              }}
            >
              <Monitor className="h-4 w-4" />
              Guide me live (next message)
              <DropdownMenuShortcut>Ctrl+Shift+L</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onSetScreenCaptureQueued(true);
                setShowMenuPanel(false);
                inputRef.current?.focus();
              }}
            >
              <Camera className="h-4 w-4" />
              Add screen capture
              <DropdownMenuShortcut>Ctrl+Shift+S</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Workflow className="h-4 w-4" />
                Work with:
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44">
                {WORK_WITH_APPS.map((appName) => (
                  <DropdownMenuItem
                    key={appName}
                    onSelect={() => onSelectWorkWithApp(appName)}
                  >
                    {appName}
                    {selectedWorkWithApp === appName && (
                      <span className="ml-auto text-[10px] text-primary">Active</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {selectedWorkWithApp && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onClearWorkWithApp}>
                  Clear work with app
                </DropdownMenuItem>
              </>
            )}
            {screenCaptureQueued && (
              <DropdownMenuItem onSelect={() => onSetScreenCaptureQueued(false)}>
                Clear screen capture
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onRecheckDesktopControl();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Recheck diagnostics
              <DropdownMenuShortcut>Ctrl+Shift+D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onOpenSettings?.();
              }}
            >
              <Settings className="h-4 w-4" />
              Open settings
              <DropdownMenuShortcut>Ctrl+Shift+,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Desktop control defaults</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={liveGuidanceByDefault}
              onCheckedChange={(checked) =>
                setDesktopControlPreferences({
                  liveGuidanceByDefault: Boolean(checked),
                })
              }
            >
              Live guidance by default
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={screenCaptureByDefault}
              onCheckedChange={(checked) =>
                setDesktopControlPreferences({
                  screenCaptureByDefault: Boolean(checked),
                })
              }
            >
              Screen capture by default
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={keepDiagnosticsPanelVisible}
              onCheckedChange={(checked) =>
                setDesktopControlPreferences({
                  keepDiagnosticsPanelVisible: Boolean(checked),
                })
              }
            >
              Keep diagnostics visible
              <DropdownMenuShortcut>Ctrl+Shift+D</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            if (dictationError) {
              onSetDictationError(null);
            }
            onInputChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={selectedWorkWithApp ? `Ask about ${selectedWorkWithApp}...` : 'Ask me anything...'}
          disabled={isLoading}
          aria-label="Chat message input"
          aria-describedby="floating-chat-shortcuts"
          rows={2}
          autosize
          maxHeight={224}
          className="min-h-[56px] flex-1 resize-none py-3"
        />
        <Button
          variant={isDictating ? 'default' : 'outline'}
          size="icon"
          className="shrink-0"
          onClick={() => {
            onSetDictationError(null);
            onToggleDictation();
          }}
          disabled={isLoading || !isDictationSupported}
          title={
            !isDictationSupported
              ? 'Dictation is unavailable on this device'
              : isDictating
                ? 'Stop dictation'
                : 'Start dictation'
          }
          aria-label={isDictating ? 'Stop dictation' : 'Start dictation'}
        >
          {isDictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button
          variant={pendingVoiceSend || isDictating ? 'default' : 'outline'}
          size="icon"
          className="shrink-0"
          onClick={onTalkToAgent}
          disabled={isLoading || !isDictationSupported}
          title={
            !isDictationSupported
              ? 'Voice chat is unavailable on this device'
              : isDictating
                ? 'Finish and send to agent'
                : 'Talk to agent'
          }
          aria-label={isDictating ? 'Finish and send to agent' : 'Talk to agent'}
        >
          <AudioLines className="h-4 w-4" />
        </Button>
        <Button
          onClick={isLoading ? () => void onStopCurrentTask() : onSendMessage}
          disabled={isLoading ? false : (!input.trim() || isDictating)}
          size="icon"
          className="shrink-0"
          variant={isLoading ? 'outline' : 'default'}
          title={isLoading ? 'Stop agent (Esc)' : 'Send message'}
          aria-label={isLoading ? 'Stop agent' : 'Send message'}
        >
          {isLoading ? (
            <Square className="h-4 w-4 fill-current" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {dictationError && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-destructive">{dictationError}</p>
          <p className="text-[11px] text-muted-foreground">{DICTATION_FALLBACK_HINT}</p>
        </div>
      )}
      <p id="floating-chat-shortcuts" className="sr-only">
        Keyboard shortcuts: Control or Command plus Shift plus L toggles live guidance mode.
        Control or Command plus Shift plus S toggles screen capture mode.
        Control or Command plus Shift plus D runs desktop diagnostics.
        Control or Command plus Shift plus comma opens settings.
      </p>
    </div>
  );
}
