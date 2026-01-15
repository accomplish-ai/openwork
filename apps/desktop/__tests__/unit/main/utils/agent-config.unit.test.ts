// apps/desktop/__tests__/unit/main/utils/agent-config.unit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('agent-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAgentId', () => {
    it('returns 1 when AGENT_ID is not set', async () => {
      delete process.env.AGENT_ID;
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(1);
    });

    it('returns parsed AGENT_ID when set', async () => {
      process.env.AGENT_ID = '3';
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(3);
    });

    it('returns 1 for invalid AGENT_ID', async () => {
      process.env.AGENT_ID = 'invalid';
      const { getAgentId } = await import('@main/utils/agent-config');
      expect(getAgentId()).toBe(1);
    });
  });

  describe('getPortOffset', () => {
    it('returns 0 for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(0);
    });

    it('returns 10 for agent 2', async () => {
      process.env.AGENT_ID = '2';
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(10);
    });

    it('returns 20 for agent 3', async () => {
      process.env.AGENT_ID = '3';
      const { getPortOffset } = await import('@main/utils/agent-config');
      expect(getPortOffset()).toBe(20);
    });
  });

  describe('getAgentSuffix', () => {
    it('returns empty string for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { getAgentSuffix } = await import('@main/utils/agent-config');
      expect(getAgentSuffix()).toBe('');
    });

    it('returns -agent-2 for agent 2', async () => {
      process.env.AGENT_ID = '2';
      const { getAgentSuffix } = await import('@main/utils/agent-config');
      expect(getAgentSuffix()).toBe('-agent-2');
    });
  });

  describe('isMultiAgentMode', () => {
    it('returns false for agent 1', async () => {
      delete process.env.AGENT_ID;
      const { isMultiAgentMode } = await import('@main/utils/agent-config');
      expect(isMultiAgentMode()).toBe(false);
    });

    it('returns true for agent 2+', async () => {
      process.env.AGENT_ID = '2';
      const { isMultiAgentMode } = await import('@main/utils/agent-config');
      expect(isMultiAgentMode()).toBe(true);
    });
  });
});
