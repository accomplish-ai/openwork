import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TaskMessage } from '@accomplish/shared';
import {
  flushAndCleanupBatcher,
  queueMessage,
} from '@main/ipc/messageBatching';

describe('messageBatching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches multiple task messages into a single IPC call', () => {
    const forwardToRenderer = vi.fn();
    const taskId = 'task-1';

    const firstMessage: TaskMessage = {
      id: 'msg-1',
      role: 'assistant',
      content: 'first',
      timestamp: new Date().toISOString(),
    };

    const secondMessage: TaskMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'second',
      timestamp: new Date().toISOString(),
    };

    queueMessage(taskId, firstMessage, forwardToRenderer);
    queueMessage(taskId, secondMessage, forwardToRenderer);

    expect(forwardToRenderer).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(forwardToRenderer).toHaveBeenCalledTimes(1);
    expect(forwardToRenderer).toHaveBeenCalledWith('task:update:batch', {
      taskId,
      messages: [firstMessage, secondMessage],
    });

    flushAndCleanupBatcher(taskId);
  });
});

