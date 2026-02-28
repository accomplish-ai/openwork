import { motion } from 'framer-motion';
import { Search, Plus, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';
import type { Task } from '@accomplish/shared';

interface ChatMenuPanelProps {
  filteredTaskHistory: Task[];
  menuSearchQuery: string;
  selectedTaskId: string | null;
  onSearchChange: (query: string) => void;
  onNewChat: () => void;
  onSelectTask: (taskId: string) => void;
  onOpenSettings?: () => void;
}

export function ChatMenuPanel({
  filteredTaskHistory,
  menuSearchQuery,
  selectedTaskId,
  onSearchChange,
  onNewChat,
  onSelectTask,
  onOpenSettings,
}: ChatMenuPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className="w-64 border-r border-border bg-muted/20 p-3 flex flex-col gap-3"
    >
      <div className="relative">
        <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={menuSearchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search chats"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <Button
        size="sm"
        className="w-full justify-start gap-2 mb-3"
        onClick={onNewChat}
      >
        <Plus className="h-4 w-4" />
        New chat
      </Button>

      <p className="text-xs font-medium text-foreground">Past chats</p>
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filteredTaskHistory.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {menuSearchQuery.trim() ? 'No chats match your search.' : 'No previous chats yet.'}
          </p>
        ) : (
          filteredTaskHistory.map((task) => {
            const label = task.summary || task.prompt || 'Untitled chat';
            const created = task.createdAt
              ? new Date(task.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';

            return (
              <button
                key={task.id}
                type="button"
                onClick={() => void onSelectTask(task.id)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-[11px] flex items-center justify-between gap-2 hover:bg-muted',
                  selectedTaskId === task.id && 'bg-primary/10 text-primary'
                )}
              >
                <span className="truncate flex-1">{label}</span>
                {created && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {created}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-border/70 pt-3 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>
    </motion.div>
  );
}
