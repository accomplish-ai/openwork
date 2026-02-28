/**
 * Integration tests for App component
 * Tests router setup and route rendering
 *
 * NOTE: This test follows React component integration testing principles:
 * - Mocks external boundaries (IPC API, analytics) - cannot run real Electron in vitest
 * - Mocks animation libraries (framer-motion) - for test stability
 * - Mocks child page components - to focus on App's coordination logic
 * - Uses real router (MemoryRouter) for route testing
 *
 * For full component rendering integration, see individual component tests.
 *
 * @module __tests__/integration/renderer/App.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  createMockAccomplish,
  createMockStoreState,
  framerMotionMock,
  analyticsMock,
  animationsMock,
} from './test-utils';

// Create mock objects at module level (before vi.mock calls for hoisting)
const mockAccomplish = createMockAccomplish();
let mockStoreState = createMockStoreState();

// Mock the accomplish module - always return true for isRunningInElectron for most tests
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
  isRunningInElectron: () => true,
}));

// Mock analytics
vi.mock('@/lib/analytics', () => analyticsMock);

// Mock framer-motion to simplify testing animations
vi.mock('framer-motion', () => framerMotionMock);

// Mock animation utilities
vi.mock('@/lib/animations', () => animationsMock);

// Mock the task store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => mockStoreState,
}));

// Mock the Sidebar component
vi.mock('@/components/layout/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

// Mock the HomePage
vi.mock('@/pages/Home', () => ({
  default: () => <div data-testid="home-page">Home Page Content</div>,
}));

// Mock the ExecutionPage
vi.mock('@/pages/Execution', () => ({
  default: () => <div data-testid="execution-page">Execution Page Content</div>,
}));

// Import App after all mocks are set up
import App from '@/App';

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    mockStoreState = createMockStoreState();
    mockAccomplish.setOnboardingComplete.mockResolvedValue(undefined);
  });

  // Helper to render App with router
  const renderApp = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    );
  };

  describe('router setup', () => {
    it('should render sidebar in ready state', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      });
    });

    it('should render main content area', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const main = document.querySelector('main');
        expect(main).toBeInTheDocument();
      });
    });

    it('should render drag region for window dragging', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const dragRegion = document.querySelector('.drag-region');
        expect(dragRegion).toBeInTheDocument();
      });
    });
  });

  describe('route rendering - Home', () => {
    it('should render home page at root route', async () => {
      // Arrange & Act
      renderApp('/');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });

    it('should render home page content', async () => {
      // Arrange & Act
      renderApp('/');

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Home Page Content')).toBeInTheDocument();
      });
    });
  });

  describe('route rendering - Execution', () => {
    it('should render execution page at /execution/:id route', async () => {
      // Arrange & Act
      renderApp('/execution/task-123');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('execution-page')).toBeInTheDocument();
      });
    });

    it('should render execution page content', async () => {
      // Arrange & Act
      renderApp('/execution/task-123');

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Execution Page Content')).toBeInTheDocument();
      });
    });

    it('should handle different task IDs', async () => {
      // Arrange & Act
      renderApp('/execution/different-task-456');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('execution-page')).toBeInTheDocument();
      });
    });
  });

  describe('route rendering - Fallback', () => {
    it('should redirect unknown routes to home', async () => {
      // Arrange & Act
      renderApp('/unknown-route');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });

    it('should redirect /history to home (since it is not defined)', async () => {
      // Arrange & Act
      renderApp('/history');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });

    it('should redirect deeply nested unknown routes to home', async () => {
      // Arrange & Act
      renderApp('/some/deeply/nested/route');

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('home-page')).toBeInTheDocument();
      });
    });
  });

  describe('layout structure', () => {
    it('should render with flex layout', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const flexContainer = document.querySelector('.flex.h-screen');
        expect(flexContainer).toBeInTheDocument();
      });
    });

    it('should prevent overflow on app container', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const container = document.querySelector('.overflow-hidden');
        expect(container).toBeInTheDocument();
      });
    });

    it('should render main content with flex-1 for proper sizing', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const main = document.querySelector('main.flex-1');
        expect(main).toBeInTheDocument();
      });
    });
  });

  describe('analytics tracking', () => {
    it('should track page view on mount', async () => {
      // Arrange
      const { analytics } = await import('@/lib/analytics');

      // Act
      renderApp('/');

      // Assert
      await waitFor(() => {
        expect(analytics.trackPageView).toHaveBeenCalledWith('/');
      });
    });

    it('should track page view for execution route', async () => {
      // Arrange
      const { analytics } = await import('@/lib/analytics');

      // Act
      renderApp('/execution/task-123');

      // Assert
      await waitFor(() => {
        expect(analytics.trackPageView).toHaveBeenCalledWith('/execution/task-123');
      });
    });
  });

  describe('accessibility', () => {
    it('should have main landmark element', async () => {
      // Arrange & Act
      renderApp();

      // Assert
      await waitFor(() => {
        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
      });
    });
  });
});
