import { describe, it, expect } from 'vitest';
import { classifyProcessError } from '../../../src/internal/utils/process-error-classifier.js';

describe('classifyProcessError', () => {
  describe('quota / billing errors', () => {
    it('classifies insufficient_quota', () => {
      const msg = classifyProcessError(1, 'Error: insufficient_quota – you used up all credits');
      expect(msg).toContain('quota exceeded');
    });

    it('classifies "exceeded your current quota"', () => {
      const msg = classifyProcessError(
        1,
        'You exceeded your current quota, please check your plan',
      );
      expect(msg).toContain('quota exceeded');
    });

    it('classifies billing_hard_limit_reached', () => {
      const msg = classifyProcessError(1, 'billing_hard_limit_reached stop');
      expect(msg).toContain('quota exceeded');
    });
  });

  describe('rate limit errors', () => {
    it('classifies RESOURCE_EXHAUSTED (Gemini)', () => {
      const msg = classifyProcessError(1, 'statusCode 429 – RESOURCE_EXHAUSTED');
      expect(msg).toContain('Rate limit');
    });

    it('classifies "rate limit"', () => {
      const msg = classifyProcessError(1, 'You hit the rate limit, slow down');
      expect(msg).toContain('Rate limit');
    });

    it('classifies "too many requests"', () => {
      const msg = classifyProcessError(1, 'HTTP 429 Too Many Requests');
      expect(msg).toContain('Rate limit');
    });
  });

  describe('authentication errors', () => {
    it('classifies invalid_api_key', () => {
      const msg = classifyProcessError(1, 'Error: invalid_api_key provided');
      expect(msg).toContain('API key');
    });

    it('classifies "Incorrect API key"', () => {
      const msg = classifyProcessError(1, 'Incorrect API key. Please verify the key.');
      expect(msg).toContain('API key');
    });

    it('classifies unauthenticated', () => {
      const msg = classifyProcessError(1, 'Request unauthenticated – 401');
      expect(msg).toContain('API key');
    });
  });

  describe('model not found errors', () => {
    it('classifies model_not_found', () => {
      const msg = classifyProcessError(1, 'Error code: model_not_found');
      expect(msg).toContain('Model not found');
    });

    it('classifies "no such model"', () => {
      const msg = classifyProcessError(1, 'no such model: gpt-99');
      expect(msg).toContain('Model not found');
    });
  });

  describe('context length errors', () => {
    it('classifies context_length_exceeded', () => {
      const msg = classifyProcessError(1, 'context_length_exceeded – max is 128k tokens');
      expect(msg).toContain('too long');
    });

    it('classifies "maximum context length"', () => {
      const msg = classifyProcessError(1, 'This model has a maximum context length of 4096 tokens');
      expect(msg).toContain('too long');
    });
  });

  describe('network errors', () => {
    it('classifies ECONNREFUSED', () => {
      const msg = classifyProcessError(1, 'Error: connect ECONNREFUSED 127.0.0.1:11434');
      expect(msg).toContain('Network error');
    });

    it('classifies ENOTFOUND', () => {
      const msg = classifyProcessError(1, 'getaddrinfo ENOTFOUND api.openai.com');
      expect(msg).toContain('Network error');
    });
  });

  describe('unknown errors', () => {
    it('falls back to the exit code message when output is empty', () => {
      const msg = classifyProcessError(2, '');
      expect(msg).toContain('exited with code 2');
    });

    it('falls back to the exit code message for unrecognised output', () => {
      const msg = classifyProcessError(1, 'unexpected error: something broke in an unusual way');
      expect(msg).toContain('exited with code 1');
    });

    it('includes a hint about the debug panel in the fallback', () => {
      const msg = classifyProcessError(99, '');
      expect(msg).toContain('debug panel');
    });
  });
});
