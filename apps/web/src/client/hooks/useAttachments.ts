import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskAttachment } from '@accomplish_ai/agent-core/common';

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

export interface UseAttachmentsOptions {
  maxFiles?: number;
  maxSizeBytes?: number;
}

export interface UseAttachmentsReturn {
  attachments: TaskAttachment[];
  error: string | null;
  isDragging: boolean;
  isProcessing: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  clearError: () => void;
  openFilePicker: () => void;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  handlePaste: (e: React.ClipboardEvent) => void;
}

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsReturn {
  const { maxFiles = DEFAULT_MAX_FILES, maxSizeBytes = DEFAULT_MAX_SIZE_BYTES } = options;

  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<TaskAttachment[]>([]);
  const isProcessing = pendingCount > 0;

  // Keep ref in sync so processFiles can read current count without state updater side effects
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPTED_TYPES.join(',');
    input.style.display = 'none';
    document.body.appendChild(input);
    fileInputRef.current = input;

    return () => {
      document.body.removeChild(input);
      fileInputRef.current = null;
    };
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = maxFiles - attachmentsRef.current.length;

      if (remaining <= 0) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const toProcess = fileArray.slice(0, remaining);
      if (fileArray.length > remaining) {
        setError(`Only ${remaining} more file${remaining === 1 ? '' : 's'} allowed`);
      }

      let validCount = 0;
      for (const file of toProcess) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`${file.name} is not a supported image type`);
          continue;
        }
        if (file.size > maxSizeBytes) {
          const maxMB = Math.round(maxSizeBytes / (1024 * 1024));
          setError(`${file.name} exceeds ${maxMB}MB limit`);
          continue;
        }
        validCount++;

        const reader = new FileReader();
        reader.onload = () => {
          const data = reader.result as string;
          setAttachments((current) => {
            if (current.some((a) => a.data === data)) {
              return current;
            }
            if (current.length >= maxFiles) {
              return current;
            }
            return [...current, { type: 'screenshot', data, label: file.name }];
          });
          setPendingCount((c) => Math.max(0, c - 1));
        };
        reader.onerror = () => {
          setError(`Failed to read ${file.name}`);
          setPendingCount((c) => Math.max(0, c - 1));
        };
        reader.readAsDataURL(file);
      }
      if (validCount > 0) {
        setPendingCount((c) => c + validCount);
      }
    },
    [maxFiles, maxSizeBytes],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }
    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        addFiles(input.files);
      }
      input.value = '';
    };
    input.click();
  }, [addFiles]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFiles.length > 0) {
          addFiles(imageFiles);
        }
      }
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
          e.preventDefault();
          addFiles(imageFiles);
        }
      }
    },
    [addFiles],
  );

  return {
    attachments,
    error,
    isDragging,
    isProcessing,
    addFiles,
    removeAttachment,
    clearAttachments,
    clearError,
    openFilePicker,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
    handlePaste,
  };
}
