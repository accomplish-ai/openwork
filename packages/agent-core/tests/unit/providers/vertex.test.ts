import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { validateVertexCredentials, fetchVertexModels } from '../../../src/providers/vertex.js';

const mockedExecSync = vi.mocked(execSync);

function makeAdcCredentialsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    authType: 'adc',
    projectId: 'my-project',
    location: 'us-central1',
    ...overrides,
  });
}

function makeServiceAccountKey(): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: 'my-project',
    private_key: 'fake-key',
    client_email: 'test@my-project.iam.gserviceaccount.com',
  });
}

function makeServiceAccountCredentialsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    authType: 'serviceAccount',
    projectId: 'my-project',
    location: 'us-central1',
    serviceAccountJson: makeServiceAccountKey(),
    ...overrides,
  });
}

function mockFetchResponses(...responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  for (const resp of responses) {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: async () => resp.json ?? {},
      text: async () => resp.text ?? '',
    } as Response);
  }
}

describe('Vertex AI Provider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('validateVertexCredentials', () => {
    it('should return error for invalid JSON', async () => {
      const result = await validateVertexCredentials('not-json');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Failed to parse credentials');
    });

    it('should return error for missing projectId', async () => {
      const result = await validateVertexCredentials(makeAdcCredentialsJson({ projectId: '' }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Project ID is required');
    });

    it('should return error for missing location', async () => {
      const result = await validateVertexCredentials(makeAdcCredentialsJson({ location: '' }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Location is required');
    });

    it('should return error for service account with missing JSON key', async () => {
      const result = await validateVertexCredentials(JSON.stringify({
        authType: 'serviceAccount',
        projectId: 'my-project',
        location: 'us-central1',
        serviceAccountJson: '',
      }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Service account JSON key is required');
    });

    it('should return error for service account with invalid JSON key', async () => {
      const result = await validateVertexCredentials(JSON.stringify({
        authType: 'serviceAccount',
        projectId: 'my-project',
        location: 'us-central1',
        serviceAccountJson: 'not-json',
      }));
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid service account JSON format');
    });

    it('should return error for service account key missing required fields', async () => {
      const result = await validateVertexCredentials(JSON.stringify({
        authType: 'serviceAccount',
        projectId: 'my-project',
        location: 'us-central1',
        serviceAccountJson: JSON.stringify({ type: 'service_account' }),
      }));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    describe('ADC flow', () => {
      it('should validate successfully with ADC token', async () => {
        mockedExecSync.mockReturnValue('fake-adc-token\n');
        // testVertexAccess call
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(true);
        expect(mockedExecSync).toHaveBeenCalledWith(
          'gcloud auth application-default print-access-token',
          expect.objectContaining({ timeout: 15000 })
        );
      });

      it('should return error when gcloud CLI is not found', async () => {
        const error = new Error('spawn gcloud ENOENT');
        mockedExecSync.mockImplementation(() => { throw error; });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('gcloud CLI not found');
      });

      it('should return error when gcloud returns empty token', async () => {
        mockedExecSync.mockReturnValue('   \n');

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Empty token');
      });

      it('should return error when gcloud auth fails', async () => {
        const error = new Error('You do not currently have an active account');
        mockedExecSync.mockImplementation(() => { throw error; });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Failed to get ADC token');
      });
    });

    describe('testVertexAccess status codes', () => {
      beforeEach(() => {
        mockedExecSync.mockReturnValue('fake-token');
      });

      it('should return error for 401 response', async () => {
        mockFetchResponses({ ok: false, status: 401, text: 'Unauthorized' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Authentication failed');
      });

      it('should return error for 403 response', async () => {
        mockFetchResponses({ ok: false, status: 403, text: 'Forbidden' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Authentication failed');
      });

      it('should return error for 404 response', async () => {
        mockFetchResponses({ ok: false, status: 404, text: 'Not Found' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('not found');
        expect(result.error).toContain('my-project');
      });

      it('should return error for other error status', async () => {
        mockFetchResponses({ ok: false, status: 500, text: 'Internal Server Error' });

        const result = await validateVertexCredentials(makeAdcCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Vertex AI API error (500)');
      });

      it('should use regional URL for non-global location', async () => {
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        await validateVertexCredentials(makeAdcCredentialsJson({ location: 'europe-west1' }));

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://europe-west1-aiplatform.googleapis.com'),
          expect.any(Object)
        );
      });

      it('should use global URL for global location', async () => {
        mockFetchResponses({ ok: true, json: { candidates: [] } });

        await validateVertexCredentials(makeAdcCredentialsJson({ location: 'global' }));

        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('https://aiplatform.googleapis.com'),
          expect.any(Object)
        );
      });
    });

    describe('service account flow', () => {
      it('should propagate error when private key is invalid', async () => {
        // crypto.createSign().sign() rejects fake keys before any fetch occurs
        const result = await validateVertexCredentials(makeServiceAccountCredentialsJson());

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        // fetch should never be called since signing fails first
        expect(fetch).not.toHaveBeenCalled();
      });

      it('should not call gcloud for service account auth type', async () => {
        const result = await validateVertexCredentials(makeServiceAccountCredentialsJson());

        expect(result.valid).toBe(false);
        // Should NOT fall back to gcloud for service account auth
        expect(mockedExecSync).not.toHaveBeenCalled();
      });
    });
  });

  describe('fetchVertexModels', () => {
    it('should return available models with ADC', async () => {
      mockedExecSync.mockReturnValue('fake-token');

      // All 10 curated models get a fetch call; make first 3 succeed, rest fail
      const responses: Array<{ ok: boolean }> = [];
      for (let i = 0; i < 10; i++) {
        responses.push({ ok: i < 3 });
      }
      for (const resp of responses) {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: resp.ok,
          status: resp.ok ? 200 : 404,
          json: async () => ({ candidates: [] }),
          text: async () => '',
        } as Response);
      }

      const result = await fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(3);
      // First 3 curated models are google ones
      expect(result.models[0].id).toBe('vertex/google/gemini-2.5-pro');
      expect(result.models[1].id).toBe('vertex/google/gemini-2.5-flash');
      expect(result.models[2].id).toBe('vertex/google/gemini-2.0-flash');
    });

    it('should return empty models when all fail', async () => {
      mockedExecSync.mockReturnValue('fake-token');

      for (let i = 0; i < 10; i++) {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '',
        } as Response);
      }

      const result = await fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(true);
      expect(result.models).toHaveLength(0);
    });

    it('should return error when token retrieval fails', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('gcloud failed');
      });

      const result = await fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get ADC token');
      expect(result.models).toHaveLength(0);
    });

    it('should handle rejected promises in model checks', async () => {
      mockedExecSync.mockReturnValue('fake-token');

      // Mix of resolved and rejected
      for (let i = 0; i < 10; i++) {
        if (i === 0) {
          vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ candidates: [] }),
            text: async () => '',
          } as Response);
        } else {
          vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
        }
      }

      const result = await fetchVertexModels({
        authType: 'adc',
        projectId: 'my-project',
        location: 'us-central1',
      });

      expect(result.success).toBe(true);
      // Only the first model that succeeded
      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe('vertex/google/gemini-2.5-pro');
    });

    it('should use correct URL pattern for each model', async () => {
      mockedExecSync.mockReturnValue('fake-token');

      for (let i = 0; i < 10; i++) {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => '',
        } as Response);
      }

      await fetchVertexModels({
        authType: 'adc',
        projectId: 'test-proj',
        location: 'europe-west1',
      });

      // Check the first call URL pattern
      expect(fetch).toHaveBeenCalledWith(
        'https://europe-west1-aiplatform.googleapis.com/v1/projects/test-proj/locations/europe-west1/publishers/google/models/gemini-2.5-pro:generateContent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-token',
          }),
        })
      );
    });
  });
});
