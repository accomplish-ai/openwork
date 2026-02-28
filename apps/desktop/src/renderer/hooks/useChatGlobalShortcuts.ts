import { useEffect } from 'react';
import { getAccomplish, type DesktopControlStatusPayload } from '../lib/accomplish';

interface UseChatGlobalShortcutsOptions {
  isLoading: boolean;
  isDictationSupported: boolean;
  toggleDictation: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setShowMenuPanel: React.Dispatch<React.SetStateAction<boolean>>;
  setLiveGuidanceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLiveViewer: React.Dispatch<React.SetStateAction<boolean>>;
  setScreenCaptureQueued: React.Dispatch<React.SetStateAction<boolean>>;
  setDictationError: React.Dispatch<React.SetStateAction<string | null>>;
  checkDesktopControl: (options: {
    revealIfBlocked?: boolean;
    forceRefresh?: boolean;
  }) => Promise<DesktopControlStatusPayload | null>;
  onOpenSettings?: () => void;
}

/**
 * Registers global keyboard shortcuts for the chat UI and handles
 * the external dictation toggle request from the main process.
 *
 * Shortcuts (all require Ctrl/Cmd + Shift):
 *   L  - toggle live guidance
 *   S  - toggle screen capture
 *   D  - recheck desktop-control diagnostics
 *   ,  - open settings
 */
export function useChatGlobalShortcuts({
  isLoading,
  isDictationSupported,
  toggleDictation,
  inputRef,
  setShowMenuPanel,
  setLiveGuidanceEnabled,
  setShowLiveViewer,
  setScreenCaptureQueued,
  setDictationError,
  checkDesktopControl,
  onOpenSettings,
}: UseChatGlobalShortcutsOptions): void {
  const accomplish = getAccomplish();

  // External dictation toggle from main process
  useEffect(() => {
    if (typeof accomplish.onToggleDictationRequested !== 'function') {
      return;
    }

    const unsubscribe = accomplish.onToggleDictationRequested(() => {
      if (isLoading || !isDictationSupported) {
        return;
      }

      setDictationError(null);
      toggleDictation();
      inputRef.current?.focus();
    });

    return () => {
      unsubscribe?.();
    };
  }, [accomplish, isDictationSupported, isLoading, toggleDictation, inputRef, setDictationError]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const hasShortcutModifier = event.metaKey || event.ctrlKey;
      if (!hasShortcutModifier || !event.shiftKey) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === 'l') {
        event.preventDefault();
        if (isLoading) {
          return;
        }
        setShowMenuPanel(false);
        setLiveGuidanceEnabled((value) => !value);
        setShowLiveViewer(true);
        inputRef.current?.focus();
        return;
      }

      if (normalizedKey === 's') {
        event.preventDefault();
        if (isLoading) {
          return;
        }
        setShowMenuPanel(false);
        setScreenCaptureQueued((value) => !value);
        inputRef.current?.focus();
        return;
      }

      if (normalizedKey === 'd') {
        event.preventDefault();
        void checkDesktopControl({
          revealIfBlocked: true,
          forceRefresh: true,
        });
        return;
      }

      if (normalizedKey === ',') {
        event.preventDefault();
        onOpenSettings?.();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcut);

    return () => {
      window.removeEventListener('keydown', handleGlobalShortcut);
    };
  }, [
    checkDesktopControl,
    isLoading,
    onOpenSettings,
    inputRef,
    setShowMenuPanel,
    setLiveGuidanceEnabled,
    setShowLiveViewer,
    setScreenCaptureQueued,
  ]);
}
