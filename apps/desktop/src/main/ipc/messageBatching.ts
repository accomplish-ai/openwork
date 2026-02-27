import type { TaskMessage } from '@accomplish/shared';

// Message batching configuration
const MESSAGE_BATCH_DELAY_MS = 50;

export interface MessageBatcher {
  pendingMessages: TaskMessage[];
  timeout: NodeJS.Timeout | null;
  taskId: string;
  flush: () => void;
}

const messageBatchers = new Map<string, MessageBatcher>();

export function createMessageBatcher(
  taskId: string,
  forwardToRenderer: (channel: string, data: unknown) => void
): MessageBatcher {
  const batcher: MessageBatcher = {
    pendingMessages: [],
    timeout: null,
    taskId,
    flush: () => {
      if (batcher.pendingMessages.length === 0) return;

      forwardToRenderer('task:update:batch', {
        taskId,
        messages: batcher.pendingMessages,
      });

      batcher.pendingMessages = [];
      if (batcher.timeout) {
        clearTimeout(batcher.timeout);
        batcher.timeout = null;
      }
    },
  };

  messageBatchers.set(taskId, batcher);
  return batcher;
}

export function queueMessage(
  taskId: string,
  message: TaskMessage,
  forwardToRenderer: (channel: string, data: unknown) => void
): void {
  let batcher = messageBatchers.get(taskId);
  if (!batcher) {
    batcher = createMessageBatcher(taskId, forwardToRenderer);
  }

  batcher.pendingMessages.push(message);

  if (batcher.timeout) {
    clearTimeout(batcher.timeout);
  }

  batcher.timeout = setTimeout(() => {
    batcher!.flush();
  }, MESSAGE_BATCH_DELAY_MS);
}

export function flushAndCleanupBatcher(taskId: string): void {
  const batcher = messageBatchers.get(taskId);
  if (batcher) {
    batcher.flush();
    messageBatchers.delete(taskId);
  }
}

