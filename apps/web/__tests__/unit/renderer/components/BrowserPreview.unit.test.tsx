/**
 * Unit tests for BrowserPreview component
 *
 * Tests the live browser preview component that subscribes
 * to IPC frame events and displays streaming JPEG images.
 *
 * @module __tests__/unit/renderer/components/BrowserPreview.unit.test
 * @vitest-environment jsdom
 */

/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserPreview } from '../../../../src/client/components/BrowserPreview';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...rest
    }: {
      children?: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} data-testid={rest['data-testid'] as string}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Globe: () => <span data-testid="icon-globe" />,
  Loader2: () => <span data-testid="icon-loader" />,
  AlertCircle: () => <span data-testid="icon-alert" />,
  Monitor: () => <span data-testid="icon-monitor" />,
}));

describe('BrowserPreview', () => {
  let mockStartScreencast: ReturnType<typeof vi.fn>;
  let mockStopScreencast: ReturnType<typeof vi.fn>;
  let frameCallback: ((frame: { data: string; pageUrl: string; timestamp: number }) => void) | null;
  let statusCallback: ((status: { status: string; error?: string }) => void) | null;

  beforeEach(() => {
    frameCallback = null;
    statusCallback = null;
    mockStartScreencast = vi.fn().mockResolvedValue(undefined);
    mockStopScreencast = vi.fn().mockResolvedValue(undefined);

    const mockApi = {
      startBrowserScreencast: mockStartScreencast,
      stopBrowserScreencast: mockStopScreencast,
      onBrowserFrame: vi.fn((cb: typeof frameCallback) => {
        frameCallback = cb;
        return () => {
          frameCallback = null;
        };
      }),
      onBrowserStatus: vi.fn((cb: typeof statusCallback) => {
        statusCallback = cb;
        return () => {
          statusCallback = null;
        };
      }),
    };

    (window as unknown as Record<string, unknown>).accomplish = mockApi;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).accomplish;
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the component with the page name', () => {
      render(<BrowserPreview pageName="test-page" />);
      expect(screen.getByText('test-page')).toBeInTheDocument();
    });

    it('should show connecting state initially', () => {
      render(<BrowserPreview pageName="test-page" />);
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should render an img element for the frame', () => {
      render(<BrowserPreview pageName="test-page" />);
      const img = screen.getByAltText('Browser preview');
      expect(img).toBeInTheDocument();
    });
  });

  describe('screencast lifecycle', () => {
    it('should call startBrowserScreencast on mount', async () => {
      render(<BrowserPreview pageName="my-page" />);
      await waitFor(() => {
        expect(mockStartScreencast).toHaveBeenCalledWith('my-page');
      });
    });

    it('should subscribe to frame and status events', () => {
      render(<BrowserPreview pageName="my-page" />);
      const api = (window as unknown as Record<string, unknown>).accomplish as Record<
        string,
        ReturnType<typeof vi.fn>
      >;
      expect(api.onBrowserFrame).toHaveBeenCalledOnce();
      expect(api.onBrowserStatus).toHaveBeenCalledOnce();
    });

    it('should call stopBrowserScreencast on unmount', () => {
      const { unmount } = render(<BrowserPreview pageName="my-page" />);
      unmount();
      expect(mockStopScreencast).toHaveBeenCalledOnce();
    });

    it('should unsubscribe from events on unmount', () => {
      const { unmount } = render(<BrowserPreview pageName="my-page" />);
      expect(frameCallback).not.toBeNull();
      expect(statusCallback).not.toBeNull();
      unmount();
      expect(frameCallback).toBeNull();
      expect(statusCallback).toBeNull();
    });
  });

  describe('frame handling', () => {
    it('should update img src when a frame is received', async () => {
      render(<BrowserPreview pageName="test-page" />);
      const img = screen.getByAltText('Browser preview') as HTMLImageElement;

      frameCallback?.({
        data: 'dGVzdC1pbWFnZS1kYXRh',
        pageUrl: 'https://example.com',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(img.src).toBe('data:image/jpeg;base64,dGVzdC1pbWFnZS1kYXRh');
      });
    });

    it('should update the URL bar when page URL changes', async () => {
      render(<BrowserPreview pageName="test-page" />);

      frameCallback?.({
        data: 'AAAA',
        pageUrl: 'https://example.com/new-page',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('https://example.com/new-page')).toBeInTheDocument();
      });
    });

    it('should not re-render when URL stays the same', async () => {
      render(<BrowserPreview pageName="test-page" />);

      frameCallback?.({
        data: 'AAAA',
        pageUrl: 'https://example.com',
        timestamp: Date.now(),
      });

      await waitFor(() => {
        expect(screen.getByText('https://example.com')).toBeInTheDocument();
      });

      // Send another frame with the same URL — should not cause extra renders
      frameCallback?.({
        data: 'BBBB',
        pageUrl: 'https://example.com',
        timestamp: Date.now(),
      });

      // Image should be updated directly via ref
      const img = screen.getByAltText('Browser preview') as HTMLImageElement;
      expect(img.src).toBe('data:image/jpeg;base64,BBBB');
    });
  });

  describe('error handling', () => {
    it('should show error state when status reports error', async () => {
      render(<BrowserPreview pageName="test-page" />);

      statusCallback?.({ status: 'error', error: 'Connection failed' });

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument();
      });
    });

    it('should show error when startBrowserScreencast fails', async () => {
      mockStartScreencast.mockRejectedValueOnce(new Error('Server unreachable'));
      render(<BrowserPreview pageName="test-page" />);

      await waitFor(() => {
        expect(screen.getByText('Server unreachable')).toBeInTheDocument();
      });
    });
  });

  describe('graceful degradation', () => {
    it('should render without crashing when accomplish API is not available', () => {
      delete (window as unknown as Record<string, unknown>).accomplish;
      const { container } = render(<BrowserPreview pageName="test-page" />);
      expect(container).toBeTruthy();
    });
  });
});
