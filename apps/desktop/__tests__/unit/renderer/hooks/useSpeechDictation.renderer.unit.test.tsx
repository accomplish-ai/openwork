import { act, renderHook } from '@testing-library/react';
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeechDictation } from '@/hooks/useSpeechDictation';

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function createRecognitionMock(overrides: Partial<RecognitionLike> = {}): RecognitionLike {
  return {
    continuous: false,
    interimResults: false,
    lang: 'en-US',
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    ...overrides,
  };
}

describe('useSpeechDictation', () => {
  afterEach(() => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('surfaces start errors via onError callback', () => {
    const onError = vi.fn();
    const recognition = createRecognitionMock({
      start: vi.fn(() => {
        throw new Error('Permission denied');
      }),
    });

    const SpeechRecognitionMock = vi.fn(function SpeechRecognitionMock() {
      return recognition;
    });
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = SpeechRecognitionMock;

    const { result } = renderHook(() =>
      useSpeechDictation({
        value: '',
        onChange: vi.fn(),
        onError,
      })
    );

    expect(result.current.isSupported).toBe(true);

    act(() => {
      result.current.toggleDictation();
    });

    expect(onError).toHaveBeenCalledWith('Unable to start dictation: Permission denied');
  });

  it('ignores duplicate-start InvalidStateError', () => {
    const onError = vi.fn();
    const recognition = createRecognitionMock({
      start: vi.fn(() => {
        const error = new Error('recognition has already started');
        error.name = 'InvalidStateError';
        throw error;
      }),
    });

    const SpeechRecognitionMock = vi.fn(function SpeechRecognitionMock() {
      return recognition;
    });
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = SpeechRecognitionMock;

    const { result } = renderHook(() =>
      useSpeechDictation({
        value: '',
        onChange: vi.fn(),
        onError,
      })
    );

    act(() => {
      result.current.toggleDictation();
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('maps network recognition errors to actionable guidance', () => {
    const onError = vi.fn();
    const recognition = createRecognitionMock();
    const SpeechRecognitionMock = vi.fn(function SpeechRecognitionMock() {
      return recognition;
    });
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = SpeechRecognitionMock;

    const { result } = renderHook(() =>
      useSpeechDictation({
        value: '',
        onChange: vi.fn(),
        onError,
      })
    );

    expect(result.current.isSupported).toBe(true);

    act(() => {
      const handler = recognition.onerror as ((event: { error: string }) => void) | null;
      handler?.({ error: 'network' });
    });

    expect(onError).toHaveBeenCalledWith(
      'Dictation could not reach the speech service (network). Check internet access in this app and temporarily disable VPN/proxy/firewall, then try again.'
    );
  });
});
