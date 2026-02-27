/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenViewer } from './ScreenViewer';

afterEach(() => {
  cleanup();
  delete (window as unknown as { accomplish?: unknown }).accomplish;
});

function buildLiveScreenApi() {
  const startSession = vi.fn(async () => ({
    sessionId: 'session-123',
    sampleFps: 2,
    sampleIntervalMs: 400,
    startedAt: '2026-02-26T01:00:00.000Z',
    expiresAt: '2026-02-26T01:05:00.000Z',
    expiresInSeconds: 300,
    maxLifetimeSeconds: 300,
    initialFrameSequence: 1,
    initialFrameCapturedAt: '2026-02-26T01:00:00.000Z',
  }));

  const getFrame = vi.fn(async () => ({
    sessionId: 'session-123',
    frameSequence: 1,
    capturedAt: '2026-02-26T01:00:00.000Z',
    staleMs: 0,
    expiresAt: '2026-02-26T01:05:00.000Z',
    sampleFps: 2,
    imagePath: '/tmp/live-frame.png',
  }));

  const refreshFrame = vi.fn(async () => ({
    sessionId: 'session-123',
    frameSequence: 2,
    capturedAt: '2026-02-26T01:00:01.000Z',
    staleMs: 30,
    expiresAt: '2026-02-26T01:05:00.000Z',
    sampleFps: 2,
    imagePath: '/tmp/live-frame-2.png',
  }));

  const stopSession = vi.fn(async () => ({
    sessionId: 'session-123',
    status: 'stopped' as const,
    stoppedAt: '2026-02-26T01:00:03.000Z',
  }));

  return { startSession, getFrame, refreshFrame, stopSession };
}

describe('ScreenViewer', () => {
  it('starts a live session and renders frame data from desktop-control service', async () => {
    const liveScreen = buildLiveScreenApi();
    (window as unknown as { accomplish: unknown }).accomplish = {
      desktopControl: { liveScreen },
    };

    render(<ScreenViewer autoStart={false} />);

    fireEvent.click(await screen.findByRole('button', { name: /start live view/i }));

    await waitFor(() => {
      expect(liveScreen.startSession).toHaveBeenCalledTimes(1);
      expect(liveScreen.startSession).toHaveBeenCalledWith({
        sampleFps: 2,
        durationSeconds: 300,
        includeCursor: true,
      });
      expect(liveScreen.getFrame).toHaveBeenCalledWith('session-123');
    });

    const image = await screen.findByAltText('Live desktop frame');
    expect(image.getAttribute('src')).toContain('file:///tmp/live-frame.png');
  });

  it('supports keyboard toggle with Enter and custom default session options', async () => {
    const liveScreen = buildLiveScreenApi();
    (window as unknown as { accomplish: unknown }).accomplish = {
      desktopControl: { liveScreen },
    };

    render(<ScreenViewer defaultSampleFps={3} defaultDurationSeconds={180} />);

    const viewer = screen.getByRole('region', { name: /live screen viewer/i });
    fireEvent.keyDown(viewer, { key: 'Enter' });

    await waitFor(() => {
      expect(liveScreen.startSession).toHaveBeenCalledWith({
        sampleFps: 3,
        durationSeconds: 180,
        includeCursor: true,
      });
    });
  });

  it('stops an active session when capture is toggled off', async () => {
    const liveScreen = buildLiveScreenApi();
    (window as unknown as { accomplish: unknown }).accomplish = {
      desktopControl: { liveScreen },
    };

    render(<ScreenViewer autoStart={false} />);

    fireEvent.click(await screen.findByRole('button', { name: /start live view/i }));
    await waitFor(() => {
      expect(liveScreen.startSession).toHaveBeenCalledTimes(1);
    });

    const stopButton = await screen.findByTitle('Stop capture');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(liveScreen.stopSession).toHaveBeenCalledWith('session-123');
    });
  });
});
