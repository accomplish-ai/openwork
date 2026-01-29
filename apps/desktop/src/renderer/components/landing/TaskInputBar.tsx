'use client';

import { useRef, useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { CornerDownLeft, Loader2, X, FileText, FileCode, FileImage, File, AlertCircle } from 'lucide-react';
import type { FileAttachment } from '@accomplish/shared';
import { useSpeechInput } from '../../hooks/useSpeechInput';
import { SpeechInputButton } from '../ui/SpeechInputButton';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TaskInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  large?: boolean;
  autoFocus?: boolean;
  onAttachmentsChange?: (attachments: FileAttachment[]) => void;
  /**
   * Called when user clicks mic button while voice input is not configured
   * (to open settings dialog)
   */
  onOpenSpeechSettings?: () => void;
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
  large = false,
  autoFocus = false,
  onAttachmentsChange,
  onOpenSpeechSettings,
  autoSubmitOnTranscription = true,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingAutoSubmitRef = useRef<string | null>(null);
  const dragCounterRef = useRef(0);
  const accomplish = getAccomplish();
  
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    if (!autoSubmitOnTranscription || isDisabled) {
      return;
    }
    if (pendingAutoSubmitRef.current && value === pendingAutoSubmitRef.current) {
      pendingAutoSubmitRef.current = null;
      onSubmit();
    }
  }, [autoSubmitOnTranscription, isDisabled, onSubmit, value]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Notify parent of attachment changes
  useEffect(() => {
    if (onAttachmentsChange) {
      onAttachmentsChange(attachments);
    }
  }, [attachments, onAttachmentsChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (Chinese/Japanese input)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // File type detection based on issue #190 spec
  const getFileType = (fileName: string): FileAttachment['type'] => {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    
    // Images (.png, .jpg, .gif) -> Send to vision model
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      return 'image';
    }
    // Text (.txt, .md, .json) and Code (.js, .py, .ts) -> Include in prompt
    if (['txt', 'md', 'markdown', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'php', 'swift', 'kt'].includes(ext)) {
      return 'text';
    }
    // PDF -> Extract text
    if (ext === 'pdf') {
      return 'document';
    }
    // Other -> Pass file path
    return 'other';
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Process files
  const processFiles = async (files: File[]) => {
    setError(null);

    const newAttachments: FileAttachment[] = [];

    for (const file of files) {
      // Skip folders/directories (they have size 0 and empty type)
      if (file.size === 0 && file.type === '') {
        continue;
      }

      // Validate file size (10MB per file)
      if (file.size > 10 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 10MB limit`);
        continue;
      }

      const fileType = getFileType(file.name);
      let preview: string | undefined;

      // Generate preview for images
      if (fileType === 'image') {
        try {
          preview = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } catch (err) {
          console.error('Failed to generate image preview:', err);
        }
      }

      // Generate preview for text files (includes code files per spec)
      if (fileType === 'text') {
        try {
          preview = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          // Limit preview to first 500 characters
          if (preview && preview.length > 500) {
            preview = preview.substring(0, 500) + '...';
          }
        } catch (err) {
          console.error('Failed to read text file:', err);
        }
      }

      newAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        path: file.name, // In browser context, we use name as path
        type: fileType,
        preview,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      });
    }

    // Validate total file count after filtering invalid files
    setAttachments(prev => {
      if (prev.length + newAttachments.length > 5) {
        setError('Maximum 5 files allowed');
        return prev;
      }
      return [...prev, ...newAttachments];
    });
  };

  // Drag handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);

    let files: File[] = [];
    let hasFolder = false;

    // Try to use items API for better folder detection
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const items = Array.from(e.dataTransfer.items);
      
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          // Check if it's a directory
          if (entry?.isDirectory) {
            hasFolder = true;
            continue;
          }
          // Only add files, not directories
          if (!entry || entry.isFile) {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }
      }
    } else {
      // Fallback to files API (for test environment or older browsers)
      files = Array.from(e.dataTransfer.files);
    }

    // Show error if user tried to drop folders
    if (hasFolder && files.length === 0) {
      setError('Folders are not supported, please drop files only');
      return;
    } else if (hasFolder) {
      setError('Folders were skipped, only files are supported');
    }
    
    if (files.length > 0) {
      processFiles(files);
    }
  };

  // Remove attachment
  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(att => att.id !== id));
    setError(null);
  };

  // Get icon for file type
  const getFileIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'image':
        return <FileImage className="h-4 w-4" />;
      case 'text':
        return <FileCode className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Speech error message */}
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

      {/* Input container */}
      <div
        className={`relative flex flex-col gap-2 rounded-xl bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish ${
          dragOver
            ? 'border-2 border-dashed border-primary bg-primary/5'
            : 'border border-border focus-within:border-ring focus-within:ring-1 focus-within:ring-ring'
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Text input and buttons row */}
        <div className="flex items-center gap-2">
          {/* Text input */}
          <textarea
            data-testid="task-input-textarea"
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled || speechInput.isRecording}
            rows={1}
            className={`max-h-[200px] flex-1 resize-none bg-transparent text-foreground placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${large ? 'text-[20px]' : 'text-sm'}`}
          />

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
          <button
            data-testid="task-input-submit"
            type="button"
            onClick={() => {
              accomplish.logEvent({
                level: 'info',
                message: 'Task input submit clicked',
                context: { prompt: value, attachmentCount: attachments.length },
              });
              onSubmit();
            }}
            disabled={!value.trim() || isDisabled || speechInput.isRecording}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 ease-accomplish hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            title="Submit"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CornerDownLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* File attachments */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-1.5 text-sm transition-all hover:border-primary/50 hover:bg-background"
              >
                {getFileIcon(attachment.type)}
                <span className="max-w-[150px] truncate">{attachment.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </span>
                <button
                  onClick={() => removeAttachment(attachment.id)}
                  className="ml-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Remove file"
                >
                  <X className="h-3 w-3" />
                </button>
                {/* Preview tooltip on hover */}
                {attachment.preview && (
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 hidden max-h-[200px] max-w-[300px] overflow-hidden rounded-lg border border-border bg-popover p-2 shadow-lg group-hover:block">
                    {attachment.type === 'image' ? (
                      <img
                        src={attachment.preview}
                        alt={attachment.name}
                        className="max-h-[180px] max-w-full rounded object-contain"
                      />
                    ) : (
                      <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {attachment.preview.substring(0, 500)}
                        {attachment.preview.length > 500 && '...'}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File error message */}
      {error && (
        <div className="text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
