'use client';

import { useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '@/lib/accomplish';
import { ArrowUp, WarningCircle } from '@phosphor-icons/react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '@/hooks/useSpeechInput';
import { useTypingPlaceholder } from '@/hooks/useTypingPlaceholder';
import { SpeechInputButton } from '@/components/ui/SpeechInputButton';
import { ModelIndicator } from '@/components/ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  typingPlaceholder?: boolean;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  onOpenSpeechSettings?: () => void;
  onOpenModelSettings?: () => void;
  hideModelWhenNoModel?: boolean;
  autoSubmitOnTranscription?: boolean;
  toolbarLeft?: ReactNode;
}

export function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  typingPlaceholder = false,
  isLoading = false,
  disabled = false,
  large: _large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
  toolbarLeft,
}: TaskInputBarProps) {
  const { t } = useTranslation('common');
  const isInputDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = !!value.trim() && !disabled && !isOverLimit;
  const isSubmitDisabled = !isLoading && (!canSubmit || isInputDisabled);
  const submitLabel = isLoading ? t('buttons.stop') : t('buttons.submit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animatedPlaceholder = useTypingPlaceholder({
    enabled: typingPlaceholder && !value,
    text: placeholder,
  });
  const effectivePlaceholder = typingPlaceholder && !value ? animatedPlaceholder : placeholder;
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();

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
    if (!autoSubmitOnTranscription || isInputDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isInputDisabled, isOverLimit, onSubmit, value]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit && !speechInput.isRecording && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      {speechInput.error && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <WarningCircle className="h-4 w-4" />
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
        className="rounded-[12px] border border-border bg-popover/70 transition-all duration-200 ease-accomplish cursor-text focus-within:border-muted-foreground/40"
        onClick={() => textareaRef.current?.focus()}
      >
        <div className="px-4 pt-3 pb-1">
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={effectivePlaceholder}
            disabled={isInputDisabled || speechInput.isRecording}
            rows={3}
            className="w-full min-h-[60px] max-h-[200px] resize-none overflow-y-auto bg-transparent text-[16px] leading-relaxed tracking-[-0.015em] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="flex h-[36px] items-center justify-between pl-3 pr-2 mb-2">
          <div className="flex items-center">{toolbarLeft}</div>

          <div className="flex items-center gap-3">
            {onOpenModelSettings && (
              <ModelIndicator
                isRunning={false}
                onOpenSettings={onOpenModelSettings}
                hideWhenNoModel={hideModelWhenNoModel}
              />
            )}

            <SpeechInputButton
              isRecording={speechInput.isRecording}
              isTranscribing={speechInput.isTranscribing}
              recordingDuration={speechInput.recordingDuration}
              error={speechInput.error}
              isConfigured={speechInput.isConfigured}
              disabled={isInputDisabled}
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
                  aria-label={submitLabel}
                  title={submitLabel}
                  onClick={() => {
                    accomplish.logEvent({
                      level: 'info',
                      message: 'Task input submit clicked',
                      context: { prompt: value },
                    });
                    onSubmit();
                  }}
                  disabled={isSubmitDisabled || speechInput.isRecording}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-accomplish ${
                    isLoading
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : isSubmitDisabled || speechInput.isRecording
                        ? 'bg-muted text-muted-foreground/60'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {isLoading ? (
                    <span className="block h-[10px] w-[10px] rounded-[1.5px] bg-destructive-foreground" />
                  ) : (
                    <ArrowUp className="h-4 w-4" weight="bold" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {isOverLimit
                    ? t('buttons.messageTooLong')
                    : !value.trim()
                      ? t('buttons.enterMessage')
                      : submitLabel}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
