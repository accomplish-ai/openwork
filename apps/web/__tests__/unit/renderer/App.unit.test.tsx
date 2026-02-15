/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: {
      children: React.ReactNode;
      className?: string;
      [key: string]: unknown;
    }) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        variants: _variants,
        whileHover: _whileHover,
        ...domProps
      } = props;
      return (
        <div className={className} {...domProps}>
          {children}
        </div>
      );
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/animations', () => ({
  springs: { gentle: { type: 'spring' } },
  variants: { fadeUp: { initial: {}, animate: {} } },
}));

// Mock react-router
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  useOutlet: () => <div data-testid="outlet">Outlet</div>,
}));

// Mock components
vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));
vi.mock('@/components/TaskLauncher', () => ({
  TaskLauncher: () => <div data-testid="task-launcher">TaskLauncher</div>,
}));
vi.mock('@/components/AuthErrorToast', () => ({
  AuthErrorToast: () => null,
}));
vi.mock('@/components/layout/SettingsDialog', () => ({
  SettingsDialog: () => null,
}));

// Mock accomplish lib - make it look like Electron
vi.mock('@/lib/accomplish', () => ({
  isRunningInElectron: () => true,
  getAccomplish: () => ({
    setOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock the store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({
    openLauncher: vi.fn(),
    authError: null,
    clearAuthError: vi.fn(),
  }),
}));

describe('App - enterprise tier conditional AuthGate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders app content directly when tier is lite', async () => {
    vi.doMock('@/lib/tier', () => ({
      isEnterprise: () => false,
    }));

    const { App } = await import('@/App');
    render(<App />);

    // Wait for async init
    await screen.findByTestId('sidebar');
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('wraps app content with AuthGate when tier is enterprise', async () => {
    vi.doMock('@/lib/tier', () => ({
      isEnterprise: () => true,
    }));

    // Mock the lazy-loaded AuthGate
    vi.doMock('@/components/enterprise/AuthGate', () => ({
      AuthGate: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="auth-gate">{children}</div>
      ),
    }));

    const { App } = await import('@/App');
    render(<App />);

    await screen.findByTestId('auth-gate');
    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});
