'use client';

import { useRef, useEffect, useCallback } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle } from 'lucide-react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import type { TaskAttachment } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { useAttachments } from '../../hooks/useAttachments';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { AttachmentThumbnails } from '../ui/AttachmentThumbnails';
import { DragOverlay } from '../ui/DragOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';
import { cn } from '@/lib/utils';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments?: TaskAttachment[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  onOpenSpeechSettings?: () => void;
  onOpenSettings?: (tab: 'providers' | 'voice' | 'skills' | 'connectors') => void;
  onOpenModelSettings?: () => void;
  hideModelWhenNoModel?: boolean;
  autoSubmitOnTranscription?: boolean;
}

export default function TaskInputBar({
  value,
  onChange,
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
  const isDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();

  const attachmentInput = useAttachments();

  const isProcessing = attachmentInput.isProcessing;
  const hasContent = !!value.trim() || attachmentInput.attachments.length > 0;
  const canSubmit = hasContent && !isDisabled && !isOverLimit && !isProcessing;

  let submitTooltipLabel = 'Submit';
  if (isOverLimit) {
    submitTooltipLabel = 'Message is too long';
  } else if (isProcessing) {
    submitTooltipLabel = 'Processing attachments';
  } else if (!hasContent) {
    submitTooltipLabel = 'Enter a message';
  }

  const handleSubmit = useCallback(() => {
    if (attachmentInput.isProcessing) {
      return;
    }
    const atts = attachmentInput.attachments.length > 0 ? attachmentInput.attachments : undefined;
    onSubmit(atts);
    attachmentInput.clearAttachments();
  }, [attachmentInput, onSubmit]);

  // Speech input hook
  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);

      if (autoSubmitOnTranscription && newValue.trim()) {
        pendingAutoSubmitRef.current = newValue;
      }

      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    onError: (error) => {
      console.error('[Speech] Error:', error.message);
    },
  });

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled || isOverLimit || isProcessing) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      handleSubmit();
    }
  }, [autoSubmitOnTranscription, isDisabled, isOverLimit, isProcessing, value, handleSubmit]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        handleSubmit();
      }
    }
  };

  const handleSkillSelect = (command: string) => {
    const newValue = `${command} ${value}`.trim();
    onChange(newValue);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  return (
    <div className="w-full space-y-2">
      {(speechInput.error || attachmentInput.error) && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">
            {speechInput.error ? (
              <>
                {speechInput.error.message}
                {speechInput.error.code === 'EMPTY_RESULT' && (
                  <button
                    onClick={() => speechInput.retry()}
                    className="ml-2 underline hover:no-underline"
                    type="button"
                  >
                    Retry
                  </button>
                )}
              </>
            ) : (
              <>
                {attachmentInput.error}
                <button
                  onClick={() => attachmentInput.clearError()}
                  className="ml-2 underline hover:no-underline"
                  type="button"
                >
                  Dismiss
                </button>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div
        className={cn(
          'relative rounded-xl border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          attachmentInput.isDragging ? 'border-primary ring-1 ring-primary' : 'border-border',
        )}
        {...attachmentInput.dragHandlers}
      >
        <DragOverlay isDragging={attachmentInput.isDragging} />

        <div className="px-4 pt-3 pb-2">
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={attachmentInput.handlePaste}
            placeholder={placeholder}
            disabled={isDisabled || speechInput.isRecording}
            rows={1}
            className="w-full max-h-[160px] resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <PlusMenu
              onSkillSelect={handleSkillSelect}
              onOpenSettings={(tab) => onOpenSettings?.(tab)}
              onAttachFiles={attachmentInput.openFilePicker}
              disabled={isDisabled || speechInput.isRecording}
            />

            <AttachmentThumbnails
              attachments={attachmentInput.attachments}
              isProcessing={attachmentInput.isProcessing}
              onRemove={attachmentInput.removeAttachment}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
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
                  aria-label="Submit"
                  onClick={() => {
                    accomplish.logEvent({
                      level: 'info',
                      message: 'Task input submit clicked',
                      context: { prompt: value },
                    });
                    handleSubmit();
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
                <span>{submitTooltipLabel}</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
