import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TaskInputBar } from '@/components/landing/TaskInputBar';
import { SettingsDialog } from '@/components/layout/SettingsDialog';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { springs } from '@/lib/animations';
import { ArrowUpLeft } from '@phosphor-icons/react';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';
import { PlusMenu } from '@/components/landing/PlusMenu';
import { IntegrationIcon } from '@/components/landing/IntegrationIcons';

const USE_CASE_KEYS = [
  { key: 'calendarPrepNotes', icons: ['calendar.google.com', 'docs.google.com'] },
  { key: 'inboxPromoCleanup', icons: ['mail.google.com'] },
  { key: 'competitorPricingDeck', icons: ['slides.google.com', 'sheets.google.com'] },
  { key: 'notionApiAudit', icons: ['notion.so'] },
  { key: 'stagingVsProdVisual', icons: ['google.com'] },
  { key: 'prodBrokenLinks', icons: ['google.com'] },
  { key: 'portfolioMonitoring', icons: ['finance.yahoo.com'] },
  { key: 'jobApplicationAutomation', icons: ['linkedin.com'] },
  { key: 'eventCalendarBuilder', icons: ['eventbrite.com', 'calendar.google.com'] },
] as const;

export function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors'
  >('providers');
  const { startTask, interruptTask, isLoading, addTaskUpdate, setPermissionRequest } =
    useTaskStore();
  const navigate = useNavigate();
  const accomplish = useMemo(() => getAccomplish(), []);
  const { t } = useTranslation('home');

  const useCaseExamples = useMemo(() => {
    return USE_CASE_KEYS.map(({ key, icons }) => ({
      title: t(`useCases.${key}.title`),
      description: t(`useCases.${key}.description`),
      prompt: t(`useCases.${key}.prompt`),
      icons,
    }));
  }, [t]);

  useEffect(() => {
    const unsubscribeTask = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    const unsubscribePermission = accomplish.onPermissionRequest((request) => {
      setPermissionRequest(request);
    });

    return () => {
      unsubscribeTask();
      unsubscribePermission();
    };
  }, [addTaskUpdate, setPermissionRequest, accomplish]);

  const executeTask = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    const taskId = `task_${Date.now()}`;
    const task = await startTask({ prompt: prompt.trim(), taskId });
    if (task) {
      navigate(`/execution/${task.id}`);
    }
  }, [prompt, isLoading, startTask, navigate]);

  const handleSubmit = async () => {
    if (isLoading) {
      void interruptTask();
      return;
    }
    if (!prompt.trim()) return;

    const isE2EMode = await accomplish.isE2EMode();
    if (!isE2EMode) {
      const settings = await accomplish.getProviderSettings();
      if (!hasAnyReadyProvider(settings)) {
        setSettingsInitialTab('providers');
        setShowSettingsDialog(true);
        return;
      }
    }

    await executeTask();
  };

  const handleSettingsDialogChange = (open: boolean) => {
    setShowSettingsDialog(open);
    if (!open) {
      setSettingsInitialTab('providers');
    }
  };

  const handleOpenSpeechSettings = useCallback(() => {
    setSettingsInitialTab('voice');
    setShowSettingsDialog(true);
  }, []);

  const handleOpenModelSettings = useCallback(() => {
    setSettingsInitialTab('providers');
    setShowSettingsDialog(true);
  }, []);

  const handleApiKeySaved = async () => {
    setShowSettingsDialog(false);
    if (prompt.trim()) {
      await executeTask();
    }
  };

  const focusPromptTextarea = () => {
    setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="task-input-textarea"]',
      );
      textarea?.focus();
    }, 0);
  };

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
    focusPromptTextarea();
  };

  const handleSkillSelect = (command: string) => {
    setPrompt((prev) => `${command} ${prev}`.trim());
    focusPromptTextarea();
  };

  return (
    <>
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogChange}
        onApiKeySaved={handleApiKeySaved}
        initialTab={settingsInitialTab}
      />

      <div className="h-full flex flex-col bg-accent relative overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 pb-0">
          <div className="w-full max-w-[720px] mx-auto flex flex-col items-center gap-3">
            <motion.h1
              data-testid="home-title"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.gentle}
              className="font-apparat text-[32px] tracking-[-0.015em] text-foreground w-full text-center pt-[250px]"
            >
              {t('title')}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.gentle, delay: 0.1 }}
              className="w-full"
            >
              <TaskInputBar
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                placeholder={t('inputPlaceholder')}
                typingPlaceholder={true}
                large={true}
                autoFocus={true}
                onOpenSpeechSettings={handleOpenSpeechSettings}
                onOpenModelSettings={handleOpenModelSettings}
                hideModelWhenNoModel={true}
                toolbarLeft={
                  <PlusMenu
                    onSkillSelect={handleSkillSelect}
                    onOpenSettings={(tab) => {
                      setSettingsInitialTab(tab);
                      setShowSettingsDialog(true);
                    }}
                    disabled={isLoading}
                  />
                }
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...springs.gentle, delay: 0.2 }}
              className="w-full"
            >
              <div className="flex flex-col gap-3 pt-[200px] pb-[120px]">
                <h2 className="font-apparat text-[22px] font-light tracking-[-0.66px] text-foreground text-center">
                  {t('examplePrompts')}
                </h2>

                <div className="grid grid-cols-3 gap-4 w-full">
                  {useCaseExamples.map((example, index) => (
                    <motion.button
                      key={index}
                      data-testid={`home-example-${index}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleExampleClick(example.prompt)}
                      className="group flex flex-col justify-between rounded-[4px] border border-border hover:border-muted-foreground/40 active:border-muted-foreground/40 bg-accent pl-3 pr-4 py-3 text-left h-[164px] transition-colors"
                    >
                      <div className="flex items-start justify-between w-full">
                        <span className="font-sans text-[14px] leading-[18px] tracking-[-0.28px] text-foreground whitespace-pre-line w-[120px]">
                          {example.title}
                        </span>
                        <span className="shrink-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 group-active:translate-y-0 -scale-y-100 rotate-180">
                          <ArrowUpLeft className="w-4 h-4 text-foreground" weight="regular" />
                        </span>
                      </div>

                      <p className="text-[13px] leading-[15px] tracking-[-0.13px] text-muted-foreground">
                        {example.description}
                      </p>

                      <div className="flex items-center gap-[2px]">
                        {example.icons.map((domain) => (
                          <div
                            key={domain}
                            className="flex items-center rounded-[5.778px] bg-popover p-[3.25px] shrink-0"
                          >
                            <IntegrationIcon domain={domain} className="w-[22px] h-[22px]" />
                          </div>
                        ))}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-t from-accent to-transparent" />
      </div>
    </>
  );
}
