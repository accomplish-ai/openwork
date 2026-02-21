'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle, File, X, Plus } from 'lucide-react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import type { TaskFileAttachment } from '@accomplish_ai/agent-core';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';
import { getAttachmentIcon } from '../../lib/attachments';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  attachments?: TaskFileAttachment[];
  onAttachmentsChange?: (attachments: TaskFileAttachment[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  /**
   * Called when user clicks mic button while voice input is not configured
   * (to open settings dialog)
   */
  onOpenSpeechSettings?: () => void;
  /**
   * Called when user wants to open settings (e.g., from "Manage Skills")
   */
  onOpenSettings?: (tab: 'providers' | 'voice' | 'skills' | 'connectors') => void;
  /**
   * Called when user wants to open settings to change model
   */
  onOpenModelSettings?: () => void;
  /**
   * Hide model indicator when no model is selected (instead of showing warning)
   */
  hideModelWhenNoModel?: boolean;
  /**
   * Automatically submit after a successful transcription.
   */
  autoSubmitOnTranscription?: boolean;
}

export default function TaskInputBar({
  value,
  onChange,
  attachments = [],
  onAttachmentsChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  isLoading = false,
  disabled = false,
  large: _large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenSettings,
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');
  const isDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = !!value.trim() && !isDisabled && !isOverLimit;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();
  const [isDragging, setIsDragging] = useState(false);
  const [_dragCounter, setDragCounter] = useState(0);

  // Speech input hook
  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      // Append transcribed text to existing input
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);

      if (autoSubmitOnTranscription && newValue.trim()) {
        pendingAutoSubmitRef.current = newValue;
      }

      // Auto-focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    onError: (error) => {
      console.error('[Speech] Error:', error.message);
      // Error is stored in speechInput.error state
    },
  });

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-submit once the parent value reflects the transcription.
  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isDisabled, isOverLimit, onSubmit, value]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        onSubmit();
      }
    }
  };

  const handleSkillSelect = (command: string) => {
    // Prepend command to input with space
    const newValue = `${command} ${value}`.trim();
    onChange(newValue);
    // Focus textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handlePickFiles = async () => {
    if (!window.accomplish?.pickFiles || !onAttachmentsChange) return;
    try {
      const newFiles = await window.accomplish.pickFiles();
      if (newFiles.length > 0) {
        // Enforce max 5 limit and combine
        const combined = [...attachments, ...newFiles].slice(0, 5);
        onAttachmentsChange(combined);
      }
    } catch (error) {
      console.error('Failed to pick files:', error);
      // NOTE: Errors shown via alerts later if needed, but Dialog handles limits
    }
  };

  const removeAttachment = (id: string) => {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!window.accomplish?.processDroppedFiles || !onAttachmentsChange) {
      console.warn('Direct file drop is not supported in this environment yet.');
      return;
    }

    // 1. Extract valid DOM File objects robustly
    const extractedFiles: File[] = [];
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          const file = e.dataTransfer.items[i].getAsFile();
          if (file) extractedFiles.push(file);
        }
      }
    } else if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        extractedFiles.push(e.dataTransfer.files[i]);
      }
    }

    if (extractedFiles.length === 0) {
      console.warn(
        'No files extracted from the drop payload. Check if the dragged item is a valid OS file.',
      );
      return;
    }

    // 2. Safely map File objects to absolute native OS paths for the Electron IPC
    const filePaths: string[] = [];
    for (const file of extractedFiles) {
      // Fallback to the Chromium non-standard prop
      let filePath = 'path' in file ? (file as File & { path: string }).path : undefined;

      if (window.accomplish?.getFilePath) {
        try {
          // Extract via the native WebContents webUtils bridge
          filePath = window.accomplish.getFilePath(file);
        } catch (err) {
          console.warn('webUtils extraction failed, falling back', err);
        }
      }

      if (filePath && typeof filePath === 'string') {
        filePaths.push(filePath);
      }
    }

    if (filePaths.length === 0) {
      console.error(
        'Files were dropped but no native disk paths could be resolved. IPC transfer will fail.',
      );
      return;
    }

    try {
      const newAttachments = await window.accomplish.processDroppedFiles(filePaths);
      if (newAttachments.length > 0) {
        const combined = [...attachments, ...newAttachments].slice(0, 5);
        onAttachmentsChange(combined);
      }
    } catch (err) {
      console.error('Failed to process dropped files:', err);
    }
  };

  return (
    <div
      className="w-full space-y-2 relative"
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setDragCounter((prev) => prev + 1);
        if (!isDragging) setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragCounter((prev) => {
          const next = prev - 1;
          if (next === 0) setIsDragging(false);
          return next;
        });
      }}
      onDrop={(e) => {
        setDragCounter(0);
        handleDrop(e);
      }}
    >
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <div className="text-primary font-medium flex items-center gap-2 pointer-events-none">
            <Plus className="h-5 w-5 pointer-events-none" /> Drop files here to attach
          </div>
        </div>
      )}

      {speechInput.error && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">
            {speechInput.error.message}
            {speechInput.error.code === 'EMPTY_RESULT' && (
              <button
                onClick={() => speechInput.retry()}
                className="ml-2 underline hover:no-underline"
                type="button"
              >
                {t('buttons.retry')}
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div
        className={`rounded-xl border border-border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${isDragging ? 'pointer-events-none' : ''}`}
      >
        {attachments.length > 0 && (
          <div className="px-4 pt-4 pb-1 flex gap-2 overflow-x-auto items-center">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 border border-border rounded-md shrink-0 max-w-[200px]"
                title={file.name}
              >
                {getAttachmentIcon(file.type)}
                <span className="text-xs font-medium truncate">{file.name}</span>
                <button
                  onClick={() => removeAttachment(file.id)}
                  aria-label={`Remove attachment ${file.name}`}
                  className="text-muted-foreground hover:text-foreground shrink-0 ml-1 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-2">
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled || speechInput.isRecording}
            rows={1}
            className="w-full max-h-[160px] resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            onPickFiles={handlePickFiles}
            disabled={isDisabled || speechInput.isRecording}
          />

          <div className="flex items-center gap-2">
            {onOpenModelSettings && (
              <ModelIndicator
                isRunning={false}
                onOpenSettings={onOpenModelSettings}
                hideWhenNoModel={hideModelWhenNoModel}
              />
            )}

            <div className="w-px h-6 bg-border" />

            <SpeechInputButton
              isRecording={speechInput.isRecording}
              isTranscribing={speechInput.isTranscribing}
              recordingDuration={speechInput.recordingDuration}
              error={speechInput.error}
              isConfigured={speechInput.isConfigured}
              disabled={isDisabled}
              onStartRecording={() => speechInput.startRecording()}
              onStopRecording={() => speechInput.stopRecording()}
              onCancel={() => speechInput.cancelRecording()}
              onRetry={() => speechInput.retry()}
              onOpenSettings={onOpenSpeechSettings}
              size="md"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="task-input-submit"
                  type="button"
                  aria-label={t('buttons.submit')}
                  onClick={() => {
                    accomplish.logEvent({
                      level: 'info',
                      message: 'Task input submit clicked',
                      context: { prompt: value },
                    });
                    onSubmit();
                  }}
                  disabled={!canSubmit || speechInput.isRecording}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 ease-accomplish hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CornerDownLeft className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {isOverLimit
                    ? t('buttons.messageTooLong')
                    : !value.trim()
                      ? t('buttons.enterMessage')
                      : t('buttons.submit')}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
