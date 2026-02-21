import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import TaskInputBar from '../components/landing/TaskInputBar';
import { SettingsDialog } from '../components/layout/SettingsDialog';
import { useTaskStore } from '../stores/taskStore';
import { getAccomplish } from '../lib/accomplish';
import { springs, staggerContainer, staggerItem } from '../lib/animations';
import { Card, CardContent } from '@/components/ui/card';
import { X, CaretDown } from '@phosphor-icons/react';
import { hasAnyReadyProvider } from '@accomplish_ai/agent-core/common';

// Import use case images for proper bundling in production
import calendarPrepNotesImg from '/assets/usecases/calendar-prep-notes.png';
import inboxPromoCleanupImg from '/assets/usecases/inbox-promo-cleanup.png';
import competitorPricingDeckImg from '/assets/usecases/competitor-pricing-deck.png';
import notionApiAuditImg from '/assets/usecases/notion-api-audit.png';
import stagingVsProdVisualImg from '/assets/usecases/staging-vs-prod-visual.png';
import prodBrokenLinksImg from '/assets/usecases/prod-broken-links.png';
import stockPortfolioAlertsImg from '/assets/usecases/stock-portfolio-alerts.png';
import jobApplicationAutomationImg from '/assets/usecases/job-application-automation.png';
import eventCalendarBuilderImg from '/assets/usecases/event-calendar-builder.png';

// Use case keys for i18n
const USE_CASE_KEYS = [
  { key: 'calendarPrepNotes', image: calendarPrepNotesImg },
  { key: 'inboxPromoCleanup', image: inboxPromoCleanupImg },
  { key: 'competitorPricingDeck', image: competitorPricingDeckImg },
  { key: 'notionApiAudit', image: notionApiAuditImg },
  { key: 'stagingVsProdVisual', image: stagingVsProdVisualImg },
  { key: 'prodBrokenLinks', image: prodBrokenLinksImg },
  { key: 'portfolioMonitoring', image: stockPortfolioAlertsImg },
  { key: 'jobApplicationAutomation', image: jobApplicationAutomationImg },
  { key: 'eventCalendarBuilder', image: eventCalendarBuilderImg },
] as const;

const FAVORITES_PREVIEW_COUNT = 6;

export function HomePage() {
  const [prompt, setPrompt] = useState('');
  const [showExamples, setShowExamples] = useState(true);
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'providers' | 'voice' | 'skills' | 'connectors'
  >('providers');
  const location = useLocation();
  const favorites = useTaskStore((state) => state.favorites);
  const favoritesList = Array.isArray(favorites) ? favorites : [];
  const loadFavorites = useTaskStore((state) => state.loadFavorites);
  const removeFavorite = useTaskStore((state) => state.removeFavorite);
  const { startTask, isLoading, addTaskUpdate, setPermissionRequest } = useTaskStore();
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const { t } = useTranslation('home');

  // Build use case examples from translations
  const useCaseExamples = useMemo(() => {
    return USE_CASE_KEYS.map(({ key, image }) => ({
      title: t(`useCases.${key}.title`),
      description: t(`useCases.${key}.description`),
      prompt: t(`useCases.${key}.prompt`),
      image,
    }));
  }, [t]);

  useEffect(() => {
    if (typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [loadFavorites]);

  useEffect(() => {
    if (location.pathname === '/' && typeof loadFavorites === 'function') {
      loadFavorites();
    }
  }, [location.pathname, loadFavorites]);

  // Subscribe to task events
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
    if (!prompt.trim() || isLoading) return;

    // Check if any provider is ready before sending (skip in E2E mode)
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
    // Reset to providers tab when dialog closes
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
    // API key was saved - close dialog and execute the task
    setShowSettingsDialog(false);
    if (prompt.trim()) {
      await executeTask();
    }
  };

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
  };

  const displayedFavorites = showAllFavorites
    ? favoritesList
    : favoritesList.slice(0, FAVORITES_PREVIEW_COUNT);
  const hasMoreFavorites = favoritesList.length > FAVORITES_PREVIEW_COUNT;

  return (
    <>
      <SettingsDialog
        open={showSettingsDialog}
        onOpenChange={handleSettingsDialogChange}
        onApiKeySaved={handleApiKeySaved}
        initialTab={settingsInitialTab}
      />
      <div className="h-full flex items-center justify-center p-6 overflow-y-auto bg-accent">
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">
          {/* Main Title */}
          <motion.h1
            data-testid="home-title"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="text-4xl font-light tracking-tight text-foreground"
          >
            {t('title')}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.gentle, delay: 0.1 }}
            className="w-full"
          >
            <Card className="w-full bg-card/95 backdrop-blur-md shadow-xl gap-0 py-0 flex flex-col max-h-[calc(100vh-3rem)]">
              <CardContent className="p-6 pb-4 flex-shrink-0">
                {/* Input Section */}
                <TaskInputBar
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  placeholder={t('inputPlaceholder')}
                  large={true}
                  autoFocus={true}
                  onOpenSpeechSettings={handleOpenSpeechSettings}
                  onOpenSettings={(tab: 'providers' | 'voice' | 'skills' | 'connectors') => {
                    setSettingsInitialTab(tab);
                    setShowSettingsDialog(true);
                  }}
                  onOpenModelSettings={handleOpenModelSettings}
                  hideModelWhenNoModel={true}
                />
              </CardContent>

              {favoritesList.length > 0 && (
                <div className="border-t border-border">
                  <div className="px-6 py-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Favorites</span>
                  </div>
                  <div className="px-6 pb-4">
                    <div className="grid grid-cols-3 gap-3">
                      <AnimatePresence>
                        {displayedFavorites.map((fav) => (
                          <motion.div
                            key={fav.taskId}
                            role="button"
                            tabIndex={0}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={springs.gentle}
                            whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
                            whileTap={{ scale: 0.97 }}
                            layout
                            onClick={() => setPrompt(fav.prompt)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setPrompt(fav.prompt);
                              }
                            }}
                            className="group relative flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-border bg-card hover:border-ring hover:bg-muted/50 text-left w-full min-h-[4rem] cursor-pointer"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeFavorite(fav.taskId);
                              }}
                              className="absolute top-1.5 right-1.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
                              title="Remove from favorites"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <p className="text-xs font-medium text-foreground text-center line-clamp-2 w-full px-5">
                              {fav.summary || fav.prompt.slice(0, 60)}
                              {(fav.summary || fav.prompt).length > 60 ? '…' : ''}
                            </p>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                    {hasMoreFavorites && !showAllFavorites && (
                      <button
                        type="button"
                        onClick={() => setShowAllFavorites(true)}
                        className="mt-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Show all {favoritesList.length} favorites
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Examples Toggle */}
              <div className="border-t border-border">
                <button
                  onClick={() => setShowExamples(!showExamples)}
                  className="w-full px-6 py-3 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors duration-200"
                >
                  <span>{t('examplePrompts')}</span>
                  <motion.div
                    animate={{ rotate: showExamples ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <CaretDown className="h-4 w-4" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {showExamples && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-6 pt-3 pb-4 overflow-y-auto max-h-[360px]"
                        style={{
                          background:
                            'linear-gradient(to bottom, hsl(var(--muted)) 0%, hsl(var(--background)) 100%)',
                          backgroundAttachment: 'fixed',
                        }}
                      >
                        <motion.div
                          variants={staggerContainer}
                          initial="initial"
                          animate="animate"
                          className="grid grid-cols-3 gap-3"
                        >
                          {useCaseExamples.map((example, index) => (
                            <motion.button
                              key={index}
                              data-testid={`home-example-${index}`}
                              variants={staggerItem}
                              transition={springs.gentle}
                              whileHover={{ scale: 1.03, transition: { duration: 0.15 } }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => handleExampleClick(example.prompt)}
                              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-card hover:border-ring hover:bg-muted/50"
                            >
                              <img
                                src={example.image}
                                alt={example.title}
                                className="w-12 h-12 object-cover rounded"
                              />
                              <div className="flex flex-col items-center gap-1 w-full">
                                <div className="font-medium text-xs text-foreground text-center">
                                  {example.title}
                                </div>
                                <div className="text-xs text-muted-foreground text-center line-clamp-2">
                                  {example.description}
                                </div>
                              </div>
                            </motion.button>
                          ))}
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}

export default HomePage;
