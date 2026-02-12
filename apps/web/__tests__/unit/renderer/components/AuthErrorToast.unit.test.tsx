/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: unknown }) => {
      const { initial, animate, exit, transition, variants, whileHover, ...domProps } = props;
      return <div className={className} {...domProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AuthErrorToast } from '@/components/AuthErrorToast';

describe('AuthErrorToast', () => {
  const defaultProps = {
    error: { providerId: 'anthropic', message: 'Session expired' },
    onReLogin: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('returns null when error is null', () => {
    const { container } = render(
      <AuthErrorToast error={null} onReLogin={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders with error prop', () => {
    render(<AuthErrorToast {...defaultProps} />);

    expect(screen.getByTestId('auth-error-toast')).toBeInTheDocument();
    expect(screen.getByText('Session expired')).toBeInTheDocument();
  });

  it('maps known provider IDs to display names', () => {
    render(<AuthErrorToast {...defaultProps} />);

    expect(screen.getByText('Anthropic Session Expired')).toBeInTheDocument();
    expect(screen.getByText('Re-login to Anthropic')).toBeInTheDocument();
  });

  it('falls back to raw provider ID for unknown providers', () => {
    render(
      <AuthErrorToast
        error={{ providerId: 'custom-provider', message: 'error' }}
        onReLogin={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('custom-provider Session Expired')).toBeInTheDocument();
  });

  it('calls onReLogin when re-login button is clicked', () => {
    const onReLogin = vi.fn();
    render(<AuthErrorToast {...defaultProps} onReLogin={onReLogin} />);

    fireEvent.click(screen.getByTestId('auth-error-toast-relogin'));
    expect(onReLogin).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<AuthErrorToast {...defaultProps} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('auth-error-toast-dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
