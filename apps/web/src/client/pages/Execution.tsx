import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '../stores/taskStore';
import { getAccomplish } from '../lib/accomplish';
import { springs } from '../lib/animations';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  XCircle,
  CornerDownLeft,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Square,
  Download,
  ChevronDown,
} from 'lucide-react';
import { isWaitingForUser } from '../lib/waiting-detection';
import { SettingsDialog } from '../components/layout/SettingsDialog';
import { TodoSidebar } from '../components/TodoSidebar';
import { ModelIndicator } from '../components/ui/ModelIndicator';
import { useSpeechInput } from '../hooks/useSpeechInput';
import { SpeechInputButton } from '../components/ui/SpeechInputButton';
import { PlusMenu } from '../components/landing/PlusMenu';
import { SpinningIcon } from '../components/execution/SpinningIcon';
import { MessageBubble } from '../components/execution/MessageList';
import { ToolProgress } from '../components/execution/ToolProgress';
import { PermissionDialog } from '../components/execution/PermissionDialog';
import { DebugPanel, type DebugLogEntry } from '../components/execution/DebugPanel';

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function ExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const { t } = useTranslation('execution');
  const { t: tCommon } = useTranslation('common');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [followUp, setFollowUp] = useState('');
  const followUpInputRef = useRef<HTMLTextAreaElement>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [currentToolInput, setCurrentToolInput] = useState<unknown>(null);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors'
  >('providers');
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);
  const pendingSpeechFollowUpRef = useRef<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);

  const {
    currentTask,
    loadTaskById,
    isLoading,
    error,
    addTaskUpdate,
    addTaskUpdateBatch,
    updateTaskStatus,
    setPermissionRequest,
    permissionRequest,
    respondToPermission,
    sendFollowUp,
    interruptTask,
    setupProgress,
    setupProgressTaskId,
    setupDownloadStep,
    startupStage,
    startupStageTaskId,
    clearStartupStage,
    todos,
    todosTaskId,
  } = useTaskStore();

  const speechInput = useSpeechInput({
    onTranscriptionComplete: (text) => {
      setFollowUp((prev) => {
        const newValue = prev.trim() ? `${prev} ${text}` : text;
        pendingSpeechFollowUpRef.current = newValue.trim() ? newValue : null;
        return newValue;
      });
      setTimeout(() => {
        followUpInputRef.current?.focus();
      }, 0);
    },
    onError: () => {},
  });

  const scrollToBottom = useMemo(
    () =>
      debounce(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100),
    [],
  );

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 150;
    const atBottom =
      container.scrollTop + container.clientHeight >= container.scrollHeight - threshold;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    accomplish.getDebugMode().then(setDebugModeEnabled);
    const unsubscribeDebugMode = accomplish.onDebugModeChange?.(({ enabled }) => {
      setDebugModeEnabled(enabled);
    });
    return () => {
      unsubscribeDebugMode?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isShowingStartupStage = startupStageTaskId === id && startupStage && !currentTool;
    if (!isShowingStartupStage) {
      setElapsedTime(0);
      return;
    }
    const calculateElapsed = () => Math.floor((Date.now() - startupStage.startTime) / 1000);
    setElapsedTime(calculateElapsed());
    const interval = setInterval(() => {
      setElapsedTime(calculateElapsed());
    }, 1000);
    return () => clearInterval(interval);
  }, [startupStageTaskId, startupStage, id, currentTool]);

  useEffect(() => {
    if (id) {
      loadTaskById(id);
      setDebugLogs([]);
      setCurrentTool(null);
      setCurrentToolInput(null);
      accomplish.getTodosForTask(id).then((todos) => {
        useTaskStore.getState().setTodos(id, todos);
      });
    }

    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
      if (event.taskId === id && event.type === 'message' && event.message?.type === 'tool') {
        const toolName =
          event.message.toolName || event.message.content?.match(/Using tool: (\w+)/)?.[1];
        if (toolName) {
          setCurrentTool(toolName);
          setCurrentToolInput(event.message.toolInput);
        }
      }
      if (event.taskId === id && event.type === 'message' && event.message?.type === 'assistant') {
        setCurrentTool(null);
        setCurrentToolInput(null);
        if (id) clearStartupStage(id);
      }
      if (event.taskId === id && (event.type === 'complete' || event.type === 'error')) {
        setCurrentTool(null);
        setCurrentToolInput(null);
      }
    });

    const unsubscribeTaskBatch = accomplish.onTaskUpdateBatch?.((event) => {
      if (event.messages?.length) {
        addTaskUpdateBatch(event);
        if (event.taskId === id) {
          const lastMsg = event.messages[event.messages.length - 1];
          if (lastMsg.type === 'assistant') {
            setCurrentTool(null);
            setCurrentToolInput(null);
            if (id) clearStartupStage(id);
          } else if (lastMsg.type === 'tool') {
            const toolName = lastMsg.toolName || lastMsg.content?.match(/Using tool: (\w+)/)?.[1];
            if (toolName) {
              setCurrentTool(toolName);
              setCurrentToolInput(lastMsg.toolInput);
            }
          }
        }
      }
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      if (data.taskId === id) {
        updateTaskStatus(data.taskId, data.status);
      }
    });

    const unsubscribeDebugLog = accomplish.onDebugLog((log) => {
      const entry = log as DebugLogEntry;
      if (entry.taskId === id) {
        setDebugLogs((prev) => [...prev, entry]);
      }
    });

    return () => {
      unsubscribeTask();
      unsubscribeTaskBatch?.();
      unsubscribePermission();
      unsubscribeStatusChange?.();
      unsubscribeDebugLog();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loadTaskById, addTaskUpdate, addTaskUpdateBatch, updateTaskStatus, setPermissionRequest]);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [currentTask?.messages?.length, scrollToBottom, isAtBottom]);

  const isComplete = ['completed', 'failed', 'cancelled', 'interrupted'].includes(
    currentTask?.status ?? '',
  );
  const hasSession = currentTask?.sessionId || currentTask?.result?.sessionId;
  const canFollowUp = isComplete && (hasSession || currentTask?.status === 'interrupted');

  useEffect(() => {
    if (canFollowUp) {
      followUpInputRef.current?.focus();
    }
  }, [canFollowUp]);

  const handleFollowUp = useCallback(async () => {
    if (!followUp.trim()) return;
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setPendingFollowUp(followUp);
        setSettingsInitialTab('providers');
        setShowSettingsDialog(true);
        return;
      }
    }
    await sendFollowUp(followUp);
    setFollowUp('');
  }, [followUp, accomplish, sendFollowUp]);

  const handleSettingsDialogClose = (open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      setPendingFollowUp(null);
      setSettingsInitialTab('providers');
    }
  };

  const handleApiKeySaved = async () => {
    setShowSettingsDialog(false);
    if (pendingFollowUp) {
      await sendFollowUp(pendingFollowUp);
      setFollowUp('');
      setPendingFollowUp(null);
    }
  };

  const handleContinue = async () => {
    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setPendingFollowUp('continue');
        setSettingsInitialTab('providers');
        setShowSettingsDialog(true);
        return;
      }
    }
    await sendFollowUp('continue');
  };

  const handleOpenSpeechSettings = useCallback(() => {
    setSettingsInitialTab('voice');
    setShowSettingsDialog(true);
  }, []);

  const handleOpenModelSettings = useCallback(() => {
    setSettingsInitialTab('providers');
    setShowSettingsDialog(true);
  }, []);

  useEffect(() => {
    if (!pendingSpeechFollowUpRef.current) return;
    if (!canFollowUp || isLoading) return;
    if (followUp !== pendingSpeechFollowUpRef.current) return;
    pendingSpeechFollowUpRef.current = null;
    void handleFollowUp();
  }, [canFollowUp, followUp, handleFollowUp, isLoading]);

  const handlePermissionResponse = async (
    allowed: boolean,
    selectedOpts?: string[],
    customText?: string,
  ) => {
    if (!permissionRequest || !currentTask) return;

    await respondToPermission({
      requestId: permissionRequest.id,
      taskId: permissionRequest.taskId,
      decision: allowed ? 'allow' : 'deny',
      selectedOptions: selectedOpts,
      customText: customText,
    });

    if (!allowed && permissionRequest.type === 'question') {
      interruptTask();
    }
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => navigate('/')}>{tCommon('buttons.goHome')}</Button>
        </Card>
      </div>
    );
  }

  if (!currentTask) {
    return (
      <div className="h-full flex items-center justify-center">
        <SpinningIcon className="h-8 w-8" />
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (currentTask.status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 shrink-0">
            <Clock className="h-3 w-3" />
            {t('status.queued')}
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 shrink-0">
            <span className="animate-shimmer bg-gradient-to-r from-primary via-primary/50 to-primary bg-[length:200%_100%] bg-clip-text text-transparent">
              {t('status.running')}
            </span>
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 shrink-0">
            <CheckCircle2 className="h-3 w-3" />
            {t('status.completed')}
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive shrink-0">
            <XCircle className="h-3 w-3" />
            {t('status.failed')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            <XCircle className="h-3 w-3" />
            {t('status.cancelled')}
          </span>
        );
      case 'interrupted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 shrink-0">
            <Square className="h-3 w-3" />
            {t('status.stopped')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
            {currentTask.status}
          </span>
        );
    }
  };

  return (
    <>
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogClose}
        onApiKeySaved={handleApiKeySaved}
        initialTab={settingsInitialTab}
      />

      <div className="h-full flex flex-col bg-background relative">
        {/* Task header */}
        <div className="flex-shrink-0 border-b border-border bg-card/50 px-6 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="shrink-0 no-drag"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <h1 className="text-base font-medium text-foreground truncate min-w-0">
                  {currentTask.prompt}
                </h1>
                <span data-testid="execution-status-badge">{getStatusBadge()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Browser installation modal */}
        <AnimatePresence>
          {setupProgress &&
            setupProgressTaskId === id &&
            (setupProgress.toLowerCase().includes('download') ||
              setupProgress.includes('% of')) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[12px]"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={springs.bouncy}
                >
                  <Card className="w-[480px] p-6">
                    <div className="flex flex-col items-center text-center gap-4">
                      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <Download className="h-7 w-7 text-primary" />
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        />
                      </div>
                      <div className="w-full">
                        <h3 className="text-lg font-semibold text-foreground mb-1">
                          {t('browserInstall.title')}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {t('browserInstall.description')}
                        </p>
                        {(() => {
                          const percentMatch = setupProgress?.match(/(\d+)%/);
                          const currentPercent = percentMatch ? parseInt(percentMatch[1], 10) : 0;
                          let overallPercent = 0;
                          if (setupDownloadStep === 1) {
                            overallPercent = Math.round(currentPercent * 0.64);
                          } else if (setupDownloadStep === 2) {
                            overallPercent = 64 + Math.round(currentPercent * 0.01);
                          } else {
                            overallPercent = 65 + Math.round(currentPercent * 0.35);
                          }
                          return (
                            <div className="w-full">
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">
                                  {t('browserInstall.downloading')}
                                </span>
                                <span className="text-foreground font-medium">
                                  {overallPercent}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-primary rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${overallPercent}%` }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground mt-4 text-center">
                          {t('browserInstall.oneTimeSetup')}
                        </p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              </motion.div>
            )}
        </AnimatePresence>

        {/* Queued state - full page */}
        {currentTask.status === 'queued' && currentTask.messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-6"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-xl font-semibold text-foreground mb-2">{t('waiting.title')}</h2>
              <p className="text-muted-foreground">{t('waiting.description')}</p>
            </div>
          </motion.div>
        )}

        {/* Queued state - inline */}
        {currentTask.status === 'queued' && currentTask.messages.length > 0 && (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {currentTask.messages
                .filter((m) => !(m.type === 'tool' && m.toolName?.toLowerCase() === 'bash'))
                .map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.gentle}
                className="flex flex-col items-center gap-4 py-8"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{t('waiting.title')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('waiting.followUpDescription')}
                  </p>
                </div>
              </motion.div>

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Messages - normal state */}
        {currentTask.status !== 'queued' && (
          <div className="flex-1 flex overflow-hidden">
            <div
              className="flex-1 overflow-y-auto px-6 py-6"
              ref={scrollContainerRef}
              onScroll={handleScroll}
              data-testid="messages-scroll-container"
            >
              <div className="max-w-4xl mx-auto space-y-4">
                {currentTask.messages
                  .filter((m) => !(m.type === 'tool' && m.toolName?.toLowerCase() === 'bash'))
                  .map((message, index, filteredMessages) => {
                    const isLastMessage = index === filteredMessages.length - 1;
                    const isLastAssistantMessage = message.type === 'assistant' && isLastMessage;
                    let lastAssistantIndex = -1;
                    for (let i = filteredMessages.length - 1; i >= 0; i--) {
                      if (filteredMessages[i].type === 'assistant') {
                        lastAssistantIndex = i;
                        break;
                      }
                    }
                    const isLastAssistantForContinue = index === lastAssistantIndex;
                    const showContinue =
                      isLastAssistantForContinue &&
                      !!hasSession &&
                      (currentTask.status === 'interrupted' ||
                        (currentTask.status === 'completed' && isWaitingForUser(message.content)));
                    return (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        shouldStream={isLastAssistantMessage && currentTask.status === 'running'}
                        isLastMessage={isLastMessage}
                        isRunning={currentTask.status === 'running'}
                        showContinueButton={showContinue}
                        continueLabel={
                          currentTask.status === 'interrupted'
                            ? tCommon('buttons.continue')
                            : tCommon('buttons.doneContinue')
                        }
                        onContinue={handleContinue}
                        isLoading={isLoading}
                      />
                    );
                  })}

                <ToolProgress
                  isRunning={currentTask.status === 'running'}
                  hasPermissionRequest={!!permissionRequest}
                  currentTool={currentTool}
                  currentToolInput={currentToolInput}
                  startupStageTaskId={startupStageTaskId}
                  startupStage={startupStage}
                  taskId={id}
                  elapsedTime={elapsedTime}
                />

                <div ref={messagesEndRef} />

                <AnimatePresence>
                  {!isAtBottom && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={springs.gentle}
                      className="sticky bottom-4 flex justify-center pointer-events-none"
                    >
                      <button
                        onClick={scrollToBottom}
                        className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80 border border-border shadow-md flex items-center justify-center transition-colors pointer-events-auto"
                        aria-label={tCommon('aria.scrollToBottom')}
                        data-testid="scroll-to-bottom-button"
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {todosTaskId === id && todos.length > 0 && <TodoSidebar todos={todos} />}
            </AnimatePresence>
          </div>
        )}

        {/* Permission Request Modal */}
        <AnimatePresence>
          {permissionRequest && (
            <PermissionDialog
              permissionRequest={permissionRequest}
              onRespond={handlePermissionResponse}
            />
          )}
        </AnimatePresence>

        {/* Running state input with Stop button */}
        {currentTask.status === 'running' && !permissionRequest && (
          <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                <input
                  placeholder={t('agentWorking')}
                  disabled
                  className="flex-1 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
                />
                <ModelIndicator isRunning={true} onOpenSettings={handleOpenModelSettings} />
                <div className="w-px h-6 bg-border flex-shrink-0" />
                <button
                  onClick={interruptTask}
                  title={t('stopAgent')}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors shrink-0"
                  data-testid="execution-stop-button"
                >
                  <span className="block h-2.5 w-2.5 rounded-[2px] bg-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Follow-up input */}
        {canFollowUp && (
          <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4">
            <div className="max-w-4xl mx-auto space-y-2">
              {speechInput.error && (
                <Alert
                  variant="destructive"
                  className="py-2 px-3 flex items-center gap-2 [&>svg]:static [&>svg~*]:pl-0"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs leading-tight">
                    {speechInput.error.message}
                    {speechInput.error.code === 'EMPTY_RESULT' && (
                      <button
                        onClick={() => speechInput.retry()}
                        className="ml-2 underline hover:no-underline"
                        type="button"
                      >
                        {tCommon('buttons.retry')}
                      </button>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <div className="rounded-xl border border-border bg-background shadow-sm transition-all duration-200 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <div className="px-4 pt-3 pb-2">
                  <textarea
                    ref={followUpInputRef}
                    value={followUp}
                    onChange={(e) => {
                      setFollowUp(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleFollowUp();
                      }
                    }}
                    placeholder={
                      currentTask.status === 'interrupted'
                        ? hasSession
                          ? t('followUp.interruptedPlaceholder')
                          : t('followUp.noSessionPlaceholder')
                        : currentTask.status === 'completed'
                          ? t('followUp.completedPlaceholder')
                          : t('followUp.defaultPlaceholder')
                    }
                    disabled={isLoading || speechInput.isRecording}
                    rows={1}
                    className="w-full max-h-[160px] resize-none bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="execution-follow-up-input"
                  />
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50">
                  <PlusMenu
                    onSkillSelect={(command) => {
                      const newValue = `${command} ${followUp}`.trim();
                      setFollowUp(newValue);
                      setTimeout(() => followUpInputRef.current?.focus(), 0);
                    }}
                    onOpenSettings={(tab) => {
                      setSettingsInitialTab(tab);
                      setShowSettingsDialog(true);
                    }}
                    disabled={isLoading || speechInput.isRecording}
                  />
                  <div className="flex items-center gap-2">
                    <ModelIndicator isRunning={false} onOpenSettings={handleOpenModelSettings} />
                    <div className="w-px h-6 bg-border flex-shrink-0" />
                    <SpeechInputButton
                      isRecording={speechInput.isRecording}
                      isTranscribing={speechInput.isTranscribing}
                      recordingDuration={speechInput.recordingDuration}
                      error={speechInput.error}
                      isConfigured={speechInput.isConfigured}
                      disabled={isLoading}
                      onStartRecording={() => speechInput.startRecording()}
                      onStopRecording={() => speechInput.stopRecording()}
                      onRetry={() => speechInput.retry()}
                      onOpenSettings={handleOpenSpeechSettings}
                      size="md"
                    />
                    <button
                      type="button"
                      onClick={handleFollowUp}
                      disabled={!followUp.trim() || isLoading || speechInput.isRecording}
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={tCommon('buttons.send')}
                    >
                      <CornerDownLeft className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completed/Failed state (no session to continue) */}
        {isComplete && !canFollowUp && (
          <div className="flex-shrink-0 border-t border-border bg-card/50 px-6 py-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {t('taskStatus', {
                status:
                  currentTask.status === 'interrupted'
                    ? t('status.stopped').toLowerCase()
                    : currentTask.status,
              })}
            </p>
            <div className="mt-3">
              <Button onClick={() => navigate('/')}>{tCommon('buttons.startNewTask')}</Button>
            </div>
          </div>
        )}

        {/* Debug Panel */}
        {debugModeEnabled && (
          <DebugPanel debugLogs={debugLogs} taskId={id} onClearLogs={() => setDebugLogs([])} />
        )}
      </div>
    </>
  );
}

export default ExecutionPage;
