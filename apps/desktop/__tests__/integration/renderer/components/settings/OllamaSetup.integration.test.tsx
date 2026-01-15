/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockTestOllamaConnection = vi.fn();
const mockSetOllamaConfig = vi.fn();
const mockSetSelectedModel = vi.fn();

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    testOllamaConnection: mockTestOllamaConnection,
    setOllamaConfig: mockSetOllamaConfig,
    setSelectedModel: mockSetSelectedModel,
  }),
}));

// Mock react-i18next to return interpolated strings
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string, options?: Record<string, unknown>) => {
      if (options && typeof defaultValue === 'string') {
        return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] || ''));
      }
      return typeof defaultValue === 'string' ? defaultValue : key;
    },
    i18n: { language: 'en' },
  }),
}));

import OllamaSetup from '@/components/layout/settings/OllamaSetup';

describe('OllamaSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTestOllamaConnection.mockResolvedValue({
      success: true,
      models: [{ id: 'llama3', displayName: 'Llama 3', size: 4000000000 }],
    });
    mockSetOllamaConfig.mockResolvedValue(undefined);
    mockSetSelectedModel.mockResolvedValue(undefined);
  });

  describe('rendering', () => {
    it('should render Ollama URL input', () => {
      render(<OllamaSetup onDone={vi.fn()} onBack={vi.fn()} />);

      expect(screen.getByPlaceholderText('http://localhost:11434')).toBeInTheDocument();
    });

    it('should render Test button', () => {
      render(<OllamaSetup onDone={vi.fn()} onBack={vi.fn()} />);

      expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument();
    });
  });

  describe('connection testing', () => {
    it('should show models after successful connection test', async () => {
      render(<OllamaSetup onDone={vi.fn()} onBack={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });
    });

    it('should show error when connection fails', async () => {
      mockTestOllamaConnection.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });
      render(<OllamaSetup onDone={vi.fn()} onBack={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
      });
    });

    it('should show model select after successful connection', async () => {
      render(<OllamaSetup onDone={vi.fn()} onBack={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText(/llama 3/i)).toBeInTheDocument();
      });
    });
  });

  describe('model selection and saving', () => {
    it('should call onDone after saving model', async () => {
      const onDone = vi.fn();
      render(<OllamaSetup onDone={onDone} onBack={vi.fn()} />);

      // First test connection
      fireEvent.click(screen.getByRole('button', { name: /test/i }));

      await waitFor(() => {
        expect(screen.getByText(/connected/i)).toBeInTheDocument();
      });

      // Then click save
      fireEvent.click(screen.getByRole('button', { name: /use this model/i }));

      await waitFor(() => {
        expect(onDone).toHaveBeenCalledWith('llama3');
      });
    });
  });

  describe('navigation', () => {
    it('should call onBack when Back button is clicked', () => {
      const onBack = vi.fn();
      render(<OllamaSetup onDone={vi.fn()} onBack={onBack} />);

      fireEvent.click(screen.getByRole('button', { name: /back/i }));

      expect(onBack).toHaveBeenCalled();
    });
  });
});
