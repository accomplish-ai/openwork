'use client';

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '@/stores/taskStore';
import { getAccomplish } from '@/lib/accomplish';
import { staggerContainer } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ConversationListItem from './ConversationListItem';
import SettingsDialog from './SettingsDialog';
import { Gear, ChatText, MagnifyingGlass } from '@phosphor-icons/react';
import { ChevronDown, Circle, Laptop, Moon, Sun } from 'lucide-react';
import type { ThemePreference } from '@accomplish_ai/agent-core';
import logoImage from '/assets/logo-1.png';

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'pure-dark', label: 'Pure Dark', Icon: Circle },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Laptop },
];
const THEME_OPTION_VALUES = new Set(THEME_OPTIONS.map((option) => option.value));

const normalizeTheme = (value: unknown): ThemePreference => {
  if (typeof value === 'string' && THEME_OPTION_VALUES.has(value as ThemePreference)) {
    return value as ThemePreference;
  }

  return 'system';
};

export function Sidebar() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const { tasks, loadTasks, updateTaskStatus, addTaskUpdate, openLauncher } = useTaskStore();
  const accomplish = useMemo(() => getAccomplish(), []);
  const { t } = useTranslation('sidebar');

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (typeof accomplish.getTheme !== 'function') {
      return;
    }
    accomplish
      .getTheme()
      .then((value) => {
        setThemePreference(normalizeTheme(value));
      })
      .catch((error) => {
        console.error('Failed to load theme preference', error);
        setThemePreference('system');
      });

    const unsubscribeThemeChange = accomplish.onThemeChange?.(({ theme }) => {
      setThemePreference(normalizeTheme(theme));
    });

    return () => unsubscribeThemeChange?.();
  }, [accomplish]);

  // Subscribe to task status changes (queued -> running) and task updates (complete/error)
  // This ensures sidebar always reflects current task status
  useEffect(() => {
    const unsubscribeStatusChange = accomplish.onTaskStatusChange?.((data) => {
      updateTaskStatus(data.taskId, data.status);
    });

    const unsubscribeTaskUpdate = accomplish.onTaskUpdate((event) => {
      addTaskUpdate(event);
    });

    return () => {
      unsubscribeStatusChange?.();
      unsubscribeTaskUpdate();
    };
  }, [accomplish, updateTaskStatus, addTaskUpdate]);

  const handleNewConversation = () => {
    navigate('/');
  };

  const handleThemeChange = async (nextTheme: ThemePreference) => {
    const previousTheme = themePreference;
    setThemePreference(nextTheme);
    if (typeof accomplish.setTheme !== 'function') {
      return;
    }

    try {
      await accomplish.setTheme(nextTheme);
    } catch (error) {
      setThemePreference(previousTheme);
      console.error('Failed to update theme preference', error);
    }
  };

  const activeThemeOption = THEME_OPTIONS.find((option) => option.value === themePreference);
  const ActiveThemeIcon = activeThemeOption?.Icon ?? Laptop;

  return (
    <>
      <div className="flex h-screen w-[260px] flex-col border-r border-border bg-card pt-12">
        {/* Action Buttons */}
        <div className="px-3 py-3 border-b border-border flex gap-2">
          <Button
            data-testid="sidebar-new-task-button"
            onClick={handleNewConversation}
            variant="default"
            size="sm"
            className="flex-1 justify-center gap-2"
            title={t('newTask')}
          >
            <ChatText className="h-4 w-4" />
            {t('newTask')}
          </Button>
          <Button
            onClick={openLauncher}
            variant="outline"
            size="sm"
            className="px-2"
            title={t('searchTasks')}
          >
            <MagnifyingGlass className="h-4 w-4" />
          </Button>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <AnimatePresence mode="wait">
              {tasks.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {t('noConversations')}
                </motion.div>
              ) : (
                <motion.div
                  key="task-list"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-1"
                >
                  {tasks.map((task) => (
                    <ConversationListItem key={task.id} task={task} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>

        <div className="px-3 py-4 border-t border-border flex items-center justify-between">
          {/* Logo - Bottom Left */}
          <div className="flex items-center">
            <img
              src={logoImage}
              alt="Accomplish"
              className="dark:invert"
              style={{ height: '20px', paddingLeft: '6px' }}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Theme"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ActiveThemeIcon className="h-3.5 w-3.5" />
                <span>{activeThemeOption?.label ?? 'System'}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="center" className="min-w-[140px]">
              {THEME_OPTIONS.map(({ value, label, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => void handleThemeChange(value)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Settings Button - Bottom Right */}
          <Button
            data-testid="sidebar-settings-button"
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title={t('settings')}
          >
            <Gear className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}

export default Sidebar;
