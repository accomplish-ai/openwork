'use client';

import { useRef, useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, AlertCircle, X, Paperclip } from 'lucide-react';
import {
  PROMPT_DEFAULT_MAX_LENGTH,
  TASK_ATTACHMENT_MAX_FILES,
  TASK_ATTACHMENT_MAX_FILE_SIZE_BYTES,
  type TaskFileAttachment,
} from '@accomplish_ai/agent-core/common';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { ModelIndicator } from '../ui/ModelIndicator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusMenu } from './PlusMenu';

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

type DragFile = File & {
  path?: string;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml', '.csv',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs', '.c', '.cc', '.cpp',
  '.h', '.hpp', '.rb', '.php', '.sh', '.zsh', '.sql', '.css', '.scss', '.less', '.html', '.htm', '.log',
]);

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0) return '';
  return fileName.slice(idx).toLowerCase();
}

function classifyAttachmentType(fileName: string, mimeType: string): TaskFileAttachment['type'] {
  const ext = getFileExtension(fileName);
  if (mimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  if (
    mimeType === 'application/pdf'
    || ext === '.pdf'
    || ext === '.doc'
    || ext === '.docx'
    || ext === '.ppt'
    || ext === '.pptx'
  ) {
    return 'document';
  }
  return 'other';
}

function filePathToSrc(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return encodeURI(`file://${withLeadingSlash}`);
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
  const isOverLimit = value.length > PROMPT_DEFAULT_MAX_LENGTH;
  const canSubmit = !!value.trim() && !isDisabled && !isOverLimit;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
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

  const mergeAttachments = (
    incoming: TaskFileAttachment[],
    existing: TaskFileAttachment[]
  ): { attachments: TaskFileAttachment[]; error: string | null } => {
    if (incoming.length === 0) {
      return { attachments: existing, error: null };
    }

    const validIncoming = incoming.filter((file) => file.size <= TASK_ATTACHMENT_MAX_FILE_SIZE_BYTES);
    const oversize = validIncoming.length !== incoming.length;

    const combined = [...existing];
    for (const attachment of validIncoming) {
      // Check for duplicates by path (more logical for files)
      if (combined.some((item) => item.path === attachment.path)) {
        continue;
      }
      // Ensure the attachment has an ID
      if (!attachment.id) {
        attachment.id = crypto.randomUUID();
      }
      combined.push(attachment);
    }

    const sliced = combined.slice(0, TASK_ATTACHMENT_MAX_FILES);
    if (oversize) {
      return {
        attachments: sliced,
        error: `Each file must be 10MB or less.`,
      };
    }
    if (combined.length > TASK_ATTACHMENT_MAX_FILES) {
      return {
        attachments: sliced,
        error: `You can attach up to ${TASK_ATTACHMENT_MAX_FILES} files.`,
      };
    }
    return { attachments: sliced, error: null };
  };

  const applyAttachments = (next: TaskFileAttachment[]) => {
    onAttachmentsChange?.(next);
  };

  const handleAttachFiles = async () => {
    try {
      const picked = await accomplish.pickTaskFiles();
      // Add IDs and previews to picked files
      const processedPicked = await Promise.all(
        picked.map(async (file) => {
          if (!file.id) {
            // For files picked through the picker, we need to generate preview
            const preview = await generateFilePreview(
              { 
                name: file.name, 
                size: file.size, 
                type: '', 
                path: file.path 
              } as DragFile, 
              file.type
            );
            return {
              ...file,
              id: crypto.randomUUID(),
              preview,
            };
          }
          return file;
        })
      );
      const { attachments: merged, error } = mergeAttachments(processedPicked, attachments);
      applyAttachments(merged);
      setAttachmentError(error);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'Failed to attach files.');
    }
  };

  const removeAttachment = (id: string) => {
    setAttachmentError(null);
    applyAttachments(attachments.filter((attachment) => attachment.id !== id));
  };

  const generateFilePreview = async (file: DragFile, type: TaskFileAttachment['type']): Promise<string | undefined> => {
    if (type === 'image') {
      // Generate base64 preview for images
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    } else if (type === 'text') {
      // Read first 100 characters for text files
      try {
        const text = await file.text();
        return text.substring(0, 100);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const toAttachmentFromDragFile = async (file: DragFile): Promise<TaskFileAttachment | null> => {
    // Try multiple ways to get the file path
    let filePath = '';
    
    // Method 1: Direct path property (Electron)
    if (typeof file.path === 'string' && file.path) {
      filePath = file.path;
    }
    // Method 2: Try to get path from webkitRelativePath (for some drag scenarios)
    else if (file.webkitRelativePath) {
      filePath = file.webkitRelativePath;
    }
    // Method 3: Fallback - create a temporary path using the file name
    else {
      // For files without a path, we can still process them by reading content
      // but we need a placeholder path for the attachment system
      filePath = file.name || `dropped-file-${Date.now()}`;
    }

    const fileType = classifyAttachmentType(file.name, file.type || '');
    const preview = await generateFilePreview(file, fileType);

    return {
      id: crypto.randomUUID(),
      path: filePath,
      name: file.name || filePath.split(/[\\/]/).pop() || filePath,
      size: file.size,
      type: fileType,
      preview,
    };
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isDisabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragOver(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isDisabled) return;

    const files = event.dataTransfer.files;
    if (!files || files.length === 0) {
      setAttachmentError('No files found in drop event.');
      return;
    }

    console.log('Dropped files:', Array.from(files).map(f => ({ name: f.name, path: (f as DragFile).path })));

    try {
      const droppedPromises = Array.from(files).map((file) => toAttachmentFromDragFile(file as DragFile));
      const droppedResults = await Promise.all(droppedPromises);
      const dropped = droppedResults.filter((file): file is TaskFileAttachment => file !== null);

      if (dropped.length === 0) {
        setAttachmentError('Could not process dropped files. Please try selecting files using the attachment button instead.');
        return;
      }

      const { attachments: merged, error } = mergeAttachments(dropped, attachments);
      applyAttachments(merged);
      setAttachmentError(error);
    } catch (error) {
      setAttachmentError('Failed to process dropped files.');
      console.error('Drop processing error:', error);
    }
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
          <AlertDescription className="text-xs leading-tight">{attachmentError}</AlertDescription>
        </Alert>
      )}

      {/* Input container - two rows: textarea top, toolbar bottom */}
      <div
        className={`rounded-xl border bg-background shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${
          isDragOver ? 'border-primary ring-1 ring-primary' : 'border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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
        {attachments.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2" data-testid="task-input-attachments">
            {attachments.map((attachment) => (
              <Tooltip key={attachment.id}>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 max-w-full cursor-pointer hover:bg-muted/60 transition-colors"
                    data-testid="task-input-attachment-item"
                  >
                    {attachment.type === 'image' ? (
                      <img
                        src={filePathToSrc(attachment.path)}
                        alt={attachment.name}
                        className="h-8 w-8 rounded object-cover bg-muted"
                      />
                    ) : (
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="max-w-[220px] truncate text-xs text-foreground" title={attachment.path}>
                      {attachment.name}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAttachment(attachment.id);
                      }}
                      aria-label={`Remove ${attachment.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md">
                  <div className="space-y-2">
                    <div className="font-medium">{attachment.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {attachment.type === 'image' && attachment.preview && (
                        <img 
                          src={attachment.preview} 
                          alt={attachment.name} 
                          className="max-w-[200px] max-h-[200px] rounded object-cover"
                        />
                      )}
                      {attachment.type === 'text' && attachment.preview && (
                        <div className="font-mono text-xs bg-muted p-2 rounded max-h-[100px] overflow-hidden">
                          {attachment.preview}...
                        </div>
                      )}
                      {attachment.type === 'document' && (
                        <div>Document file • {(attachment.size / 1024).toFixed(1)}KB</div>
                      )}
                      {attachment.type === 'other' && (
                        <div>File • {(attachment.size / 1024).toFixed(1)}KB</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {attachment.path}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Toolbar - fixed at bottom */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
          {/* Plus Menu on left */}
          <PlusMenu
            onSkillSelect={handleSkillSelect}
            onOpenSettings={(tab) => onOpenSettings?.(tab)}
            onAttachFiles={handleAttachFiles}
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
              <span>{isOverLimit ? 'Message is too long' : !value.trim() ? 'Enter a message' : 'Submit'}</span>
            </TooltipContent>
          </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
