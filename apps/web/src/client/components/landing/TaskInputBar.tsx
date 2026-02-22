'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getAccomplish } from '../../lib/accomplish';
import {
  ArrowBendDownLeft,
  SpinnerGap,
  WarningCircle,
  X,
  FileText,
  Image,
  FileCode,
  File,
} from '@phosphor-icons/react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import type {
  TaskInputAttachment,
  TaskInputAttachmentType,
} from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface FileAttachment {
  id: string;
  name: string;
  path: string;
  type: TaskInputAttachmentType;
  size: number;
  preview?: string;
}

function getAttachmentType(file: File): TaskInputAttachmentType {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const imageExt = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
  const textExt = new Set(['txt', 'md', 'json']);
  const codeExt = new Set([
    'js',
    'ts',
    'py',
    'tsx',
    'jsx',
    'vue',
    'css',
    'html',
    'htm',
    'sh',
    'bash',
  ]);
  if (imageExt.has(ext)) {
    return 'image';
  }
  if (textExt.has(ext)) {
    return 'text';
  }
  if (codeExt.has(ext) || ext === 'pdf') {
    return 'document';
  }
  return 'text';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on submit with prompt and optional attachments. */
  onSubmit: (prompt: string, attachments?: TaskInputAttachment[]) => void;
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
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const isDisabled = disabled || isLoading;
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = (!!value.trim() || attachments.length > 0) && !isDisabled && !isOverLimit;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const accomplish = getAccomplish();

  const fileToAttachment = useCallback(
    async (file: File): Promise<FileAttachment | null> => {
      let filePath = (file as File & { path?: string }).path;
      if (!filePath) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setAttachmentError(t('attachments.maxFileSize'));
          return null;
        }
        const resolve = (
          accomplish as {
            resolveDroppedFile?: (n: string, c: string, b?: boolean) => Promise<{ path: string }>;
          }
        ).resolveDroppedFile;
        if (!resolve) {
          return null;
        }
        const type = getAttachmentType(file);
        const isTextLike = type === 'text' || type === 'document';
        try {
          if (isTextLike && file.size <= MAX_FILE_SIZE_BYTES) {
            const content = await file.text();
            const result = await resolve(file.name, content, false);
            filePath = result.path;
          } else if (file.size <= MAX_FILE_SIZE_BYTES) {
            const buf = await file.arrayBuffer();
            const bytes = new Uint8Array(buf);
            const chunk = 8192;
            let binary = '';
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            const base64 = btoa(binary);
            const result = await resolve(file.name, base64, true);
            filePath = result.path;
          }
        } catch {
          return null;
        }
        if (!filePath) {
          return null;
        }
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setAttachmentError(t('attachments.maxFileSize'));
        return null;
      }
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        path: filePath,
        type: getAttachmentType(file),
        size: file.size,
      };
    },
    [t, accomplish, setAttachmentError],
  );

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) {
        return;
      }
      setAttachmentError(null);
      const remainingSlots = MAX_ATTACHMENTS - attachments.length;
      if (remainingSlots <= 0) {
        setAttachmentError(t('attachments.maxFiles'));
        return;
      }
      if (files.length > remainingSlots) {
        setAttachmentError(t('attachments.maxFiles'));
      }
      const next = [...attachments];
      for (let i = 0; i < files.length && next.length < MAX_ATTACHMENTS; i++) {
        const file = files[i];
        const att = await fileToAttachment(file);
        if (att && !next.some((a) => a.path === att.path)) {
          next.push(att);
        }
      }
      setAttachments(next.slice(0, MAX_ATTACHMENTS));
    },
    [attachments, fileToAttachment, t],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      const toRemove = attachments.find((a) => a.id === id);
      if (toRemove?.path) {
        const deleteDropped = (accomplish as { deleteDroppedFile?: (p: string) => Promise<void> })
          .deleteDroppedFile;
        if (deleteDropped) {
          deleteDropped(toRemove.path).catch(() => {});
        }
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      setAttachmentError(null);
    },
    [attachments, accomplish],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

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

  const submitTooltipText = (() => {
    if (isOverLimit) {
      return t('buttons.messageTooLong');
    }
    if (!value.trim() && attachments.length === 0) {
      return t('buttons.enterMessage');
    }
    return t('buttons.submit');
  })();

  // Auto-submit once the parent value reflects the transcription.
  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled || isOverLimit) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      const forConfig: TaskInputAttachment[] = attachments.map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        type: a.type,
        size: a.size,
      }));
      onSubmit(value.trim(), forConfig.length > 0 ? forConfig : undefined);
      queueMicrotask(() => setAttachments([]));
    }
  }, [autoSubmitOnTranscription, isDisabled, isOverLimit, onSubmit, value, attachments]);

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
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        const forConfig: TaskInputAttachment[] = attachments.map((a) => ({
          id: a.id,
          name: a.name,
          path: a.path,
          type: a.type,
          size: a.size,
        }));
        onSubmit(value.trim(), forConfig.length > 0 ? forConfig : undefined);
        setAttachments([]);
      }
    }
  };

  const handleSubmitClick = () => {
    const forConfig: TaskInputAttachment[] = attachments.map((a) => ({
      id: a.id,
      name: a.name,
      path: a.path,
      type: a.type,
      size: a.size,
    }));
    onSubmit(value.trim(), forConfig.length > 0 ? forConfig : undefined);
    setAttachments([]);
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

  return (
    <div className="w-full space-y-2">
      {/* Error message */}
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

      {/* Attachment validation error */}
      {attachmentError && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <WarningCircle className="h-4 w-4 shrink-0" />
          <AlertDescription className="text-xs leading-tight">{attachmentError}</AlertDescription>
        </Alert>
      )}

      {/* Input container - drop zone, chips, textarea, toolbar */}
      <div
        role="group"
        aria-label={t('attachments.dropFilesHere')}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${
          dragOver ? 'border-dashed border-2 border-primary' : 'border-border'
        }`}
      >
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-2" data-testid="task-input-attachments">
            {attachments.map((att) => (
              <span
                key={att.id}
                data-testid={`attachment-chip-${att.id}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
              >
                {att.type === 'image' && <Image className="h-3.5 w-3.5 shrink-0" />}
                {att.type === 'text' && <FileText className="h-3.5 w-3.5 shrink-0" />}
                {att.type === 'document' && <FileCode className="h-3.5 w-3.5 shrink-0" />}
                {att.type === 'other' && <File className="h-3.5 w-3.5 shrink-0" />}
                <span className="max-w-[120px] truncate" title={att.name}>
                  {att.name}
                </span>
                <span className="text-muted-foreground">{formatFileSize(att.size)}</span>
                <button
                  type="button"
                  aria-label={t('attachments.removeAria')}
                  onClick={() => removeAttachment(att.id)}
                  className="shrink-0 rounded p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="task-input-file-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Toolbar - fixed at bottom */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          {/* Plus Menu and file input trigger on left */}
          <div className="flex items-center gap-1">
            <PlusMenu
              onSkillSelect={handleSkillSelect}
              onOpenSettings={(tab) => onOpenSettings?.(tab)}
              onAttachFilesClick={() => fileInputRef.current?.click()}
              disabled={isDisabled || speechInput.isRecording}
            />
            <button
              type="button"
              aria-label={t('attachments.attachFiles')}
              disabled={
                isDisabled || speechInput.isRecording || attachments.length >= MAX_ATTACHMENTS
              }
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
            </button>
          </div>

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
                      context: { prompt: value, attachmentCount: attachments.length },
                    });
                    handleSubmitClick();
                  }}
                  disabled={!canSubmit || speechInput.isRecording}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 ease-accomplish hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isLoading ? (
                    <SpinnerGap className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowBendDownLeft className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <span>{submitTooltipText}</span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
