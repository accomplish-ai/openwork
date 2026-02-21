'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle, X, Paperclip } from 'lucide-react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';

interface AttachedFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
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

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const dragCounterRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        onSubmit();
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

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle files dropped or selected
  const handleFiles = useCallback(
    (files: FileList) => {
      const newFiles: AttachedFile[] = [];
      for (const file of Array.from(files)) {
        // Avoid duplicates
        const alreadyAttached = attachedFiles.some(
          (f) => f.name === file.name && f.size === file.size,
        );
        if (!alreadyAttached) {
          newFiles.push({
            name: file.name,
            // In Electron, File objects may have a path property
            path: (file as File & { path?: string }).path || file.name,
            size: file.size,
            type: file.type || 'unknown',
          });
        }
      }
      if (newFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...newFiles]);
        // Append file context to the text input
        const fileContext = newFiles.map((f) => `[File: ${f.path || f.name}]`).join(' ');
        const newValue = value.trim() ? `${value} ${fileContext}` : fileContext;
        onChange(newValue);
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    },
    [attachedFiles, value, onChange],
  );

  // Remove an attached file chip
  const removeFile = useCallback(
    (fileToRemove: AttachedFile) => {
      setAttachedFiles((prev) => prev.filter((f) => f !== fileToRemove));
      // Remove the file reference from the text value
      const fileContext = `[File: ${fileToRemove.path || fileToRemove.name}]`;
      onChange(value.replace(fileContext, '').replace(/\s+/g, ' ').trim());
    },
    [value, onChange],
  );

  // Drag event handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounterRef.current = 0;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
        e.dataTransfer.clearData();
      }
    },
    [handleFiles],
  );

  return (
    <div className="w-full space-y-2">
      {/* Error message */}
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

      {/* Input container */}
      <div
        ref={containerRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative rounded-xl border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${
          isDragging ? 'border-primary ring-2 ring-primary ring-offset-1' : 'border-border'
        }`}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-primary/10 backdrop-blur-[1px] pointer-events-none">
            <Paperclip className="h-8 w-8 text-primary mb-2 animate-bounce" />
            <p className="text-sm font-medium text-primary">Drop files to attach</p>
            <p className="text-xs text-primary/70 mt-1">Files will be added as context</p>
          </div>
        )}

        {/* Attached file chips */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
            {attachedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground max-w-[200px]"
                title={`${file.path}\n${formatFileSize(file.size)}`}
              >
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <span className="text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(file)}
                  className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea area */}
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

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          {/* Plus Menu on left */}
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            disabled={isDisabled || speechInput.isRecording}
          />

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Model Indicator */}
            {onOpenModelSettings && (
              <ModelIndicator
                isRunning={false}
                onOpenSettings={onOpenModelSettings}
                hideWhenNoModel={hideModelWhenNoModel}
              />
            )}

            {/* Divider */}
            <div className="w-px h-6 bg-border" />

            {/* Speech Input Button */}
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

            {/* Submit button */}
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

      {/* Drag hint */}
      {!isDragging && attachedFiles.length === 0 && (
        <p className="text-center text-xs text-muted-foreground/50 select-none">
          Drag & drop files to attach as context
        </p>
      )}
    </div>
  );
}
