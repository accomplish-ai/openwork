/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from '@/components/ui/CodeBlock';

// The component reads document.documentElement.classList for dark mode detection.
// We keep it light-mode for all tests by default.

// Minimal Tooltip stub — the real one needs a provider that'd require deeper setup.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

// Stub out react-syntax-highlighter to a simple <pre> to avoid heavy PrismJS
// loading in unit tests.
vi.mock('react-syntax-highlighter', () => ({
  Prism: ({
    children,
    language,
  }: {
    children: string;
    language?: string;
    [key: string]: unknown;
  }) => <pre data-language={language}>{children}</pre>,
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneLight: {},
  oneDark: {},
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    // Reset clipboard mock between tests
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  describe('inline mode', () => {
    it('should render children in a <code> element with inline styles', () => {
      render(<CodeBlock inline>const x = 1</CodeBlock>);

      const code = screen.getByText('const x = 1');
      expect(code.tagName.toLowerCase()).toBe('code');
      expect(code).toHaveClass('bg-muted');
    });

    it('should not render a copy button for inline code', () => {
      render(<CodeBlock inline>x</CodeBlock>);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('block mode', () => {
    it('should render code in a syntax-highlighted block', () => {
      render(<CodeBlock language="typescript">const x: number = 42;</CodeBlock>);

      const pre = screen.getByText('const x: number = 42;');
      expect(pre.tagName.toLowerCase()).toBe('pre');
      expect(pre).toHaveAttribute('data-language', 'typescript');
    });

    it('should show the language label in the header', () => {
      render(<CodeBlock language="python">print("hello")</CodeBlock>);

      expect(screen.getByText('python')).toBeInTheDocument();
    });

    it('should default to "text" when no language is provided', () => {
      render(<CodeBlock>hello world</CodeBlock>);

      expect(screen.getByText('text')).toBeInTheDocument();
    });

    it('should render a Copy button', () => {
      render(<CodeBlock language="js">alert(1)</CodeBlock>);

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });

    it('should call clipboard.writeText when Copy is clicked', async () => {
      const code = 'const answer = 42;';
      render(<CodeBlock language="js">{code}</CodeBlock>);

      fireEvent.click(screen.getByRole('button', { name: /copy/i }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code);
      });
    });

    it('should show "Copied!" state after clicking copy', async () => {
      render(<CodeBlock language="js">let x = 1;</CodeBlock>);

      fireEvent.click(screen.getByRole('button', { name: /copy/i }));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });

  describe('regression: plain fenced block without a language class', () => {
    it('renders block UI (copy button present) when inline=false and no language is given', () => {
      // A fenced code block without a language info-string has no className;
      // the renderer must NOT treat it as inline.
      render(<CodeBlock inline={false}>{'const x = 1\n'}</CodeBlock>);

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      // Should show the default language label for blocks
      expect(screen.getByText('text')).toBeInTheDocument();
    });
  });

  describe('regression: hyphenated language identifier', () => {
    it('renders the language label and copy button for "shell-session"', () => {
      render(
        <CodeBlock language="shell-session" inline={false}>
          {'echo hello\n'}
        </CodeBlock>,
      );

      expect(screen.getByText('shell-session')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });
  });
});
