'use client';

import { useRef, useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { analytics } from '../../lib/analytics';
import { CornerDownLeft, Loader2, X, File, Image, FileText } from 'lucide-react';

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  type: 'image' | 'text' | 'document' | 'other';
  preview?: string;
  size: number;
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
  attachments?: FileAttachment[];
  onAttachmentsChange?: (attachments: FileAttachment[]) => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const TEXT_TYPES = ['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.css', '.html'];
const DOCUMENT_TYPES = ['.pdf', '.doc', '.docx'];

export default function TaskInputBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Assign a task or ask anything',
  isLoading = false,
  disabled = false,
  large = false,
  autoFocus = false,
  attachments = [],
  onAttachmentsChange,
}: TaskInputBarProps) {
  const isDisabled = disabled || isLoading;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = getAccomplish();
  const [dragOver, setDragOver] = useState(false);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

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
      onSubmit();
    }
  };

  const getFileType = (fileName: string): FileAttachment['type'] => {
    const ext = fileName.toLowerCase();
    if (IMAGE_TYPES.some(type => ext.endsWith(type))) return 'image';
    if (TEXT_TYPES.some(type => ext.endsWith(type))) return 'text';
    if (DOCUMENT_TYPES.some(type => ext.endsWith(type))) return 'document';
    return 'other';
  };

  const processFiles = async (files: FileList) => {
    const newAttachments: FileAttachment[] = [];
    const currentCount = attachments.length;

    for (let i = 0; i < Math.min(files.length, MAX_FILES - currentCount); i++) {
      const file = files[i];

      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File ${file.name} exceeds 10MB limit`);
        continue;
      }

      const fileType = getFileType(file.name);
      let preview: string | undefined;

      // Generate preview for images
      if (fileType === 'image') {
        try {
          preview = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } catch (error) {
          console.error('Failed to generate preview:', error);
        }
      }

      newAttachments.push({
        id: `${Date.now()}_${i}`,
        name: file.name,
        path: (file as any).path || file.name, // Electron provides path property
        type: fileType,
        preview,
        size: file.size,
      });
    }

    if (onAttachmentsChange && newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDisabled) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (isDisabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const removeAttachment = (id: string) => {
    if (onAttachmentsChange) {
      onAttachmentsChange(attachments.filter(att => att.id !== id));
    }
  };

  const getFileIcon = (type: FileAttachment['type']) => {
    switch (type) {
      case 'image': return Image;
      case 'text': return FileText;
      default: return File;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const FileIcon = getFileIcon(attachment.type);
            return (
              <div
                key={attachment.id}
                className="group relative flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
              >
                {attachment.preview ? (
                  <img
                    src={attachment.preview}
                    alt={attachment.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <FileIcon className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="max-w-[150px] truncate text-foreground">
                  {attachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="ml-1 rounded p-0.5 hover:bg-background"
                  title="Remove attachment"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 shadow-sm transition-all duration-200 ease-accomplish focus-within:border-ring focus-within:ring-1 focus-within:ring-ring ${
          dragOver
            ? 'border-primary border-dashed bg-primary/5'
            : 'border-border'
        }`}
      >
        {/* Text input */}
        <textarea
          data-testid="task-input-textarea"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={dragOver ? 'Drop files here...' : placeholder}
          disabled={isDisabled}
          rows={1}
          className={`max-h-[200px] flex-1 resize-none bg-transparent text-foreground placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${large ? 'text-[20px]' : 'text-sm'}`}
        />

        {/* Submit button */}
        <button
          data-testid="task-input-submit"
          type="button"
          onClick={() => {
            analytics.trackSubmitTask();
            accomplish.logEvent({
              level: 'info',
              message: 'Task input submit clicked',
              context: { prompt: value },
            });
            onSubmit();
          }}
          disabled={!value.trim() || isDisabled}
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

      {/* Helper text */}
      {attachments.length === 0 && !dragOver && (
        <p className="text-xs text-muted-foreground px-1">
          Drag and drop files here or paste them (max {MAX_FILES} files, 10MB each)
        </p>
      )}
    </div>
  );
}
