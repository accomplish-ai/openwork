import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('@accomplish_ai/agent-core', () => ({
  sanitizeString: vi.fn((input: string, _field: string, maxLength = 4096) => {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('whatsappMessage is required');
    }
    if (trimmed.length > maxLength) {
      throw new Error('whatsappMessage exceeds maximum length');
    }
    return trimmed;
  }),
}));

vi.mock('@whiskeysockets/baileys', () => ({
  isLidUser: vi.fn((jid: string | undefined) => !!jid?.endsWith('@lid')),
}));

import { TaskBridge, type MessageTransport } from '@main/services/whatsapp/taskBridge';
import { sanitizeString } from '@accomplish_ai/agent-core';

const OWNER_JID = '919876543210@s.whatsapp.net';
const OWNER_LID = '123456789@lid';

type MockTransport = MessageTransport & EventEmitter & {
  sendMessage: ReturnType<typeof vi.fn>;
};

function createMockService(): MockTransport {
  return Object.assign(new EventEmitter(), {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }) as MockTransport;
}

function createMessage(overrides: Partial<{
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isGroup: boolean;
  isFromMe: boolean;
}> = {}) {
  return {
    messageId: 'msg-1',
    senderId: OWNER_JID,
    senderName: 'Test User',
    text: 'Hello, run a task for me',
    timestamp: Date.now(),
    isGroup: false,
    isFromMe: true,
    ...overrides,
  };
}

describe('TaskBridge', () => {
  let service: MockTransport;
  let onTaskRequest: ReturnType<typeof vi.fn>;
  let bridge: TaskBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
    onTaskRequest = vi.fn();
    bridge = new TaskBridge(service, onTaskRequest);
    // Default mock: simulate task completing immediately (clears active task)
    onTaskRequest.mockImplementation(async (senderId: string) => {
      bridge.clearActiveTask(senderId);
    });
    bridge.setOwnerJid(OWNER_JID);
  });

  describe('owner-only access control', () => {
    it('should silently drop messages when ownerJid is not set (fail-closed)', async () => {
      const isolatedService = createMockService();
      const isolatedCallback = vi.fn().mockResolvedValue(undefined);
      new TaskBridge(isolatedService, isolatedCallback);

      const msg = createMessage();
      isolatedService.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(isolatedCallback).not.toHaveBeenCalled();
      expect(isolatedService.sendMessage).not.toHaveBeenCalled();
    });

    it('should silently drop messages from non-owner senders (no reply sent)', async () => {
      const msg = createMessage({
        senderId: '15551234567@s.whatsapp.net',
        isFromMe: false,
      });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should process self-chat messages (isFromMe=true AND senderId=ownerJid)', async () => {
      const msg = createMessage({
        senderId: OWNER_JID,
        isFromMe: true,
      });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_JID,
          msg.senderName,
          msg.text,
        );
      });
    });

    it('should drop messages with isFromMe=false even from owners JID', async () => {
      const msg = createMessage({
        senderId: OWNER_JID,
        isFromMe: false,
      });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should drop messages where isFromMe=true but senderId differs from ownerJid', async () => {
      const msg = createMessage({
        senderId: '15559999999@s.whatsapp.net',
        isFromMe: true,
      });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should expose ownerJid via getOwnerJid', () => {
      expect(bridge.getOwnerJid()).toBe(OWNER_JID);
    });

    it('should return null from getOwnerJid when not set', () => {
      const isolatedService = createMockService();
      const freshBridge = new TaskBridge(isolatedService, onTaskRequest);
      expect(freshBridge.getOwnerJid()).toBeNull();
    });
  });

  describe('LID self-chat access control', () => {
    it('should accept LID self-chat when ownerLid matches', async () => {
      bridge.setOwnerLid(OWNER_LID);
      const msg = createMessage({ senderId: OWNER_LID, isFromMe: true });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_LID,
          msg.senderName,
          msg.text,
        );
      });
    });

    it('should reject LID sender that does not match ownerLid', async () => {
      bridge.setOwnerLid(OWNER_LID);
      const msg = createMessage({ senderId: '999999999@lid', isFromMe: true });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject JID sender when only ownerLid is set (no ownerJid)', async () => {
      const isolatedService = createMockService();
      const isolatedCallback = vi.fn().mockResolvedValue(undefined);
      const lidBridge = new TaskBridge(isolatedService, isolatedCallback);
      lidBridge.setOwnerLid(OWNER_LID);

      const msg = createMessage({ senderId: OWNER_JID, isFromMe: true });
      isolatedService.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(isolatedCallback).not.toHaveBeenCalled();
    });

    it('should reject LID sender when only ownerJid is set (no ownerLid)', async () => {
      const msg = createMessage({ senderId: OWNER_LID, isFromMe: true });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
    });

    it('should accept LID sender when both ownerJid and ownerLid are set', async () => {
      bridge.setOwnerLid(OWNER_LID);
      const msg = createMessage({ senderId: OWNER_LID, isFromMe: true });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_LID,
          msg.senderName,
          msg.text,
        );
      });
    });

    it('should still accept JID sender when both ownerJid and ownerLid are set', async () => {
      bridge.setOwnerLid(OWNER_LID);
      const msg = createMessage({ senderId: OWNER_JID, isFromMe: true });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_JID,
          msg.senderName,
          msg.text,
        );
      });
    });

    it('should expose ownerLid via getOwnerLid', () => {
      bridge.setOwnerLid(OWNER_LID);
      expect(bridge.getOwnerLid()).toBe(OWNER_LID);
    });

    it('should return null from getOwnerLid when not set', () => {
      const isolatedService = createMockService();
      const freshBridge = new TaskBridge(isolatedService, onTaskRequest);
      expect(freshBridge.getOwnerLid()).toBeNull();
    });

    it('should fail-closed when ownerLid is set but ownerJid is not and sender is JID', async () => {
      const isolatedService = createMockService();
      const isolatedCallback = vi.fn().mockResolvedValue(undefined);
      const lidOnlyBridge = new TaskBridge(isolatedService, isolatedCallback);
      lidOnlyBridge.setOwnerLid(OWNER_LID);

      const msg = createMessage({ senderId: '15551234567@s.whatsapp.net', isFromMe: true });
      isolatedService.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(isolatedCallback).not.toHaveBeenCalled();
      expect(isolatedService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('enabled flag', () => {
    it('should drop messages when enabled=false', async () => {
      bridge.setEnabled(false);

      const msg = createMessage();
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should resume processing messages when re-enabled', async () => {
      bridge.setEnabled(false);

      const msg1 = createMessage({ messageId: 'msg-disabled' });
      service.emit('message', msg1);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();

      bridge.setEnabled(true);

      const msg2 = createMessage({ messageId: 'msg-enabled' });
      service.emit('message', msg2);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledTimes(1);
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_JID,
          msg2.senderName,
          msg2.text,
        );
      });
    });
  });

  describe('group messages', () => {
    it('should drop group messages', async () => {
      const msg = createMessage({ isGroup: true, senderId: 'group@g.us' });
      service.emit('message', msg);

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('global rate limiting', () => {
    it('should silently drop messages after 30 messages globally within 60s', async () => {
      const now = Date.now();
      const timestamps = Array.from({ length: 30 }, (_, i) => now - i * 100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for test setup
      (bridge as unknown as { globalTimestamps: number[] }).globalTimestamps = timestamps;

      service.emit('message', createMessage({ messageId: 'msg-over-global-limit' }));

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
      expect(service.sendMessage).not.toHaveBeenCalled();
    });

    it('should not send a reply when globally rate limited (silent drop)', async () => {
      const now = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for test setup
      (bridge as unknown as { globalTimestamps: number[] }).globalTimestamps = Array.from({ length: 30 }, (_, i) => now - i * 100);

      service.emit('message', createMessage());

      await new Promise((r) => setTimeout(r, 50));
      expect(service.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('per-sender rate limiting', () => {
    it('should send rate limit reply after 10 messages from the same sender', async () => {
      for (let i = 0; i < 10; i++) {
        service.emit('message', createMessage({ messageId: `msg-${i}` }));
        await new Promise((r) => setTimeout(r, 5));
      }

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledTimes(10);
      });

      service.emit('message', createMessage({ messageId: 'msg-11' }));

      await vi.waitFor(() => {
        expect(service.sendMessage).toHaveBeenCalledWith(
          OWNER_JID,
          'You are sending messages too quickly. Please wait a moment.',
        );
      });
    });
  });

  describe('message length validation', () => {
    it('should reject messages exceeding 4096 characters', async () => {
      const longText = 'x'.repeat(4097);
      const msg = createMessage({ text: longText });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(service.sendMessage).toHaveBeenCalledWith(
          OWNER_JID,
          expect.stringContaining('Message too long'),
        );
      });
      expect(onTaskRequest).not.toHaveBeenCalled();
    });

    it('should accept messages at exactly 4096 characters', async () => {
      const exactText = 'x'.repeat(4096);
      const msg = createMessage({ text: exactText });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalled();
      });
    });

    it('should send error reply when sanitizeString throws', async () => {
      vi.mocked(sanitizeString).mockImplementationOnce(() => {
        throw new Error('Invalid characters');
      });

      const msg = createMessage({ text: 'some text' });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(service.sendMessage).toHaveBeenCalledWith(
          OWNER_JID,
          'Could not process your message. Please try again with plain text.',
        );
      });
      expect(onTaskRequest).not.toHaveBeenCalled();
    });
  });

  describe('senderName sanitization', () => {
    it('should pass senderName through sanitizeString before reaching onTaskRequest', async () => {
      const msg = createMessage({ senderName: '  Injected <script>  ' });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(sanitizeString).toHaveBeenCalledWith(
          '  Injected <script>  ',
          'senderName',
          128,
        );
      });

      expect(onTaskRequest).toHaveBeenCalledWith(
        OWNER_JID,
        'Injected <script>',
        msg.text,
      );
    });

    it('should pass undefined senderName when msg.senderName is not provided', async () => {
      const { senderName: _, ...msg } = createMessage();
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledWith(
          OWNER_JID,
          undefined,
          msg.text,
        );
      });
    });

    it('should sanitize message text with sanitizeString', async () => {
      const msg = createMessage({ text: '  run my task  ' });
      service.emit('message', msg);

      await vi.waitFor(() => {
        expect(sanitizeString).toHaveBeenCalledWith(
          '  run my task  ',
          'whatsappMessage',
          4096,
        );
      });

      expect(onTaskRequest).toHaveBeenCalledWith(
        OWNER_JID,
        expect.any(String),
        'run my task',
      );
    });
  });

  describe('active task rejection', () => {
    it('should reject messages when sender has an active task', async () => {
      bridge.setActiveTask(OWNER_JID, 'task-123');

      service.emit('message', createMessage());

      await vi.waitFor(() => {
        expect(service.sendMessage).toHaveBeenCalledWith(
          OWNER_JID,
          'Your previous task is still running. Please wait for it to complete.',
        );
      });
      expect(onTaskRequest).not.toHaveBeenCalled();
    });

    it('should allow messages after active task is cleared', async () => {
      bridge.setActiveTask(OWNER_JID, 'task-123');
      bridge.clearActiveTask(OWNER_JID);

      expect(bridge.hasActiveTask(OWNER_JID)).toBe(false);

      service.emit('message', createMessage());

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalled();
      });
    });

    it('should track active tasks correctly via hasActiveTask', () => {
      expect(bridge.hasActiveTask(OWNER_JID)).toBe(false);

      bridge.setActiveTask(OWNER_JID, 'task-abc');
      expect(bridge.hasActiveTask(OWNER_JID)).toBe(true);

      bridge.clearActiveTask(OWNER_JID);
      expect(bridge.hasActiveTask(OWNER_JID)).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should send generic error reply when task creation fails', async () => {
      onTaskRequest.mockRejectedValueOnce(new Error('Task creation failed'));

      service.emit('message', createMessage());

      await vi.waitFor(() => {
        expect(service.sendMessage).toHaveBeenCalledWith(
          OWNER_JID,
          'Sorry, I could not process your request. Please try again later.',
        );
      });
    });

    it('should not throw if error reply sendMessage also fails', async () => {
      onTaskRequest.mockRejectedValueOnce(new Error('Task creation failed'));
      service.sendMessage.mockRejectedValueOnce(new Error('Send failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      service.emit('message', createMessage());

      await new Promise((r) => setTimeout(r, 100));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[TaskBridge] Failed to create task:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('fire-and-forget sendMessage failure resilience', () => {
    it('should not throw when rate-limit reply sendMessage fails', async () => {
      for (let i = 0; i < 10; i++) {
        service.emit('message', createMessage({ messageId: `rl-${i}` }));
        await new Promise((r) => setTimeout(r, 5));
      }
      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledTimes(10);
      });

      service.sendMessage.mockRejectedValueOnce(new Error('Network error'));
      service.emit('message', createMessage({ messageId: 'rl-over-limit' }));

      await new Promise((r) => setTimeout(r, 100));
      expect(onTaskRequest).toHaveBeenCalledTimes(10);
    });

    it('should not throw when message-too-long reply sendMessage fails', async () => {
      service.sendMessage.mockRejectedValueOnce(new Error('Network error'));
      service.emit('message', createMessage({ text: 'x'.repeat(4097) }));

      await new Promise((r) => setTimeout(r, 100));
      expect(onTaskRequest).not.toHaveBeenCalled();
    });

    it('should not throw when sanitization-error reply sendMessage fails', async () => {
      vi.mocked(sanitizeString).mockImplementationOnce(() => {
        throw new Error('Invalid chars');
      });
      service.sendMessage.mockRejectedValueOnce(new Error('Network error'));
      service.emit('message', createMessage({ text: 'some text' }));

      await new Promise((r) => setTimeout(r, 100));
      expect(onTaskRequest).not.toHaveBeenCalled();
    });

    it('should not throw when active-task reply sendMessage fails', async () => {
      bridge.setActiveTask(OWNER_JID, 'task-busy');
      service.sendMessage.mockRejectedValueOnce(new Error('Network error'));
      service.emit('message', createMessage());

      await new Promise((r) => setTimeout(r, 100));
      expect(onTaskRequest).not.toHaveBeenCalled();
    });
  });

  describe('session continuity', () => {
    it('should store and retrieve session for a sender', () => {
      bridge.setSessionForSender(OWNER_JID, 'ses_abc123');
      expect(bridge.getSessionForSender(OWNER_JID)).toBe('ses_abc123');
    });

    it('should return null for unknown sender', () => {
      expect(bridge.getSessionForSender('unknown@s.whatsapp.net')).toBeNull();
    });

    it('should overwrite previous session for same sender', () => {
      bridge.setSessionForSender(OWNER_JID, 'ses_old');
      bridge.setSessionForSender(OWNER_JID, 'ses_new');
      expect(bridge.getSessionForSender(OWNER_JID)).toBe('ses_new');
    });

    it('should expire session after idle timeout', () => {
      // Advance time past the 10-minute idle timeout
      vi.useFakeTimers();
      bridge.setSessionForSender(OWNER_JID, 'ses_expired');
      vi.setSystemTime(Date.now() + 11 * 60_000);

      expect(bridge.getSessionForSender(OWNER_JID)).toBeNull();

      vi.useRealTimers();
    });

    it('should return session within idle timeout', () => {
      vi.useFakeTimers();
      bridge.setSessionForSender(OWNER_JID, 'ses_fresh');
      vi.setSystemTime(Date.now() + 5 * 60_000); // 5 minutes, within 10-min timeout

      expect(bridge.getSessionForSender(OWNER_JID)).toBe('ses_fresh');

      vi.useRealTimers();
    });

    it('should clear sessions on dispose', () => {
      bridge.setSessionForSender(OWNER_JID, 'ses_disposed');
      bridge.dispose();
      expect(bridge.getSessionForSender(OWNER_JID)).toBeNull();
    });
  });

  describe('dispose', () => {
    it('should clear all state on dispose', () => {
      bridge.setActiveTask(OWNER_JID, 'task-1');
      bridge.setActiveTask('other@s.whatsapp.net', 'task-2');

      bridge.dispose();

      expect(bridge.hasActiveTask(OWNER_JID)).toBe(false);
      expect(bridge.hasActiveTask('other@s.whatsapp.net')).toBe(false);
    });

    it('should remove message listener on dispose', async () => {
      service.emit('message', createMessage({ messageId: 'msg-before-dispose' }));

      await vi.waitFor(() => {
        expect(onTaskRequest).toHaveBeenCalledTimes(1);
      });

      bridge.dispose();
      onTaskRequest.mockClear();

      service.emit('message', createMessage({ messageId: 'msg-after-dispose' }));

      await new Promise((r) => setTimeout(r, 50));
      expect(onTaskRequest).not.toHaveBeenCalled();
    });
  });
});
