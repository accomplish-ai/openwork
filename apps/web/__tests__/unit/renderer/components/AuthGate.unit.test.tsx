/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock framer-motion (same pattern as App.integration.test.tsx)
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

import { AuthGate } from '@/components/enterprise/AuthGate';

describe('AuthGate', () => {
  it('renders SSO login screen when not authenticated', () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    expect(screen.getByText('Enterprise Single Sign-On')).toBeInTheDocument();
    expect(screen.getByText('Sign in with SSO')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('your-company')).toBeInTheDocument();
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
  });

  it('disables sign-in button when org identifier is empty', () => {
    render(
      <AuthGate>
        <div>App</div>
      </AuthGate>,
    );

    const button = screen.getByText('Sign in with SSO');
    expect(button).toBeDisabled();
  });

  it('enables sign-in button when org identifier is entered', () => {
    render(
      <AuthGate>
        <div>App</div>
      </AuthGate>,
    );

    fireEvent.change(screen.getByPlaceholderText('your-company'), {
      target: { value: 'acme-corp' },
    });

    const button = screen.getByText('Sign in with SSO');
    expect(button).not.toBeDisabled();
  });

  it('shows children after sign-in', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    fireEvent.change(screen.getByPlaceholderText('your-company'), {
      target: { value: 'acme-corp' },
    });
    fireEvent.click(screen.getByText('Sign in with SSO'));

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });
  });

  it('keeps sign-in button disabled for whitespace-only input', () => {
    render(
      <AuthGate>
        <div>App</div>
      </AuthGate>,
    );

    fireEvent.change(screen.getByPlaceholderText('your-company'), {
      target: { value: '   ' },
    });

    expect(screen.getByText('Sign in with SSO')).toBeDisabled();
  });

  it('does not sign in on Enter with empty input', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    const input = screen.getByPlaceholderText('your-company');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Enterprise Single Sign-On')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument();
  });

  it('shows loading spinner during sign-in', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    fireEvent.change(screen.getByPlaceholderText('your-company'), {
      target: { value: 'acme-corp' },
    });
    fireEvent.click(screen.getByText('Sign in with SSO'));

    // Spinner should be visible while signing in
    expect(screen.queryByText('Sign in with SSO')).not.toBeInTheDocument();
    expect(screen.getByTestId('sign-in-spinner')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });
  });

  it('prevents duplicate sign-in attempts via Enter key (re-entrancy guard)', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    const input = screen.getByPlaceholderText('your-company');
    fireEvent.change(input, { target: { value: 'acme-corp' } });

    // First Enter triggers sign-in
    fireEvent.keyDown(input, { key: 'Enter' });

    // Spinner should now be visible (isSigningIn = true)
    expect(screen.getByTestId('sign-in-spinner')).toBeInTheDocument();

    // Second Enter while signing in — should be ignored by isSigningIn guard
    fireEvent.keyDown(input, { key: 'Enter' });

    // Should still resolve to authenticated (not error or double-resolve)
    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });
  });

  it('submits on Enter key', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    const input = screen.getByPlaceholderText('your-company');
    fireEvent.change(input, { target: { value: 'acme-corp' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });
  });

  it('displays dev-mode auth bypass banner', () => {
    render(
      <AuthGate>
        <div>App</div>
      </AuthGate>,
    );

    const banner = screen.getByTestId('dev-auth-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('DEV MODE');
  });

  it('does not display error message after successful sign-in', async () => {
    render(
      <AuthGate>
        <div data-testid="app-content">App</div>
      </AuthGate>,
    );

    // No error initially
    expect(screen.queryByTestId('auth-error')).not.toBeInTheDocument();

    // The current placeholder always succeeds, so we verify the error element
    // is not shown after a successful sign-in
    fireEvent.change(screen.getByPlaceholderText('your-company'), {
      target: { value: 'acme-corp' },
    });
    fireEvent.click(screen.getByText('Sign in with SSO'));

    await waitFor(() => {
      expect(screen.getByTestId('app-content')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('auth-error')).not.toBeInTheDocument();
  });
});
