import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-whatsapp'),
  },
}));

import { WhatsAppService } from '@main/services/whatsapp/WhatsAppService';
import type {
  InboundChannelMessage,
  MessagingConnectionStatus,
  OutboundProgressEvent,
} from '@accomplish_ai/agent-core/common';

describe('WhatsAppService ChannelAdapter', () => {
  let service: WhatsAppService;

  beforeEach(() => {
    service = new WhatsAppService();
  });

  describe('channelType', () => {
    it('should be "whatsapp"', () => {
      expect(service.channelType).toBe('whatsapp');
    });

    it('should be readonly and consistent across instances', () => {
      const anotherService = new WhatsAppService();
      expect(anotherService.channelType).toBe('whatsapp');
      expect(service.channelType).toBe(anotherService.channelType);
    });
  });

  describe('getStatus()', () => {
    it('should return "disconnected" initially', () => {
      expect(service.getStatus()).toBe('disconnected');
    });

    it('should reflect status changes made via the status event', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private method for test setup
      (service as any).setStatus('connecting');
      expect(service.getStatus()).toBe('connecting');
    });
  });

  describe('getQrCode()', () => {
    it('should return null initially', () => {
      expect(service.getQrCode()).toBeNull();
    });

    it('should return the stored QR code when one has been set via connection flow', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for test setup
      (service as any).qrCode = 'test-qr-code-data';
      expect(service.getQrCode()).toBe('test-qr-code-data');
    });

    it('should return null after the QR code has been cleared', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for test setup
      (service as any).qrCode = 'some-qr';
      expect(service.getQrCode()).toBe('some-qr');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing private field for test setup
      (service as any).qrCode = null;
      expect(service.getQrCode()).toBeNull();
    });
  });

  describe('sendMessage()', () => {
    it('should throw when no socket is connected', async () => {
      await expect(
        service.sendMessage('919876543210@s.whatsapp.net', 'hello'),
      ).rejects.toThrow('WhatsApp is not connected');
    });
  });

  describe('onMessage(handler)', () => {
    it('should call handler with InboundChannelMessage when message event is emitted', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      const internalMessage = {
        messageId: 'msg-001',
        senderId: '919876543210@s.whatsapp.net',
        senderName: 'Test User',
        text: 'Hello from WhatsApp',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: false,
      };

      service.emit('message', internalMessage);

      expect(handler).toHaveBeenCalledTimes(1);
      const received = handler.mock.calls[0][0];
      expect(received).toEqual({
        channelType: 'whatsapp',
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        senderName: 'Test User',
        text: 'Hello from WhatsApp',
        timestamp: 1700000000000,
      });
    });

    it('should map senderId to channelId', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      service.emit('message', {
        messageId: 'msg-002',
        senderId: '15551234567@s.whatsapp.net',
        senderName: undefined,
        text: 'Test',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: true,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const received = handler.mock.calls[0][0];
      expect(received.channelId).toBe('15551234567@s.whatsapp.net');
      expect(received.senderId).toBe('15551234567@s.whatsapp.net');
    });

    it('should pass through senderName as undefined when not provided', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      service.emit('message', {
        messageId: 'msg-003',
        senderId: '919876543210@s.whatsapp.net',
        text: 'No name',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: false,
      });

      const received = handler.mock.calls[0][0];
      expect(received.senderName).toBeUndefined();
    });

    it('should pass through text and timestamp unchanged', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      service.emit('message', {
        messageId: 'msg-004',
        senderId: '919876543210@s.whatsapp.net',
        senderName: 'User',
        text: 'Exact text content',
        timestamp: 9999999999999,
        isGroup: false,
        isFromMe: false,
      });

      const received = handler.mock.calls[0][0];
      expect(received.text).toBe('Exact text content');
      expect(received.timestamp).toBe(9999999999999);
    });

    it('should not include internal fields (messageId, isGroup, isFromMe) in InboundChannelMessage', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      service.emit('message', {
        messageId: 'msg-internal-fields',
        senderId: '919876543210@s.whatsapp.net',
        senderName: 'User',
        text: 'Test',
        timestamp: 1700000000000,
        isGroup: true,
        isFromMe: true,
      });

      const received = handler.mock.calls[0][0];
      expect(received).not.toHaveProperty('messageId');
      expect(received).not.toHaveProperty('isGroup');
      expect(received).not.toHaveProperty('isFromMe');
    });

    it('should always set channelType to "whatsapp" on outbound message', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      service.emit('message', {
        messageId: 'msg-channeltype',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Check channel type',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: false,
      });

      const received = handler.mock.calls[0][0];
      expect(received.channelType).toBe('whatsapp');
    });

    it('should support multiple handlers', () => {
      const handler1 = vi.fn<(msg: InboundChannelMessage) => void>();
      const handler2 = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler1);
      service.onMessage(handler2);

      service.emit('message', {
        messageId: 'msg-005',
        senderId: '919876543210@s.whatsapp.net',
        senderName: 'User',
        text: 'Multi handler test',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: false,
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handler when no message event has been emitted', () => {
      const handler = vi.fn<(msg: InboundChannelMessage) => void>();
      service.onMessage(handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onQrCode(handler)', () => {
    it('should call handler when qr event is emitted', () => {
      const handler = vi.fn<(qr: string) => void>();
      service.onQrCode(handler);

      service.emit('qr', 'qr-code-string-123');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('qr-code-string-123');
    });

    it('should call handler for each subsequent qr event', () => {
      const handler = vi.fn<(qr: string) => void>();
      service.onQrCode(handler);

      service.emit('qr', 'qr-1');
      service.emit('qr', 'qr-2');
      service.emit('qr', 'qr-3');

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, 'qr-1');
      expect(handler).toHaveBeenNthCalledWith(2, 'qr-2');
      expect(handler).toHaveBeenNthCalledWith(3, 'qr-3');
    });

    it('should support multiple qr handlers', () => {
      const handler1 = vi.fn<(qr: string) => void>();
      const handler2 = vi.fn<(qr: string) => void>();
      service.onQrCode(handler1);
      service.onQrCode(handler2);

      service.emit('qr', 'multi-qr');

      expect(handler1).toHaveBeenCalledWith('multi-qr');
      expect(handler2).toHaveBeenCalledWith('multi-qr');
    });
  });

  describe('onStatusChange(handler)', () => {
    it('should call handler when status event is emitted', () => {
      const handler = vi.fn<(status: MessagingConnectionStatus) => void>();
      service.onStatusChange(handler);

      service.emit('status', 'connecting');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('connecting');
    });

    it('should call handler for each status transition', () => {
      const handler = vi.fn<(status: MessagingConnectionStatus) => void>();
      service.onStatusChange(handler);

      service.emit('status', 'connecting');
      service.emit('status', 'qr_ready');
      service.emit('status', 'connected');
      service.emit('status', 'disconnected');

      expect(handler).toHaveBeenCalledTimes(4);
      expect(handler).toHaveBeenNthCalledWith(1, 'connecting');
      expect(handler).toHaveBeenNthCalledWith(2, 'qr_ready');
      expect(handler).toHaveBeenNthCalledWith(3, 'connected');
      expect(handler).toHaveBeenNthCalledWith(4, 'disconnected');
    });

    it('should support multiple status change handlers', () => {
      const handler1 = vi.fn<(status: MessagingConnectionStatus) => void>();
      const handler2 = vi.fn<(status: MessagingConnectionStatus) => void>();
      service.onStatusChange(handler1);
      service.onStatusChange(handler2);

      service.emit('status', 'connected');

      expect(handler1).toHaveBeenCalledWith('connected');
      expect(handler2).toHaveBeenCalledWith('connected');
    });

    it('should receive all valid status values', () => {
      const statuses: MessagingConnectionStatus[] = [
        'disconnected',
        'connecting',
        'qr_ready',
        'connected',
        'reconnecting',
        'logged_out',
      ];
      const handler = vi.fn<(status: MessagingConnectionStatus) => void>();
      service.onStatusChange(handler);

      for (const s of statuses) {
        service.emit('status', s);
      }

      expect(handler).toHaveBeenCalledTimes(statuses.length);
      for (let i = 0; i < statuses.length; i++) {
        expect(handler).toHaveBeenNthCalledWith(i + 1, statuses[i]);
      }
    });
  });

  describe('sendProgress(event)', () => {
    it('should prepend rocket emoji for "starting" phase', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Working on your task',
        phase: 'starting',
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [recipientId, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(recipientId).toBe('919876543210@s.whatsapp.net');
      expect(text).toBe('\u{1F680} Working on your task');
    });

    it('should prepend hourglass emoji for "in-progress" phase', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Processing data',
        phase: 'in-progress',
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u23F3 Processing data');
    });

    it('should prepend check mark emoji for "completed" phase', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Task finished successfully',
        phase: 'completed',
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u2705 Task finished successfully');
    });

    it('should prepend cross mark emoji for "failed" phase', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Task encountered an error',
        phase: 'failed',
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u274C Task encountered an error');
    });

    it('should send to the correct channelId as recipientId', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '15559998888@s.whatsapp.net',
        senderId: '15559998888@s.whatsapp.net',
        text: 'Progress update',
        phase: 'in-progress',
      };

      await service.sendProgress(event);

      const [recipientId] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(recipientId).toBe('15559998888@s.whatsapp.net');
    });

    it('should send only the text when no phase is provided', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Generic update',
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('Generic update');
    });

    it('should include percentage in brackets when provided', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Uploading file',
        phase: 'in-progress',
        percentage: 75,
      };

      await service.sendProgress(event);

      expect(service.sendMessage).toHaveBeenCalledTimes(1);
      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u23F3 [75%] Uploading file');
    });

    it('should format percentage at 0%', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Starting upload',
        phase: 'starting',
        percentage: 0,
      };

      await service.sendProgress(event);

      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u{1F680} [0%] Starting upload');
    });

    it('should format percentage at 100%', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Done',
        phase: 'completed',
        percentage: 100,
      };

      await service.sendProgress(event);

      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('\u2705 [100%] Done');
    });

    it('should send text with percentage but no emoji when phase is absent and percentage is present', async () => {
      vi.spyOn(service, 'sendMessage').mockResolvedValue(undefined);

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Background process',
        percentage: 50,
      };

      await service.sendProgress(event);

      const [, text] = (service.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(text).toBe('[50%] Background process');
    });

    it('should propagate sendMessage errors to the caller', async () => {
      vi.spyOn(service, 'sendMessage').mockRejectedValue(new Error('WhatsApp is not connected'));

      const event: OutboundProgressEvent = {
        channelId: '919876543210@s.whatsapp.net',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Will fail',
        phase: 'starting',
      };

      await expect(service.sendProgress(event)).rejects.toThrow('WhatsApp is not connected');
    });
  });

  describe('dispose()', () => {
    it('should remove all listeners on dispose', () => {
      const handler = vi.fn();
      service.onMessage(handler);
      service.onQrCode(vi.fn());
      service.onStatusChange(vi.fn());

      service.dispose();

      service.emit('message', {
        messageId: 'msg-after-dispose',
        senderId: '919876543210@s.whatsapp.net',
        text: 'Should not arrive',
        timestamp: 1700000000000,
        isGroup: false,
        isFromMe: false,
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
