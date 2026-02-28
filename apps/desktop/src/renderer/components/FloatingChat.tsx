'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { flushSync } from 'react-dom';
import {
  Camera,
  Loader2,
  Bot,
  Monitor,
  MonitorOff,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '../lib/utils';
import {
  getAccomplish,
  type DesktopControlStatusPayload,
} from '../lib/accomplish';
import { DEFAULT_PROVIDERS, type SelectedModel, type Task, type TaskMessage } from '@accomplish/shared';
import { DesktopControlShell } from './desktop-control/DesktopControlShell';
import { useDesktopControlPreferences } from './desktop-control/useDesktopControlPreferences';
import { useDesktopControlStatus } from './desktop-control/useDesktopControlStatus';
import {
  buildDesktopControlBlockedMessage,
  createDesktopControlBlockerKey,
  getDesktopControlBlockedCapabilities,
  shouldEmitDesktopControlFallback,
  type DesktopControlRequirement,
} from './desktop-control/fallbackGuard';
import {
  LIVE_GUIDANCE_PROMPT_APPEND,
  LIVE_VIEW_HINTS,
  SCREEN_CAPTURE_PROMPT_APPEND,
  appendWorkWithContext,
  inferDesktopControlRequirement,
} from '../lib/desktopControlPrompt';
import { useSpeechDictation } from '../hooks/useSpeechDictation';
import { useActivityTracking } from '../hooks/useActivityTracking';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { useChatGlobalShortcuts } from '../hooks/useChatGlobalShortcuts';
import { ScreenViewer } from './screen-viewer';
import type { Message } from './chat/types';
import { MessageBubble } from './chat/MessageBubble';
import { ChatHeader } from './chat/ChatHeader';
import { ChatMenuPanel } from './chat/ChatMenuPanel';
import { ChatInputToolbar } from './chat/ChatInputToolbar';

export type { Message } from './chat/types';

interface FloatingChatProps {
  onOpenSettings?: () => void;
}

const SCREEN_CAPTURE_REQUIREMENT: DesktopControlRequirement = {
  blockedAction: 'screenshots',
  capabilities: ['screen_capture', 'mcp_health'],
};

const MINIMIZED_ICON_SCALE = 4;
const BASE_MINIMIZED_BUTTON_SIZE = 112;
const BASE_MINIMIZED_ICON_SIZE = 96;

function mergeConsecutiveAssistantMessages(source: Message[]): Message[] {
  const merged: Message[] = [];

  for (const message of source) {
    const last = merged[merged.length - 1];

    if (message.role === 'assistant' && last?.role === 'assistant') {
      const combinedAttachments = [
        ...(last.attachments ?? []),
        ...(message.attachments ?? []),
      ];

      if (last.content.trim() === message.content.trim()) {
        merged[merged.length - 1] = {
          ...last,
          timestamp: message.timestamp,
          attachments: combinedAttachments.length > 0 ? combinedAttachments : undefined,
        };
      } else {
        merged[merged.length - 1] = {
          ...last,
          id: `${last.id}__merged_with__${message.id}`,
          content: `${last.content}\n\n${message.content}`,
          timestamp: message.timestamp,
          attachments: combinedAttachments.length > 0 ? combinedAttachments : undefined,
        };
      }

      continue;
    }

    merged.push(message);
  }

  return merged;
}

export function FloatingChat({ onOpenSettings }: FloatingChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskHistory, setTaskHistory] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showMenuPanel, setShowMenuPanel] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [showLiveViewer, setShowLiveViewer] = useState(false);
  const [recentlyHidLiveViewer, setRecentlyHidLiveViewer] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);
  const [isUpdatingModel, setIsUpdatingModel] = useState(false);
  const [selectedWorkWithApp, setSelectedWorkWithApp] = useState<string | null>(null);
  const [liveGuidanceEnabled, setLiveGuidanceEnabled] = useState(false);
  const [screenCaptureQueued, setScreenCaptureQueued] = useState(false);
  const [pendingVoiceSend, setPendingVoiceSend] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isCancellingRef = useRef(false);
  const lastDesktopControlBlockerKeyRef = useRef<string | null>(null);
  const isLoadingRef = useRef(isLoading);
  const currentTaskIdRef = useRef<string | null>(currentTaskId);
  const sessionIdRef = useRef<string | null>(sessionId);
  const selectedTaskIdRef = useRef<string | null>(selectedTaskId);
  const accomplish = getAccomplish();
  const displayMessages = useMemo(() => mergeConsecutiveAssistantMessages(messages), [messages]);
  const availableModels = useMemo(
    () => DEFAULT_PROVIDERS.flatMap((provider) => provider.models),
    []
  );
  const modelLabelById = useMemo(
    () => new Map(availableModels.map((model) => [model.fullId, model.displayName])),
    [availableModels]
  );
  const { preferences: desktopControlPreferences, setPreferences: setDesktopControlPreferences } =
    useDesktopControlPreferences();
  const {
    liveGuidanceByDefault,
    screenCaptureByDefault,
    keepDiagnosticsPanelVisible,
  } = desktopControlPreferences;
  const selectedModelLabel = selectedModel?.model
    ? (modelLabelById.get(selectedModel.model) ?? selectedModel.model)
    : 'Choose model';
  const {
    status: desktopControlStatus,
    errorMessage: desktopControlError,
    isChecking: isCheckingDesktopControl,
    checkStatus: checkDesktopControlStatus,
  } = useDesktopControlStatus();
  const filteredTaskHistory = useMemo(() => {
    const normalizedQuery = menuSearchQuery.trim().toLowerCase();
    const ordered = taskHistory.slice().reverse();

    if (!normalizedQuery) {
      return ordered;
    }

    return ordered.filter((task) => {
      const label = (task.summary || task.prompt || 'Untitled chat').toLowerCase();
      return label.includes(normalizedQuery);
    });
  }, [menuSearchQuery, taskHistory]);

  // Extracted hooks
  useActivityTracking();
  useTextToSpeech({ messages, isLoadingRef });

  useEffect(() => {
    if (!recentlyHidLiveViewer) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentlyHidLiveViewer(false);
    }, 7000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [recentlyHidLiveViewer]);

  const refreshTaskHistory = useCallback(async () => {
    try {
      const tasks = await accomplish.listTasks();
      setTaskHistory(tasks);
    } catch (error) {
      console.error('[FloatingChat] Failed to refresh task history:', error);
    }
  }, [accomplish]);

  const addAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
      },
    ]);
  }, []);

  const hydrateFromTask = useCallback((task: Task) => {
    if (task.messages && task.messages.length > 0) {
      const loadedMessages: Message[] = task.messages.map((msg) => ({
        id: msg.id,
        role: msg.type as 'user' | 'assistant' | 'tool',
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        attachments: msg.attachments
          ?.filter((a) => a.type === 'screenshot')
          .map((a) => ({
            type: 'screenshot' as const,
            data: a.data,
          })),
      }));

      setMessages(loadedMessages);
    } else {
      setMessages([]);
    }

    setCurrentTaskId(task.id);
    currentTaskIdRef.current = task.id;
    setSelectedTaskId(task.id);
    selectedTaskIdRef.current = task.id;

    const session = task.sessionId || task.result?.sessionId || null;
    sessionIdRef.current = session;
    setSessionId(session);
  }, []);

  const {
    isSupported: isDictationSupported,
    isListening: isDictating,
    startDictation,
    stopDictation,
    toggleDictation,
  } = useSpeechDictation({
    value: input,
    onChange: setInput,
    onError: setDictationError,
  });

  useEffect(() => {
    if (!dictationError) {
      return;
    }

    const timeout = setTimeout(() => {
      setDictationError(null);
    }, 6000);

    return () => clearTimeout(timeout);
  }, [dictationError]);

  useEffect(() => {
    if (keepDiagnosticsPanelVisible) {
      setShowDiagnosticsPanel(true);
    }
  }, [keepDiagnosticsPanelVisible]);

  const checkDesktopControl = useCallback(async (
    options: { revealIfBlocked?: boolean; forceRefresh?: boolean } = {}
  ): Promise<DesktopControlStatusPayload | null> => {
    const { revealIfBlocked = false, forceRefresh = false } = options;

    try {
      const status = await checkDesktopControlStatus({ forceRefresh });

      if (!status) {
        if (revealIfBlocked) {
          setShowDiagnosticsPanel(true);
        }
        return null;
      }

      if (status.status === 'ready') {
        if (!keepDiagnosticsPanelVisible) {
          setShowDiagnosticsPanel(false);
        }
      } else if (revealIfBlocked) {
        setShowDiagnosticsPanel(true);
      }

      return status;
    } catch {
      if (revealIfBlocked) {
        setShowDiagnosticsPanel(true);
      }
      return null;
    }
  }, [checkDesktopControlStatus, keepDiagnosticsPanelVisible]);

  // Extracted global shortcuts hook
  useChatGlobalShortcuts({
    isLoading,
    isDictationSupported,
    toggleDictation,
    inputRef,
    setShowMenuPanel,
    setLiveGuidanceEnabled,
    setShowLiveViewer,
    setScreenCaptureQueued,
    setDictationError,
    checkDesktopControl,
    onOpenSettings,
  });

  const ensureDesktopControlReady = useCallback(async (
    requirement: DesktopControlRequirement
  ): Promise<boolean> => {
    const status = await checkDesktopControl({
      revealIfBlocked: true,
      forceRefresh: true,
    });

    if (!status) {
      const blockerKey = `desktop-control-unverified:${requirement.blockedAction}`;
      if (
        shouldEmitDesktopControlFallback(lastDesktopControlBlockerKeyRef.current, blockerKey)
      ) {
        addAssistantMessage(
          'I could not verify desktop-control readiness. Open Diagnostics and press Recheck.'
        );
      }
      lastDesktopControlBlockerKeyRef.current = blockerKey;
      return false;
    }

    const blockedCapabilities = getDesktopControlBlockedCapabilities(status, requirement);
    if (blockedCapabilities.length > 0) {
      const blockerKey = createDesktopControlBlockerKey(status, requirement);
      if (shouldEmitDesktopControlFallback(lastDesktopControlBlockerKeyRef.current, blockerKey)) {
        addAssistantMessage(buildDesktopControlBlockedMessage(status, requirement));
      }
      lastDesktopControlBlockerKeyRef.current = blockerKey;
      return false;
    }

    lastDesktopControlBlockerKeyRef.current = null;
    return true;
  }, [addAssistantMessage, checkDesktopControl]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const target = messagesEndRef.current;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayMessages, isLoading]);

  // Initial desktop-control readiness check on mount
  useEffect(() => {
    void checkDesktopControl({ revealIfBlocked: true });
  }, [checkDesktopControl]);

  useEffect(() => {
    const loadSelectedModel = async () => {
      try {
        const model = await accomplish.getSelectedModel();
        if (!model) {
          return;
        }
        setSelectedModel(model as SelectedModel);
      } catch (error) {
        console.error('[FloatingChat] Failed to load selected model:', error);
      }
    };

    void loadSelectedModel();
  }, [accomplish]);

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const tasks = await accomplish.listTasks();
        setTaskHistory(tasks);
        if (tasks.length > 0) {
          const latestTask = tasks[0];
          hydrateFromTask(latestTask);
        }
      } catch (error) {
        console.error('[FloatingChat] Failed to load conversation history:', error);
      }
    };

    void loadHistory();
  }, [accomplish, hydrateFromTask]);

  // Subscribe to task events
  useEffect(() => {
    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      const activeTaskId = currentTaskIdRef.current ?? selectedTaskIdRef.current;
      if (!activeTaskId || event.taskId !== activeTaskId) {
        return;
      }

      if (event.type === 'message' && event.message) {
        const msg = event.message as TaskMessage;

        // Convert to our message format
        if (msg.type === 'assistant' && msg.content) {
          setMessages(prev => [...prev, {
            id: msg.id,
            role: 'assistant',
            content: msg.content,
            timestamp: new Date(msg.timestamp),
            attachments: msg.attachments?.filter(a => a.type === 'screenshot').map(a => ({
              type: 'screenshot' as const,
              data: a.data,
            })),
          }]);
        } else if (msg.type === 'tool' && msg.attachments?.length) {
          // Tool messages with screenshots
          const screenshots = msg.attachments.filter(a => a.type === 'screenshot');
          if (screenshots.length > 0) {
            setMessages(prev => [...prev, {
              id: msg.id,
              role: 'tool',
              content: msg.content || 'Screenshot captured',
              timestamp: new Date(msg.timestamp),
              attachments: screenshots.map(a => ({
                type: 'screenshot' as const,
                data: a.data,
              })),
            }]);
          }
        }
      }

      if (event.type === 'complete') {
        // Ignore completion events from tasks being cancelled (a new task is starting)
        if (isCancellingRef.current) return;
        isLoadingRef.current = false;
        setIsLoading(false);
        void refreshTaskHistory();
        if (event.result?.sessionId) {
          sessionIdRef.current = event.result.sessionId;
          setSessionId(event.result.sessionId);
        }
      }

      if (event.type === 'error') {
        // Ignore error events from tasks being cancelled
        if (isCancellingRef.current) return;
        isLoadingRef.current = false;
        setIsLoading(false);
        void refreshTaskHistory();
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: `Error: ${event.error || 'Something went wrong'}`,
          timestamp: new Date(),
        }]);
      }
    });

    // Handle batched updates
    const unsubscribeBatch = accomplish.onTaskUpdateBatch?.((event) => {
      const activeTaskId = currentTaskIdRef.current ?? selectedTaskIdRef.current;
      if (!activeTaskId || event.taskId !== activeTaskId) {
        return;
      }

      if (event.messages?.length) {
        const newMessages: Message[] = [];

        for (const msg of event.messages) {
          if (msg.type === 'assistant' && msg.content) {
            newMessages.push({
              id: msg.id,
              role: 'assistant',
              content: msg.content,
              timestamp: new Date(msg.timestamp),
              attachments: msg.attachments?.filter(a => a.type === 'screenshot').map(a => ({
                type: 'screenshot' as const,
                data: a.data,
              })),
            });
          }
        }

        if (newMessages.length > 0) {
          setMessages(prev => [...prev, ...newMessages]);
        }
      }
    });

    return () => {
      unsubscribeTask();
      unsubscribeBatch?.();
    };
  }, [accomplish, refreshTaskHistory]);

  const applyWorkWithContext = useCallback(
    (prompt: string) => appendWorkWithContext(prompt, selectedWorkWithApp),
    [selectedWorkWithApp]
  );

  const launchTaskForPrompt = useCallback(async (effectivePrompt: string) => {
    const resumeSessionId = sessionIdRef.current;
    const existingTaskId = currentTaskIdRef.current ?? selectedTaskIdRef.current ?? undefined;

    if (resumeSessionId) {
      const task = await accomplish.resumeSession(resumeSessionId, effectivePrompt, existingTaskId);
      currentTaskIdRef.current = task.id;
      setCurrentTaskId(task.id);
      setSelectedTaskId(task.id);
      sessionIdRef.current = resumeSessionId;
      setSessionId(resumeSessionId);
      return task;
    }

    const nextTaskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    currentTaskIdRef.current = nextTaskId;
    const task = await accomplish.startTask({
      prompt: effectivePrompt,
      taskId: nextTaskId,
    });
    currentTaskIdRef.current = task.id;
    setCurrentTaskId(task.id);
    setSelectedTaskId(task.id);
    sessionIdRef.current = null;
    setSessionId(null);
    return task;
  }, [accomplish]);

  // Send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    setShowMenuPanel(false);

    const prompt = input.trim();
    const armedLiveGuidance = liveGuidanceEnabled;
    const shouldUseLiveGuidance =
      armedLiveGuidance || liveGuidanceByDefault || LIVE_VIEW_HINTS.test(prompt);
    const shouldIncludeScreenCapture = screenCaptureQueued || screenCaptureByDefault;
    let basePrompt = shouldUseLiveGuidance
      ? `${prompt}\n${LIVE_GUIDANCE_PROMPT_APPEND}`
      : prompt;
    if (shouldIncludeScreenCapture) {
      basePrompt = `${basePrompt}\n${SCREEN_CAPTURE_PROMPT_APPEND}`;
    }
    const effectivePrompt = applyWorkWithContext(basePrompt);
    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setScreenCaptureQueued(false);
    if (armedLiveGuidance) {
      setLiveGuidanceEnabled(false);
    }
    setIsLoading(true);

    try {
      // Check if we have an API key
      const hasKey = await accomplish.hasAnyApiKey();
      if (!hasKey) {
        setIsLoading(false);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: 'Please add your API key in Settings first.',
          timestamp: new Date(),
        }]);
        onOpenSettings?.();
        return;
      }

      const desktopControlRequirement = inferDesktopControlRequirement(effectivePrompt);
      if (desktopControlRequirement) {
        const desktopControlReady = await ensureDesktopControlReady(desktopControlRequirement);
        if (!desktopControlReady) {
          setIsLoading(false);
          return;
        }
      }

      if (shouldUseLiveGuidance) {
        setShowLiveViewer(true);
      }

      // Cancel any existing task before starting a new one
      if (currentTaskId) {
        try {
          isCancellingRef.current = true;
          await accomplish.cancelTask(currentTaskId);
        } catch {
          // Ignore errors when cancelling - task may already be completed
        } finally {
          isCancellingRef.current = false;
        }
      }

      const task = await launchTaskForPrompt(effectivePrompt);
      currentTaskIdRef.current = task.id;
      setCurrentTaskId(task.id);
      setSelectedTaskId(task.id);

      void refreshTaskHistory();
    } catch (error) {
      currentTaskIdRef.current = null;
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date(),
      }]);
    }
  }, [
    input,
    isLoading,
    liveGuidanceEnabled,
    liveGuidanceByDefault,
    currentTaskId,
    applyWorkWithContext,
    accomplish,
    onOpenSettings,
    ensureDesktopControlReady,
    refreshTaskHistory,
    screenCaptureByDefault,
    screenCaptureQueued,
  ]);

  // Quick action: capture screen
  const captureScreen = useCallback(async () => {
    if (isLoading) return;
    setShowMenuPanel(false);

    const desktopControlReady = await ensureDesktopControlReady(SCREEN_CAPTURE_REQUIREMENT);
    if (!desktopControlReady) {
      return;
    }

    const prompt = "Take a screenshot and describe what you see on my screen.";
    const effectivePrompt = applyWorkWithContext(prompt);

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const hasKey = await accomplish.hasAnyApiKey();
      if (!hasKey) {
        setIsLoading(false);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: 'Please add your API key in Settings first.',
          timestamp: new Date(),
        }]);
        onOpenSettings?.();
        return;
      }

      if (currentTaskId) {
        try {
          await accomplish.cancelTask(currentTaskId);
        } catch {
          // Ignore errors when cancelling
        }
      }

      const task = await launchTaskForPrompt(effectivePrompt);
      currentTaskIdRef.current = task.id;
      setCurrentTaskId(task.id);
      setSelectedTaskId(task.id);

      void refreshTaskHistory();
    } catch (error) {
      currentTaskIdRef.current = null;
      setIsLoading(false);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to capture screen'}`,
        timestamp: new Date(),
      }]);
    }
  }, [
    isLoading,
    accomplish,
    currentTaskId,
    applyWorkWithContext,
    onOpenSettings,
    ensureDesktopControlReady,
    refreshTaskHistory,
  ]);

  const armLiveGuidanceForNextMessage = useCallback(() => {
    if (isLoading) return;
    setShowMenuPanel(false);
    setLiveGuidanceEnabled(true);
    setShowLiveViewer(true);
    inputRef.current?.focus();
  }, [isLoading]);

  const recheckDesktopControl = useCallback(() => {
    void checkDesktopControl({
      revealIfBlocked: true,
      forceRefresh: true,
    });
  }, [checkDesktopControl]);

  const handleModelChange = useCallback(
    async (nextModelId: string) => {
      const nextModel = availableModels.find((model) => model.fullId === nextModelId);
      if (!nextModel) {
        return;
      }

      setIsUpdatingModel(true);
      try {
        const nextSelection: SelectedModel = {
          provider: nextModel.provider,
          model: nextModel.fullId,
        };
        await accomplish.setSelectedModel(nextSelection);
        setSelectedModel(nextSelection);
      } catch (error) {
        addAssistantMessage('I could not switch models right now. Please try again.');
        console.error('[FloatingChat] Failed to update selected model:', error);
      } finally {
        setIsUpdatingModel(false);
      }
    },
    [accomplish, addAssistantMessage, availableModels]
  );

  const handleSelectWorkWithApp = useCallback(
    (appName: string) => {
      setSelectedWorkWithApp(appName);
      addAssistantMessage(`Work with ${appName} is active. I will focus on ${appName} context in this chat.`);
      inputRef.current?.focus();
    },
    [addAssistantMessage]
  );

  const handleTalkToAgent = useCallback(() => {
    if (isLoading || !isDictationSupported) {
      return;
    }

    if (isDictating) {
      setPendingVoiceSend(true);
      stopDictation();
      return;
    }

    setPendingVoiceSend(false);
    setDictationError(null);
    startDictation();
    inputRef.current?.focus();
  }, [isDictationSupported, isDictating, isLoading, startDictation, stopDictation]);

  const stopCurrentTask = useCallback(async () => {
    const activeTaskId = currentTaskIdRef.current;
    if (!activeTaskId) {
      return;
    }

    try {
      if (typeof accomplish.interruptTask === 'function') {
        await accomplish.interruptTask(activeTaskId);
      } else {
        await accomplish.cancelTask(activeTaskId);
      }
      isLoadingRef.current = false;
      setIsLoading(false);
      void refreshTaskHistory();
    } catch (error) {
      addAssistantMessage('I could not stop the current task. Please try again.');
      console.error('[FloatingChat] Failed to stop active task:', error);
    }
  }, [accomplish, addAssistantMessage, refreshTaskHistory]);

  useEffect(() => {
    if (!pendingVoiceSend || isDictating) {
      return;
    }

    setPendingVoiceSend(false);
    if (!input.trim() || isLoading) {
      return;
    }

    void sendMessage();
  }, [pendingVoiceSend, isDictating, input, isLoading, sendMessage]);

  const shouldShowDesktopControlShell =
    keepDiagnosticsPanelVisible ||
    showDiagnosticsPanel ||
    isCheckingDesktopControl ||
    !desktopControlStatus ||
    Boolean(desktopControlError);

  // Select a previous chat by task ID
  const handleSelectTask = useCallback(
    async (taskId: string) => {
      setSelectedTaskId(taskId);
      selectedTaskIdRef.current = taskId;
      isLoadingRef.current = false;
      setIsLoading(false);
      setShowMenuPanel(false);

      try {
        const task = await accomplish.getTask(taskId);
        if (!task) return;
        hydrateFromTask(task);
      } catch (error) {
        console.error('[FloatingChat] Failed to load task for history selection:', error);
      }
    },
    [accomplish, hydrateFromTask]
  );

  // Start a brand new chat without any previous context
  const handleNewChat = useCallback(async () => {
    if (currentTaskIdRef.current) {
      try {
        await accomplish.cancelTask(currentTaskIdRef.current);
      } catch {
        // Ignore if task already completed/cancelled
      }
    }

    setMessages([]);
    setInput('');
    isLoadingRef.current = false;
    setIsLoading(false);
    setCurrentTaskId(null);
    currentTaskIdRef.current = null;
    setSessionId(null);
    sessionIdRef.current = null;
    setSelectedTaskId(null);
    selectedTaskIdRef.current = null;
    setShowMenuPanel(false);
  }, [accomplish]);

  const headerStatus = isLoading
    ? 'Thinking...'
    : shouldShowDesktopControlShell
      ? 'Desktop control setup needed'
      : 'Ready to help';

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && isLoading) {
      e.preventDefault();
      void stopCurrentTask();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isDictating) {
        stopDictation();
        return;
      }
      sendMessage();
    }
  };

  const collapseToIcon = useCallback(async () => {
    flushSync(() => {
      setIsMinimized(true);
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    try {
      await accomplish.collapseToIconWindow?.();
    } catch (error) {
      console.warn('[FloatingChat] Failed to collapse window to icon:', error);
    }
  }, [accomplish]);

  const expandFromIcon = useCallback(async () => {
    try {
      await accomplish.expandFromIconWindow?.();
    } catch (error) {
      console.warn('[FloatingChat] Failed to expand window from icon:', error);
    } finally {
      setIsMinimized(false);
    }
  }, [accomplish]);

  const minimizedButtonSize = BASE_MINIMIZED_BUTTON_SIZE * MINIMIZED_ICON_SCALE;
  const minimizedIconSize = BASE_MINIMIZED_ICON_SIZE * MINIMIZED_ICON_SCALE;

  // Minimized view
  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.72, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="h-screen w-screen bg-transparent"
      >
        <div className="flex h-full w-full items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void expandFromIcon()}
              className="rounded-none bg-transparent p-0 transition-transform duration-300 hover:bg-transparent"
              style={{ width: minimizedButtonSize, height: minimizedButtonSize }}
              title="Open Screen Agent"
              aria-label="Open Screen Agent"
            >
              <motion.svg
                viewBox="0 0 64 64"
                className="drop-shadow-[0_10px_30px_rgba(37,211,102,0.45)]"
                style={{ width: minimizedIconSize, height: minimizedIconSize }}
                animate={{
                  y: [0, -6, 0],
                  rotate: [0, -2, 0, 2, 0],
                  scale: [1, 1.035, 1],
                }}
                transition={{
                  duration: 3.1,
                  ease: 'easeInOut',
                  repeat: Infinity,
                }}
                aria-hidden="true"
              >
                <circle cx="30" cy="30" r="22" fill="#25D366" />
                <path d="M44 44L56 54L50 40Z" fill="#25D366" />
                <circle cx="22" cy="30" r="3.6" fill="#ffffff" />
                <circle cx="30" cy="30" r="3.6" fill="#ffffff" />
                <circle cx="38" cy="30" r="3.6" fill="#ffffff" />
              </motion.svg>
            </Button>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={cn(
        'fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)]',
        showMenuPanel ? 'w-[680px]' : 'w-[420px]'
      )}
    >
      <Card className="flex flex-col h-[600px] shadow-2xl border-border/50 overflow-hidden bg-background/95 backdrop-blur-xl">
        {/* Header */}
        <ChatHeader
          selectedModel={selectedModel}
          selectedModelLabel={selectedModelLabel}
          isUpdatingModel={isUpdatingModel}
          availableModels={availableModels}
          selectedWorkWithApp={selectedWorkWithApp}
          headerStatus={headerStatus}
          showMenuPanel={showMenuPanel}
          onToggleMenuPanel={() => setShowMenuPanel((value) => !value)}
          onModelChange={handleModelChange}
          onCollapse={() => void collapseToIcon()}
        />

        <div className="flex flex-1 min-h-0">
          <AnimatePresence initial={false}>
            {showMenuPanel && (
              <ChatMenuPanel
                filteredTaskHistory={filteredTaskHistory}
                menuSearchQuery={menuSearchQuery}
                selectedTaskId={selectedTaskId}
                onSearchChange={setMenuSearchQuery}
                onNewChat={() => void handleNewChat()}
                onSelectTask={handleSelectTask}
                onOpenSettings={onOpenSettings}
              />
            )}
          </AnimatePresence>

          <div className="flex flex-1 flex-col min-w-0">
            <AnimatePresence initial={false}>
              {shouldShowDesktopControlShell && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="border-b border-border/70 p-3"
                >
                  <DesktopControlShell
                    status={desktopControlStatus}
                    isChecking={isCheckingDesktopControl}
                    errorMessage={desktopControlError}
                    onRecheck={recheckDesktopControl}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {showLiveViewer && (
              <div className="border-b border-border/70 p-3 space-y-2 bg-muted/10">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {liveGuidanceEnabled
                      ? 'Live Guidance is active. Your on-screen actions should appear here in real time.'
                      : 'Live screen preview'}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      setShowLiveViewer(false);
                      setRecentlyHidLiveViewer(true);
                    }}
                    title="Hide live viewer"
                  >
                    <MonitorOff className="h-3.5 w-3.5 mr-1.5" />
                    Hide
                  </Button>
                </div>
                <ScreenViewer autoStart={true} className="h-56" />
              </div>
            )}

            {!showLiveViewer && recentlyHidLiveViewer && (
              <div className="border-b border-border/70 px-3 py-2 bg-muted/10 text-xs flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Live viewer hidden. You can bring it back if you still need on-screen guidance.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => {
                    setRecentlyHidLiveViewer(false);
                    setShowLiveViewer(true);
                  }}
                >
                  Undo
                </Button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {displayMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Hi! I can see your screen.
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Ask me anything about what's on your screen, or let me help you navigate any app.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={captureScreen}
                      className="gap-1.5"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      What's on my screen?
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={armLiveGuidanceForNextMessage}
                      className="gap-1.5"
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      Guide me live
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {displayMessages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  {isLoading && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <ChatInputToolbar
              input={input}
              isLoading={isLoading}
              isDictating={isDictating}
              isDictationSupported={isDictationSupported}
              pendingVoiceSend={pendingVoiceSend}
              dictationError={dictationError}
              selectedWorkWithApp={selectedWorkWithApp}
              screenCaptureQueued={screenCaptureQueued}
              liveGuidanceEnabled={liveGuidanceEnabled}
              liveGuidanceByDefault={liveGuidanceByDefault}
              screenCaptureByDefault={screenCaptureByDefault}
              keepDiagnosticsPanelVisible={keepDiagnosticsPanelVisible}
              inputRef={inputRef}
              onInputChange={setInput}
              onKeyDown={handleKeyDown}
              onSendMessage={sendMessage}
              onStopCurrentTask={stopCurrentTask}
              onToggleDictation={toggleDictation}
              onTalkToAgent={handleTalkToAgent}
              onArmLiveGuidance={armLiveGuidanceForNextMessage}
              onRecheckDesktopControl={recheckDesktopControl}
              onSelectWorkWithApp={handleSelectWorkWithApp}
              onClearWorkWithApp={() => setSelectedWorkWithApp(null)}
              onSetScreenCaptureQueued={setScreenCaptureQueued}
              onSetLiveGuidanceEnabled={setLiveGuidanceEnabled}
              onSetDictationError={setDictationError}
              setDesktopControlPreferences={setDesktopControlPreferences}
              setShowMenuPanel={setShowMenuPanel}
              onOpenSettings={onOpenSettings}
            />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default FloatingChat;
