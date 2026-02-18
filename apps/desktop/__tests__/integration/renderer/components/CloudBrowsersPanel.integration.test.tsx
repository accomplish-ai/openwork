/**
 * Integration tests for CloudBrowsersPanel component
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockGetCloudBrowserSettings = vi.fn();
const mockSetCloudBrowserSettings = vi.fn();
const mockTestCloudBrowserConnection = vi.fn();

vi.mock('@/lib/accomplish', () => ({
  getAccomplish: () => ({
    getCloudBrowserSettings: mockGetCloudBrowserSettings,
    setCloudBrowserSettings: mockSetCloudBrowserSettings,
    testCloudBrowserConnection: mockTestCloudBrowserConnection,
  }),
}));

import { CloudBrowsersPanel } from '@/components/settings/cloud-browsers/CloudBrowsersPanel';

describe('CloudBrowsersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCloudBrowserSettings.mockResolvedValue({
      config: {
        provider: 'aws-agentcore',
        enabled: true,
        region: 'us-east-1',
        authMode: 'accessKeys',
        cdpEndpoint: 'ws://remote-browser:9222',
      },
      credentials: {
        authMode: 'accessKeys',
        accessKeyId: 'AKIA123',
        secretAccessKey: 'secret',
      },
    });
    mockSetCloudBrowserSettings.mockResolvedValue(undefined);
    mockTestCloudBrowserConnection.mockResolvedValue({ success: true });
  });

  it('loads and renders cloud browser settings', async () => {
    render(<CloudBrowsersPanel />);

    await waitFor(() => {
      expect(screen.getByText('AWS AgentCore Browser Tool')).toBeInTheDocument();
    });

    expect(mockGetCloudBrowserSettings).toHaveBeenCalled();
    expect(screen.getByDisplayValue('us-east-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ws://remote-browser:9222')).toBeInTheDocument();
  });

  it('saves settings', async () => {
    render(<CloudBrowsersPanel />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockSetCloudBrowserSettings).toHaveBeenCalled();
    });
  });

  it('tests connection', async () => {
    render(<CloudBrowsersPanel />);
    await waitFor(() => {
      expect(screen.getByText('Test Connection')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test Connection'));

    await waitFor(() => {
      expect(mockTestCloudBrowserConnection).toHaveBeenCalled();
    });
  });
});

