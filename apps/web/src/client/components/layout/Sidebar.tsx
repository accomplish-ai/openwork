'use client';

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
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
import { SettingsDialog } from './SettingsDialog';
import {
  ChevronDown,
  Circle,
  Laptop,
  MessageSquarePlus,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import logoImage from '/assets/logo-1.png';

type ThemePreference = 'system' | 'light' | 'dark' | 'pure-dark';

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

export function Sidebar() {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const { tasks, loadTasks, updateTaskStatus, addTaskUpdate, openLauncher } = useTaskStore();
  const accomplish = useMemo(() => getAccomplish(), []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (typeof accomplish.getTheme !== 'function') return;
    accomplish.getTheme().then((value) => {
      const nextTheme: ThemePreference =
        value === 'light' || value === 'dark' || value === 'system' || value === 'pure-dark'
          ? value
          : 'system';
      setThemePreference(nextTheme);
    });

    const unsubscribeThemeChange = accomplish.onThemeChange?.(({ theme }) => {
      const nextTheme: ThemePreference =
        theme === 'light' || theme === 'dark' || theme === 'system' || theme === 'pure-dark'
          ? theme
          : 'system';
      setThemePreference(nextTheme);
    });

    return () => unsubscribeThemeChange?.();
  }, []);

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
  }, [updateTaskStatus, addTaskUpdate]);

  const handleNewConversation = () => {
    navigate('/');
  };

  const handleThemeChange = async (nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
    if (typeof accomplish.setTheme === 'function') {
      await accomplish.setTheme(nextTheme);
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
            title="New Task"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New Task
          </Button>
          <Button
            onClick={openLauncher}
            variant="outline"
            size="sm"
            className="px-2"
            title="Search Tasks (⌘K)"
          >
            <Search className="h-4 w-4" />
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
                  No conversations yet
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

        {/* Bottom Section - Logo, Theme, and Settings */}
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
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}

export default Sidebar;
