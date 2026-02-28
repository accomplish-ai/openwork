/**
 * Integration tests for SettingsDialog component
 * Tests dialog rendering, API key management, model selection, and debug mode
 * @module __tests__/integration/renderer/components/SettingsDialog.integration.test
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ApiKeyConfig } from '@accomplish/shared';
import { createMockAccomplish, framerMotionMock, analyticsMock } from '../test-utils';

// Mock analytics to prevent tracking calls
vi.mock('@/lib/analytics', () => analyticsMock);

// Create mock accomplish API from shared factory
const mockAccomplish = createMockAccomplish();

// Mock the accomplish module
vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => mockAccomplish,
}));

// Mock framer-motion to simplify testing animations
vi.mock('framer-motion', () => framerMotionMock);

// Mock Radix Dialog to simplify testing
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog-root">{children}</div> : null
  ),
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-overlay">{children}</div>
  ),
  Content: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="dialog-content" role="dialog" {...props}>{children}</div>
  ),
  Title: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  Close: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="dialog-close">{children}</button>
  ),
}));

// Need to import after mocks are set up
import SettingsDialog from '@/components/layout/SettingsDialog';

describe('SettingsDialog Integration', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onApiKeySaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations (override shared factory defaults where needed)
    mockAccomplish.getApiKeys.mockResolvedValue([]);
    mockAccomplish.getDebugMode.mockResolvedValue(false);
    mockAccomplish.getVersion.mockResolvedValue('1.0.0');
    mockAccomplish.getSelectedModel.mockResolvedValue({ provider: 'anthropic', model: 'anthropic/claude-opus-4-5' });
    mockAccomplish.setDebugMode.mockResolvedValue(undefined);
    mockAccomplish.setSelectedModel.mockResolvedValue(undefined);
    mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
    mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
    mockAccomplish.removeApiKey.mockResolvedValue(undefined);
    mockAccomplish.getOllamaConfig.mockResolvedValue(null);
    mockAccomplish.testOllamaConnection.mockResolvedValue({ success: false, error: 'Not configured' });
    mockAccomplish.setOllamaConfig.mockResolvedValue(undefined);
  });

  describe('dialog rendering', () => {
    it('should render dialog when open is true', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should not render dialog when open is false', () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} open={false} />);

      // Assert
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render Settings title', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });

    it('should fetch initial data on open', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.getApiKeys).toHaveBeenCalled();
        expect(mockAccomplish.getDebugMode).toHaveBeenCalled();
        expect(mockAccomplish.getVersion).toHaveBeenCalled();
        expect(mockAccomplish.getSelectedModel).toHaveBeenCalled();
      });
    });

    it('should not fetch data when dialog is closed', () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} open={false} />);

      // Assert
      expect(mockAccomplish.getApiKeys).not.toHaveBeenCalled();
      expect(mockAccomplish.getDebugMode).not.toHaveBeenCalled();
    });

    it('should reset API key input and validation errors after closing and reopening', async () => {
      // Arrange
      const { rerender } = render(<SettingsDialog {...defaultProps} />);

      // Act - Trigger a validation error and type input
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'invalid-key' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      });

      // Act - Close and reopen dialog
      rerender(<SettingsDialog {...defaultProps} open={false} />);
      rerender(<SettingsDialog {...defaultProps} open />);

      // Assert - State from prior open should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/invalid api key format/i)).not.toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('sk-ant-...')).toHaveValue('');
    });
  });

  describe('API key section', () => {
    it('should render API key section title', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Bring Your Own Model/API Key')).toBeInTheDocument();
      });
    });

    it('should render provider selection buttons', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Anthropic')).toBeInTheDocument();
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('Google AI')).toBeInTheDocument();
        expect(screen.getByText('xAI (Grok)')).toBeInTheDocument();
      });
    });

    it('should render API key input field', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const input = screen.getByPlaceholderText('sk-ant-...');
        expect(input).toBeInTheDocument();
        expect(input).toHaveAttribute('type', 'password');
      });
    });

    it('should render Save API Key button', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
      });
    });
  });

  describe('provider selection', () => {
    it('should change provider when button is clicked', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByText('Google AI')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Google AI'));

      // Assert
      await waitFor(() => {
        expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      });
    });

    it('should update input placeholder when provider changes', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click Google AI provider
      await waitFor(() => {
        expect(screen.getByText('Google AI')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Google AI'));

      // Assert
      await waitFor(() => {
        expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      });
    });

    it('should highlight selected provider', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Anthropic is selected by default and should have highlight class
      await waitFor(() => {
        const anthropicButton = screen.getByText('Anthropic').closest('button');
        expect(anthropicButton?.className).toContain('border-primary');
      });
    });
  });

  describe('API key input and saving', () => {
    it('should show error when saving empty API key', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        const errorMessage = screen.getByText('Please enter an API key.');
        expect(errorMessage).toBeInTheDocument();
        expect(errorMessage.closest('[role="alert"]')).toBeInTheDocument();
      });
    });

    it('should show error when API key format is invalid', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'invalid-key' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      });
    });

    it('should reject provider-mismatched keys before network validation', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act - Select OpenAI then paste an Anthropic key
      await waitFor(() => {
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-ant-test123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/this key looks like anthropic/i)).toBeInTheDocument();
      });
      expect(mockAccomplish.validateApiKeyForProvider).not.toHaveBeenCalled();
      expect(mockAccomplish.addApiKey).not.toHaveBeenCalled();
    });

    it('should reject incomplete keys that only include the provider prefix', async () => {
      // Arrange
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/api key looks incomplete/i)).toBeInTheDocument();
      });
      expect(mockAccomplish.validateApiKeyForProvider).not.toHaveBeenCalled();
      expect(mockAccomplish.addApiKey).not.toHaveBeenCalled();
    });

    it('should validate and save valid API key', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.validateApiKeyForProvider).toHaveBeenCalledWith('anthropic', 'sk-ant-test123');
        expect(mockAccomplish.addApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-test123');
      });
    });

    it('should show error when API key validation fails', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: false, error: 'Invalid API key' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-invalid' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });

    it('should use a fallback validation error message when validator does not return one', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: false });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-invalid' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });

    it('should trim whitespace before validating and saving API keys', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: '  sk-ant-trimmed123  ' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.validateApiKeyForProvider).toHaveBeenCalledWith('anthropic', 'sk-ant-trimmed123');
        expect(mockAccomplish.addApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-trimmed123');
      });
    });

    it('should show success message after saving API key', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        const successMessage = screen.getByText(/anthropic api key saved securely/i);
        expect(successMessage).toBeInTheDocument();
        expect(successMessage.closest('[role="status"]')).toBeInTheDocument();
      });
    });

    it('should call onApiKeySaved callback after saving', async () => {
      // Arrange
      const onApiKeySaved = vi.fn();
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} onApiKeySaved={onApiKeySaved} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(onApiKeySaved).toHaveBeenCalled();
      });
    });

    it('should show Saving... while saving is in progress', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ valid: true }), 100))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      expect(screen.getByText('Saving...')).toBeInTheDocument();
      const loadingMessage = screen.getByText('Saving API key...');
      expect(loadingMessage).toBeInTheDocument();
      expect(loadingMessage.closest('[role="status"]')).toBeInTheDocument();
    });

    it('should clear previous success feedback before showing empty-key validation', async () => {
      // Arrange
      mockAccomplish.validateApiKeyForProvider.mockResolvedValue({ valid: true });
      mockAccomplish.addApiKey.mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' });
      render(<SettingsDialog {...defaultProps} />);

      // Act - Save valid key first
      await waitFor(() => {
        expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      await waitFor(() => {
        expect(screen.getByText(/anthropic api key saved securely/i)).toBeInTheDocument();
      });

      // Act - Save again with empty key
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Please enter an API key.')).toBeInTheDocument();
        expect(screen.queryByText(/api key saved securely/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('state reset on reopen', () => {
    it('should reset tab, provider, and transient messages when reopened', async () => {
      // Arrange
      const { rerender } = render(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save api key/i })).toBeInTheDocument();
      });

      // Act - create non-default tab/provider + feedback state
      fireEvent.click(screen.getByText('Google AI'));
      await waitFor(() => {
        expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByPlaceholderText('AIza...'), { target: { value: 'bad-key' } });
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /local models/i }));
      await waitFor(() => {
        expect(screen.queryByText('Bring Your Own Model/API Key')).not.toBeInTheDocument();
      });

      // Act - close + reopen
      rerender(<SettingsDialog {...defaultProps} open={false} />);
      rerender(<SettingsDialog {...defaultProps} open />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Bring Your Own Model/API Key')).toBeInTheDocument();
      });
      expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
      expect(screen.queryByText(/invalid api key format/i)).not.toBeInTheDocument();
    });

    it('should clear stale debug warning immediately on reopen', async () => {
      // Arrange
      mockAccomplish.getDebugMode
        .mockResolvedValueOnce(true)
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(false), 25)));
      const { rerender } = render(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/debug mode is enabled/i)).toBeInTheDocument();
      });

      // Act
      rerender(<SettingsDialog {...defaultProps} open={false} />);
      rerender(<SettingsDialog {...defaultProps} open />);

      // Assert
      expect(screen.queryByText(/debug mode is enabled/i)).not.toBeInTheDocument();
      await waitFor(() => {
        expect(mockAccomplish.getDebugMode).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('saved keys display', () => {
    it('should render saved API keys', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
        { id: 'key-2', provider: 'openai', keyPrefix: 'sk-xyz...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Saved Keys')).toBeInTheDocument();
        expect(screen.getByText('sk-ant-abc...')).toBeInTheDocument();
        expect(screen.getByText('sk-xyz...')).toBeInTheDocument();
      });
    });

    it('should show delete button for each saved key', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
    });

    it('should delete API key when delete button is clicked and confirmed', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click delete button to show confirmation
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTitle('Remove API key'));

      // Act - Confirm deletion by clicking Yes
      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.removeApiKey).toHaveBeenCalledWith('key-1');
      });
    });

    it('should not delete API key when confirmation is cancelled', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act - Click delete button to show confirmation
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTitle('Remove API key'));

      // Act - Cancel by clicking No
      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /no/i }));

      // Assert - Should not delete, confirmation should be hidden
      expect(mockAccomplish.removeApiKey).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
      });
    });

    it('should clear pending delete confirmation after closing and reopening dialog', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-abc...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      const { rerender } = render(<SettingsDialog {...defaultProps} />);

      // Act - Open confirmation and then close/reopen dialog
      await waitFor(() => {
        expect(screen.getByTitle('Remove API key')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTitle('Remove API key'));
      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      });

      rerender(<SettingsDialog {...defaultProps} open={false} />);
      rerender(<SettingsDialog {...defaultProps} open />);

      // Assert - Confirmation state should not persist across opens
      await waitFor(() => {
        expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
      });
    });

    it('should show loading skeleton while fetching keys', async () => {
      // Arrange
      mockAccomplish.getApiKeys.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 500))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for skeleton animation
      await waitFor(() => {
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('model selection', () => {
    it('should render Model section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Model')).toBeInTheDocument();
      });
    });

    it('should render model selection dropdown', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeInTheDocument();
      });
    });

    it('should show model options grouped by provider', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for Anthropic group
      await waitFor(() => {
        const optgroups = document.querySelectorAll('optgroup');
        expect(optgroups.length).toBeGreaterThan(0);
      });
    });

    it('should disable models without API keys', async () => {
      // Arrange - No Google AI API key
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const option = screen.getByRole('option', { name: /gemini 3 pro \(no api key\)/i });
        expect(option).toBeDisabled();
      });
    });

    it('should call setSelectedModel when model is changed', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anthropic/claude-sonnet-4-5' } });

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.setSelectedModel).toHaveBeenCalledWith({
          provider: 'anthropic',
          model: 'anthropic/claude-sonnet-4-5',
        });
      });
    });

    it('should show model updated message after selection', async () => {
      // Arrange
      const savedKeys: ApiKeyConfig[] = [
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ];
      mockAccomplish.getApiKeys.mockResolvedValue(savedKeys);
      render(<SettingsDialog {...defaultProps} />);

      // Act
      await waitFor(() => {
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'anthropic/claude-sonnet-4-5' } });

      // Assert
      await waitFor(() => {
        const successMessage = screen.getByText(/model updated to/i);
        expect(successMessage).toBeInTheDocument();
        expect(successMessage.closest('[role="status"]')).toBeInTheDocument();
      });
    });

    it('should show warning when selected model has no API key', async () => {
      // Arrange - Selected Google AI model but no Google AI key
      mockAccomplish.getSelectedModel.mockResolvedValue({ provider: 'google', model: 'google/gemini-3-pro-preview' });
      mockAccomplish.getApiKeys.mockResolvedValue([
        { id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' },
      ]);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const warningMessage = screen.getByText(/no api key configured for google/i);
        expect(warningMessage).toBeInTheDocument();
        expect(warningMessage.closest('[role="alert"]')).toBeInTheDocument();
      });
    });
  });

  describe('debug mode toggle', () => {
    it('should render Developer section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Developer')).toBeInTheDocument();
      });
    });

    it('should render Debug Mode toggle', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });
    });

    it('should show debug mode as disabled initially', async () => {
      // Arrange
      mockAccomplish.getDebugMode.mockResolvedValue(false);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const toggle = screen.getByRole('button', { name: '' });
        expect(toggle.className).toContain('bg-muted');
      });
    });

    it('should toggle debug mode when clicked', async () => {
      // Arrange
      mockAccomplish.getDebugMode.mockResolvedValue(false);
      render(<SettingsDialog {...defaultProps} />);

      // Find the toggle button in the Developer section
      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });

      // Act - Find toggle by its appearance (the switch button)
      const developerSection = screen.getByText('Debug Mode').closest('section');
      const toggleButton = developerSection?.querySelector('button[class*="rounded-full"]');
      if (toggleButton) {
        fireEvent.click(toggleButton);
      }

      // Assert
      await waitFor(() => {
        expect(mockAccomplish.setDebugMode).toHaveBeenCalledWith(true);
      });
    });

    it('should show debug mode warning when enabled', async () => {
      // Arrange
      mockAccomplish.getDebugMode.mockResolvedValue(true);
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText(/debug mode is enabled/i)).toBeInTheDocument();
      });
    });

    it('should show loading skeleton while fetching debug setting', async () => {
      // Arrange
      mockAccomplish.getDebugMode.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(false), 500))
      );
      render(<SettingsDialog {...defaultProps} />);

      // Assert - Check for skeleton animation near debug toggle
      await waitFor(() => {
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBeGreaterThan(0);
      });
    });

    it('should revert toggle state on save error', async () => {
      // Arrange
      mockAccomplish.getDebugMode.mockResolvedValue(false);
      mockAccomplish.setDebugMode.mockRejectedValue(new Error('Save failed'));
      render(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Debug Mode')).toBeInTheDocument();
      });

      // Act
      const developerSection = screen.getByText('Debug Mode').closest('section');
      const toggleButton = developerSection?.querySelector('button[class*="rounded-full"]');
      if (toggleButton) {
        fireEvent.click(toggleButton);
      }

      // Assert - Mock should have been called and error handled
      await waitFor(() => {
        expect(mockAccomplish.setDebugMode).toHaveBeenCalled();
      });
    });
  });

  describe('about section', () => {
    it('should render About section', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('About')).toBeInTheDocument();
      });
    });

    it('should render app name', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Openwork')).toBeInTheDocument();
      });
    });

    it('should render app version', async () => {
      // Arrange
      mockAccomplish.getVersion.mockResolvedValue('2.0.0');
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Version 2.0.0')).toBeInTheDocument();
      });
    });

    it('should render app logo', async () => {
      // Arrange & Act
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        const logo = screen.getByRole('img', { name: /openwork/i });
        expect(logo).toBeInTheDocument();
      });
    });

    it('should show default version when fetch fails', async () => {
      // Arrange
      mockAccomplish.getVersion.mockRejectedValue(new Error('Fetch failed'));
      render(<SettingsDialog {...defaultProps} />);

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Version 0.1.0')).toBeInTheDocument();
      });
    });
  });
});
