/**
 * Shared test utilities for renderer integration tests
 *
 * Provides factory functions for common mock objects to eliminate
 * duplicated setup boilerplate across test files.
 *
 * @module __tests__/integration/renderer/test-utils
 */

import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { Task, TaskStatus, TaskMessage } from '@accomplish/shared';

// ---------------------------------------------------------------------------
// createMockAccomplish
// ---------------------------------------------------------------------------

/**
 * Returns a full mock accomplish API object with vi.fn() defaults for ALL
 * methods used across test files. Pass overrides to customise individual
 * methods for a specific test.
 */
export function createMockAccomplish(overrides: Record<string, unknown> = {}) {
  return {
    // Task lifecycle
    listTasks: vi.fn().mockResolvedValue([]),
    getTask: vi.fn().mockResolvedValue(null),
    startTask: vi.fn().mockResolvedValue(undefined),
    cancelTask: vi.fn().mockResolvedValue(undefined),
    interruptTask: vi.fn().mockResolvedValue(undefined),
    sendFollowUp: vi.fn().mockResolvedValue(undefined),

    // Event subscriptions (return cleanup functions)
    onTaskStatusChange: vi.fn().mockReturnValue(() => {}),
    onTaskUpdate: vi.fn().mockReturnValue(() => {}),
    onTaskUpdateBatch: vi.fn().mockReturnValue(() => {}),
    onPermissionRequest: vi.fn().mockReturnValue(() => {}),

    // Settings / preferences
    setOnboardingComplete: vi.fn().mockResolvedValue(undefined),
    getDebugMode: vi.fn().mockResolvedValue(false),
    setDebugMode: vi.fn().mockResolvedValue(undefined),
    getSelectedModel: vi.fn().mockResolvedValue({ provider: 'anthropic', model: 'anthropic/claude-opus-4-5' }),
    setSelectedModel: vi.fn().mockResolvedValue(undefined),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),

    // API key management
    hasAnyApiKey: vi.fn().mockResolvedValue(true),
    getApiKeys: vi.fn().mockResolvedValue([]),
    addApiKey: vi.fn().mockResolvedValue({ id: 'key-1', provider: 'anthropic', keyPrefix: 'sk-ant-...' }),
    removeApiKey: vi.fn().mockResolvedValue(undefined),
    validateApiKeyForProvider: vi.fn().mockResolvedValue({ valid: true }),

    // Ollama
    getOllamaConfig: vi.fn().mockResolvedValue(null),
    testOllamaConnection: vi.fn().mockResolvedValue({ success: false, error: 'Not configured' }),
    setOllamaConfig: vi.fn().mockResolvedValue(undefined),

    // Analytics / logging
    logEvent: vi.fn().mockResolvedValue(undefined),

    // Permission
    respondToPermission: vi.fn().mockResolvedValue(undefined),

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockStoreState
// ---------------------------------------------------------------------------

/**
 * Returns a default mock taskStore state object. Pass overrides via spread
 * to customise for a specific test.
 */
export function createMockStoreState(overrides: Record<string, unknown> = {}) {
  return {
    tasks: [] as Task[],
    currentTask: null as Task | null,
    isLoading: false,
    error: null as string | null,

    // Task list actions
    loadTasks: vi.fn(),
    loadTaskById: vi.fn(),
    deleteTask: vi.fn(),
    clearHistory: vi.fn(),

    // Task mutation actions
    startTask: vi.fn(),
    cancelTask: vi.fn(),
    interruptTask: vi.fn(),
    sendFollowUp: vi.fn(),
    updateTaskStatus: vi.fn(),
    addTaskUpdate: vi.fn(),
    addTaskUpdateBatch: vi.fn(),
    respondToPermission: vi.fn(),
    setPermissionRequest: vi.fn(),
    permissionRequest: null,

    // UI state
    isLauncherOpen: false,
    closeLauncher: vi.fn(),
    reset: vi.fn(),

    // Setup progress
    setupProgress: null as string | null,
    setupProgressTaskId: null as string | null,
    setupDownloadStep: 1,

    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockTask
// ---------------------------------------------------------------------------

/**
 * Factory for Task objects with sensible defaults. Supply overrides to
 * customise individual fields.
 */
export function createMockTask(overrides: Partial<Task> & { id?: string } = {}): Task {
  return {
    id: 'task-1',
    prompt: 'Test task',
    status: 'completed' as TaskStatus,
    messages: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockMessage
// ---------------------------------------------------------------------------

/**
 * Factory for TaskMessage objects.
 */
export function createMockMessage(overrides: Partial<TaskMessage> & { id?: string } = {}): TaskMessage {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: 'Test message',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// framerMotionMock
// ---------------------------------------------------------------------------

/**
 * Standard framer-motion mock that returns passthrough DOM elements.
 * Covers: motion.div, motion.p, motion.button, motion.h1, motion.span
 * and AnimatePresence.
 */
function motionPassthrough(Tag: string) {
  return ({ children, className, ...props }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => {
    // Strip framer-motion-specific props so they don't leak to the DOM
    const {
      initial, animate, exit, transition, variants,
      whileHover, whileTap, whileFocus, whileInView,
      layout, layoutId, drag, dragConstraints,
      ...domProps
    } = props;
    return React.createElement(Tag, { className, ...domProps }, children);
  };
}

export const framerMotionMock = {
  motion: {
    div: motionPassthrough('div'),
    p: motionPassthrough('p'),
    button: motionPassthrough('button'),
    h1: motionPassthrough('h1'),
    span: motionPassthrough('span'),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
};

// ---------------------------------------------------------------------------
// analyticsMock
// ---------------------------------------------------------------------------

/**
 * Standard analytics mock covering every analytics method used across tests.
 */
export const analyticsMock = {
  analytics: {
    trackPageView: vi.fn(),
    trackNewTask: vi.fn(),
    trackSubmitTask: vi.fn(),
    trackOpenSettings: vi.fn(),
    trackToggleDebugMode: vi.fn(),
    trackSelectModel: vi.fn(),
    trackSaveApiKey: vi.fn(),
    trackSelectProvider: vi.fn(),
  },
};

// ---------------------------------------------------------------------------
// animationsMock
// ---------------------------------------------------------------------------

/**
 * Standard mock for the @/lib/animations module.
 */
export const animationsMock = {
  springs: {
    bouncy: { type: 'spring', stiffness: 300 },
    gentle: { type: 'spring', stiffness: 200 },
  },
  variants: {
    fadeUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
    },
  },
  staggerContainer: {},
  staggerItem: {},
};

// ---------------------------------------------------------------------------
// renderWithRouter
// ---------------------------------------------------------------------------

/**
 * Renders a component wrapped in a MemoryRouter. Defaults to route '/'.
 */
export function renderWithRouter(ui: React.ReactElement, route: string = '/') {
  return render(
    React.createElement(MemoryRouter, { initialEntries: [route] }, ui)
  );
}
