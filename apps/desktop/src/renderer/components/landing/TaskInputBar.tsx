'use client';

import { useRef, useEffect, useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import {
  CornerDownLeft,
  Loader2,
  AlertCircle,
  Paperclip,
  X,
  Image as ImageIcon,
  FileText,
  File as FileIcon,
} from 'lucide-react';
import { PROMPT_DEFAULT_MAX_LENGTH } from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';
import { cn } from '@/lib/utils';
import {
  type FileAttachment,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_ATTACHMENT_SIZE_BYTES,
  createFileAttachment,
  buildPromptWithAttachments,
  formatAttachmentSize,
  getAttachmentPath,
  getAttachmentTypeLabel,
  toAttachmentKey,
} from '../../lib/task-attachments';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  attachments?: FileAttachment[];
  onAttachmentsChange?: Dispatch<SetStateAction<FileAttachment[]>>;
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
  attachments = [],
  onAttachmentsChange,
  placeholder = 'Assign a task or ask anything',
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
  onOpenSpeechSettings,
  onOpenSettings,
  onOpenModelSettings,
  hideModelWhenNoModel = false,
  autoSubmitOnTranscription = true,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const attachmentsRef = useRef<FileAttachment[]>(attachments);
  const [dragOver, setDragOver] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);
  const accomplish = getAccomplish();

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
  const dragAndDropDisabled = isDisabled || isProcessingAttachments || speechInput.isRecording;
  const isOverLimit =
    buildPromptWithAttachments(value, attachments).length > PROMPT_DEFAULT_MAX_LENGTH;
  const hasInput = !!value.trim() || attachments.length > 0;
  const canSubmit = hasInput && !isDisabled && !isOverLimit && !isProcessingAttachments;

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-submit once the parent value reflects the transcription.
  useEffect(() => {
    if (!autoSubmitOnTranscription || isDisabled || isOverLimit || isProcessingAttachments) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isDisabled, isOverLimit, isProcessingAttachments, onSubmit, value]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Keep a live snapshot to avoid stale attachment writes during async processing.
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

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

  const getAttachmentIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
      case 'text':
      case 'document':
        return <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
      default:
        return <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    }
  };

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    if (!onAttachmentsChange) {
      return;
    }

    onAttachmentsChange((previousAttachments) => {
      const nextAttachments = previousAttachments.filter((attachment) => attachment.id !== attachmentId);
      attachmentsRef.current = nextAttachments;
      return nextAttachments;
    });
    setAttachmentError(null);
  }, [onAttachmentsChange]);

  const processDroppedFiles = useCallback(async (droppedFiles: File[]) => {
    if (!onAttachmentsChange || droppedFiles.length === 0 || dragAndDropDisabled) {
      return;
    }

    const currentAttachments = attachmentsRef.current;
    const availableSlots = MAX_ATTACHMENTS_PER_TASK - currentAttachments.length;
    if (availableSlots <= 0) {
      setAttachmentError(`Only ${MAX_ATTACHMENTS_PER_TASK} files can be attached to a task.`);
      return;
    }

    const existingKeys = new Set(
      currentAttachments.map((attachment) => toAttachmentKey(attachment.path, attachment.size))
    );

    const acceptedFiles: File[] = [];
    let duplicateCount = 0;
    let oversizedCount = 0;
    let overflowCount = 0;

    for (const file of droppedFiles) {
      const key = toAttachmentKey(getAttachmentPath(file), file.size);
      if (existingKeys.has(key)) {
        duplicateCount += 1;
        continue;
      }

      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        oversizedCount += 1;
        continue;
      }

      if (acceptedFiles.length >= availableSlots) {
        overflowCount += 1;
        continue;
      }

      acceptedFiles.push(file);
      existingKeys.add(key);
    }

    if (acceptedFiles.length === 0) {
      const reasons: string[] = [];
      if (oversizedCount > 0) {
        reasons.push(`${oversizedCount} file(s) exceed the 10 MB limit`);
      }
      if (duplicateCount > 0) {
        reasons.push(`${duplicateCount} duplicate file(s) skipped`);
      }
      if (overflowCount > 0) {
        reasons.push(`Only ${MAX_ATTACHMENTS_PER_TASK} files can be attached`);
      }
      setAttachmentError(reasons.join('. ') || 'No valid files were dropped.');
      return;
    }

    setIsProcessingAttachments(true);
    try {
      const createdAttachments: FileAttachment[] = [];
      for (const file of acceptedFiles) {
        createdAttachments.push(await createFileAttachment(file));
      }

      onAttachmentsChange((previousAttachments) => {
        const nextAttachments = [...previousAttachments];
        const seenKeys = new Set(
          previousAttachments.map((attachment) => toAttachmentKey(attachment.path, attachment.size))
        );

        for (const createdAttachment of createdAttachments) {
          if (nextAttachments.length >= MAX_ATTACHMENTS_PER_TASK) {
            break;
          }

          const key = toAttachmentKey(createdAttachment.path, createdAttachment.size);
          if (seenKeys.has(key)) {
            continue;
          }

          seenKeys.add(key);
          nextAttachments.push(createdAttachment);
        }

        attachmentsRef.current = nextAttachments;
        return nextAttachments;
      });
    } finally {
      setIsProcessingAttachments(false);
    }

    const warnings: string[] = [];
    if (oversizedCount > 0) {
      warnings.push(`${oversizedCount} file(s) exceed the 10 MB limit`);
    }
    if (duplicateCount > 0) {
      warnings.push(`${duplicateCount} duplicate file(s) skipped`);
    }
    if (overflowCount > 0) {
      warnings.push(`Only ${MAX_ATTACHMENTS_PER_TASK} files can be attached`);
    }
    setAttachmentError(warnings.length > 0 ? warnings.join('. ') : null);
  }, [dragAndDropDisabled, onAttachmentsChange]);

  const containsFileDragData = (event: React.DragEvent) => {
    const hasFileItems = Array.from(event.dataTransfer.items ?? []).some((item) => item.kind === 'file');
    if (hasFileItems) {
      return true;
    }

    const dragTypes = new Set(Array.from(event.dataTransfer.types ?? []));
    if (
      dragTypes.has('Files') ||
      dragTypes.has('application/x-moz-file') ||
      dragTypes.has('public.file-url')
    ) {
      return true;
    }

    return false;
  };

  const handleAttachFilesClick = () => {
    if (dragAndDropDisabled) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selectedFiles.length === 0) {
      return;
    }
    await processDroppedFiles(selectedFiles);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    if (!containsFileDragData(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (dragAndDropDisabled) {
      return;
    }
    dragDepthRef.current += 1;
    setDragOver(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!containsFileDragData(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (dragAndDropDisabled) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (dragAndDropDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragOver(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (dragAndDropDisabled) {
      return;
    }

    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length === 0) {
      return;
    }
    await processDroppedFiles(droppedFiles);
  };

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
                Retry
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {attachmentError && (
        <Alert
          variant="destructive"
          className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs leading-tight">
            {attachmentError}
          </AlertDescription>
        </Alert>
      )}

      {/* Input container - two rows: textarea top, toolbar bottom */}
      <div
        className={cn(
          'relative rounded-xl border border-border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
          dragOver && 'border-dashed border-primary bg-primary/5'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/10">
            <span className="rounded-md bg-background/90 px-3 py-1 text-xs font-medium shadow-sm">
              Drop files to attach (max {MAX_ATTACHMENTS_PER_TASK}, 10 MB each)
            </span>
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

        {(attachments.length > 0 || isProcessingAttachments) && (
          <div className="px-4 pb-2 space-y-2">
            {attachments.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>
                      {attachments.length}/{MAX_ATTACHMENTS_PER_TASK} files attached
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="inline-flex max-w-[260px] items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex min-w-0 cursor-default items-center gap-1.5">
                            {getAttachmentIcon(attachment.type)}
                            <span className="truncate text-xs text-foreground">
                              {attachment.name}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent align="start" side="top" className="max-w-[340px] p-3">
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs font-medium">{attachment.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {getAttachmentTypeLabel(attachment.type)} - {formatAttachmentSize(attachment.size)}
                              </div>
                            </div>
                            <div className="max-w-[320px] break-all text-[11px] text-muted-foreground">
                              {attachment.path}
                            </div>
                            {attachment.type === 'image' && attachment.preview && (
                              <img
                                src={attachment.preview}
                                alt={attachment.name}
                                className="max-h-[200px] max-w-[300px] rounded border border-border object-contain"
                              />
                            )}
                            {attachment.type !== 'image' && attachment.preview && (
                              <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap rounded border border-border bg-muted/50 p-2 text-[11px] leading-relaxed">
                                {attachment.preview}
                              </pre>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(attachment.id)}
                        aria-label={`Remove ${attachment.name}`}
                        className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {isProcessingAttachments && (
              <div className="text-xs text-muted-foreground">Processing dropped files...</div>
            )}
          </div>
        )}

        {/* Toolbar - fixed at bottom */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          {/* Plus Menu on left */}
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            onAttachFiles={handleAttachFilesClick}
            disabled={isDisabled || speechInput.isRecording || isProcessingAttachments}
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
                aria-label="Submit"
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
                  ? 'Message is too long'
                  : isProcessingAttachments
                    ? 'Processing files'
                    : !hasInput
                      ? 'Enter a message'
                      : 'Submit'}
              </span>
            </TooltipContent>
          </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
