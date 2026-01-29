/**
 * Integration tests for TaskInputBar drag-and-drop file attachment functionality
 * Tests file attachment features including drag-and-drop, validation, and removal
 * @module __tests__/integration/renderer/components/TaskInputBar.dragdrop.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TaskInputBar from '@/components/landing/TaskInputBar';
import type { FileAttachment } from '@accomplish/shared';

// Mock accomplish API
const mockAccomplish = {
  logEvent: vi.fn().mockResolvedValue(undefined),
  getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', id: 'claude-3-opus' }),
  getOllamaConfig: vi.fn().mockResolvedValue(null),
  isE2EMode: vi.fn().mockResolvedValue(false),
  getProviderSettings: vi.fn().mockResolvedValue({
    activeProviderId: 'anthropic',
    connectedProviders: {
      anthropic: {
        providerId: 'anthropic',
        connectionStatus: 'connected',
        selectedModelId: 'claude-3-5-sonnet-20241022',
        credentials: { type: 'api-key', apiKey: 'test-key' },
      },
    },
    debugMode: false,
  }),
  setActiveProvider: vi.fn().mockResolvedValue(undefined),
  setConnectedProvider: vi.fn().mockResolvedValue(undefined),
  removeConnectedProvider: vi.fn().mockResolvedValue(undefined),
  setProviderDebugMode: vi.fn().mockResolvedValue(undefined),
  validateApiKeyForProvider: vi.fn().mockResolvedValue({ valid: true }),
  validateBedrockCredentials: vi.fn().mockResolvedValue({ valid: true }),
  saveBedrockCredentials: vi.fn().mockResolvedValue(undefined),
  // Speech input mocks (required by useSpeechInput hook from upstream)
  speechIsConfigured: vi.fn().mockResolvedValue(false),
  speechTranscribe: vi.fn().mockResolvedValue({ success: true, result: { text: '' } }),
};

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Helper to create mock files
const createMockFile = (name: string, size: number, type: string): File => {
  const file = new File(['test content'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

// Helper to create mock image file with data URL
const createMockImageFile = (name: string, size: number): File => {
  return createMockFile(name, size, 'image/png');
};

describe('TaskInputBar Drag and Drop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('drag and drop visual feedback', () => {
    it('should show dashed border on drag enter', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      expect(dropZone).toBeTruthy();

      // Simulate drag enter
      fireEvent.dragEnter(dropZone!, {
        dataTransfer: { files: [] },
      });

      // Check for dashed border classes
      expect(dropZone?.className).toContain('border-dashed');
      expect(dropZone?.className).toContain('border-primary');
    });

    it('should remove dashed border on drag leave', () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');

      // Drag enter then leave
      fireEvent.dragEnter(dropZone!, {
        dataTransfer: { files: [] },
      });
      fireEvent.dragLeave(dropZone!, {
        dataTransfer: { files: [] },
        currentTarget: dropZone,
        target: dropZone,
      });

      // Border should return to normal
      expect(dropZone?.className).toContain('border-border');
      expect(dropZone?.className).not.toContain('border-dashed');
    });
  });

  describe('file attachment handling', () => {
    it('should display file chip after dropping a file', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const file = createMockFile('test.txt', 1024, 'text/plain');

      // Drop file
      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      // Wait for file to be processed
      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      // Check that onAttachmentsChange was called
      expect(onAttachmentsChange).toHaveBeenCalled();
    });

    it('should display multiple files after dropping them', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const files = [
        createMockFile('file1.txt', 1024, 'text/plain'),
        createMockFile('file2.js', 2048, 'application/javascript'),
        createMockFile('file3.png', 3072, 'image/png'),
      ];

      fireEvent.drop(dropZone!, {
        dataTransfer: { files },
      });

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('file2.js')).toBeInTheDocument();
        expect(screen.getByText('file3.png')).toBeInTheDocument();
      });
    });

    it('should show file size in human-readable format', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const file = createMockFile('test.txt', 1536, 'text/plain'); // 1.5 KB

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText(/1\.5 KB/)).toBeInTheDocument();
      });
    });
  });

  describe('file validation', () => {
    it('should show error when dropping more than 5 files', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const files = Array.from({ length: 6 }, (_, i) =>
        createMockFile(`file${i}.txt`, 1024, 'text/plain')
      );

      fireEvent.drop(dropZone!, {
        dataTransfer: { files },
      });

      await waitFor(() => {
        expect(screen.getByText('Maximum 5 files allowed')).toBeInTheDocument();
      });
    });

    it('should show error when file exceeds 10MB', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const largeFile = createMockFile('large.pdf', 11 * 1024 * 1024, 'application/pdf'); // 11MB

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [largeFile] },
      });

      await waitFor(() => {
        expect(screen.getByText(/exceeds 10MB limit/)).toBeInTheDocument();
      });
    });

    it('should accept valid files within limits', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const validFile = createMockFile('valid.txt', 5 * 1024 * 1024, 'text/plain'); // 5MB

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [validFile] },
      });

      await waitFor(() => {
        expect(screen.getByText('valid.txt')).toBeInTheDocument();
      });

      // Should not show error
      expect(screen.queryByText(/exceeds 10MB limit/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Maximum 5 files allowed/)).not.toBeInTheDocument();
    });
  });

  describe('file removal', () => {
    it('should remove file when clicking remove button', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const file = createMockFile('removeme.txt', 1024, 'text/plain');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText('removeme.txt')).toBeInTheDocument();
      });

      // Find and click remove button
      const removeButton = screen.getByTitle('Remove file');
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText('removeme.txt')).not.toBeInTheDocument();
      });
    });

    it('should remove correct file when multiple files are attached', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const files = [
        createMockFile('file1.txt', 1024, 'text/plain'),
        createMockFile('file2.txt', 1024, 'text/plain'),
        createMockFile('file3.txt', 1024, 'text/plain'),
      ];

      fireEvent.drop(dropZone!, {
        dataTransfer: { files },
      });

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('file2.txt')).toBeInTheDocument();
        expect(screen.getByText('file3.txt')).toBeInTheDocument();
      });

      // Remove middle file
      const allRemoveButtons = screen.getAllByTitle('Remove file');
      fireEvent.click(allRemoveButtons[1]);

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.queryByText('file2.txt')).not.toBeInTheDocument();
        expect(screen.getByText('file3.txt')).toBeInTheDocument();
      });
    });

    it('should clear error when removing files', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const largeFile = createMockFile('large.pdf', 11 * 1024 * 1024, 'application/pdf');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [largeFile] },
      });

      await waitFor(() => {
        expect(screen.getByText(/exceeds 10MB limit/)).toBeInTheDocument();
      });

      // Drop a valid file
      const validFile = createMockFile('valid.txt', 1024, 'text/plain');
      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [validFile] },
      });

      await waitFor(() => {
        expect(screen.getByText('valid.txt')).toBeInTheDocument();
      });

      // Remove the valid file
      const removeButton = screen.getByTitle('Remove file');
      fireEvent.click(removeButton);

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/exceeds 10MB limit/)).not.toBeInTheDocument();
      });
    });
  });

  describe('file type detection', () => {
    it('should detect image files correctly', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const imageFile = createMockImageFile('photo.png', 1024);

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [imageFile] },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalled();
        const calls = onAttachmentsChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        const attachments: FileAttachment[] = lastCall[0];
        expect(attachments.length).toBeGreaterThan(0);
        expect(attachments[0].type).toBe('image');
      });
    });

    it('should detect text files correctly', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const textFile = createMockFile('readme.md', 1024, 'text/markdown');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [textFile] },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalled();
        const calls = onAttachmentsChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        const attachments: FileAttachment[] = lastCall[0];
        expect(attachments.length).toBeGreaterThan(0);
        expect(attachments[0].type).toBe('text');
      });
    });

    it('should detect code files correctly (as text per spec)', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const codeFile = createMockFile('script.js', 1024, 'application/javascript');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [codeFile] },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalled();
        const calls = onAttachmentsChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        const attachments: FileAttachment[] = lastCall[0];
        expect(attachments.length).toBeGreaterThan(0);
        // Per spec, code files are treated as 'text' (include in prompt)
        expect(attachments[0].type).toBe('text');
      });
    });

    it('should detect PDF files correctly (as document per spec)', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const pdfFile = createMockFile('document.pdf', 1024, 'application/pdf');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [pdfFile] },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalled();
        const calls = onAttachmentsChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        const attachments: FileAttachment[] = lastCall[0];
        expect(attachments.length).toBeGreaterThan(0);
        // Per spec, PDF is 'document' type (extract text)
        expect(attachments[0].type).toBe('document');
      });
    });

    it('should detect other files correctly', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();
      const onAttachmentsChange = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
          onAttachmentsChange={onAttachmentsChange}
        />
      );

      const dropZone = container.querySelector('.space-y-2 > div');
      const otherFile = createMockFile('data.xyz', 1024, 'application/octet-stream');

      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [otherFile] },
      });

      await waitFor(() => {
        expect(onAttachmentsChange).toHaveBeenCalled();
        const calls = onAttachmentsChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        const attachments: FileAttachment[] = lastCall[0];
        expect(attachments.length).toBeGreaterThan(0);
        expect(attachments[0].type).toBe('other');
      });
    });
  });

  describe('integration with existing functionality', () => {
    it('should still allow text input with attachments present', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value=""
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      // Add a file
      const dropZone = container.querySelector('.space-y-2 > div');
      const file = createMockFile('test.txt', 1024, 'text/plain');
      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      // Type in textarea
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'Process this file' } });

      expect(onChange).toHaveBeenCalledWith('Process this file');
    });

    it('should include attachment count in submit event', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container } = render(
        <TaskInputBar
          value="Test task"
          onChange={onChange}
          onSubmit={onSubmit}
        />
      );

      // Add files
      const dropZone = container.querySelector('.space-y-2 > div');
      const files = [
        createMockFile('file1.txt', 1024, 'text/plain'),
        createMockFile('file2.txt', 1024, 'text/plain'),
      ];
      fireEvent.drop(dropZone!, {
        dataTransfer: { files },
      });

      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      // Submit
      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      expect(mockAccomplish.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            attachmentCount: 2,
          }),
        })
      );
    });

    it('should not break loading state with attachments', async () => {
      const onChange = vi.fn();
      const onSubmit = vi.fn();

      const { container, rerender } = render(
        <TaskInputBar
          value="Test"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={false}
        />
      );

      // Add file
      const dropZone = container.querySelector('.space-y-2 > div');
      const file = createMockFile('test.txt', 1024, 'text/plain');
      fireEvent.drop(dropZone!, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });

      // Set loading state
      rerender(
        <TaskInputBar
          value="Test"
          onChange={onChange}
          onSubmit={onSubmit}
          isLoading={true}
        />
      );

      // File should still be visible
      expect(screen.getByText('test.txt')).toBeInTheDocument();
      
      // Loading spinner should be visible
      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });
});
