// apps/desktop/src/renderer/components/settings/skills/SkillsPanel.tsx

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Skill } from '@accomplish/shared';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { SkillCard } from './SkillCard';
import { MOCK_SKILLS } from './mockSkills';

type FilterType = 'all' | 'active' | 'official';

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[]>(MOCK_SKILLS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isAtBottom, setIsAtBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter, search, and sort skills (enabled first)
  const filteredSkills = useMemo(() => {
    let result = skills;

    // Apply filter
    if (filter === 'active') {
      result = result.filter((s) => s.isEnabled);
    } else if (filter === 'official') {
      result = result.filter((s) => s.source === 'official');
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.command.toLowerCase().includes(query)
      );
    }

    // Sort: enabled skills first
    return [...result].sort((a, b) => {
      if (a.isEnabled === b.isEnabled) return 0;
      return a.isEnabled ? -1 : 1;
    });
  }, [skills, filter, searchQuery]);

  // Check if scrolled to bottom
  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 5; // Small threshold for rounding errors
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Check scroll position on mount and when filtered skills change
  useEffect(() => {
    checkScrollPosition();
  }, [filteredSkills, checkScrollPosition]);

  // Handlers
  const handleToggle = useCallback((id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isEnabled: !s.isEnabled } : s))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleConfigure = useCallback((id: string) => {
    // TODO: Open configuration modal
    console.log('Configure skill:', id);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const filterLabel = filter === 'all' ? 'All types' : filter === 'active' ? 'Active' : 'Official';

  return (
    <div className="flex flex-col">
      {/* Toolbar: Filter + Search */}
      <div className="mb-4 flex gap-3">
        {/* Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted">
              <svg
                className="h-3.5 w-3.5 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
              {filterLabel}
              <svg
                className="h-3 w-3 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setFilter('all')}>All types</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('active')}>Active</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter('official')}>Official</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search Input */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <Input
            type="text"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
      </div>

      {/* Scrollable Skills Grid */}
      <div
        ref={scrollRef}
        onScroll={checkScrollPosition}
        className="max-h-[280px] min-h-[280px] overflow-y-auto pr-1"
      >
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence mode="popLayout">
            {filteredSkills.map((skill, index) => (
              <motion.div
                key={skill.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  layout: { duration: 0.2 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  delay: index * 0.02,
                }}
              >
                <SkillCard
                  skill={skill}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onConfigure={handleConfigure}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {filteredSkills.length === 0 && (
            <motion.div
              className="flex h-[200px] items-center justify-center text-sm text-muted-foreground"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
            >
              No skills found
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll Indicator - use opacity to prevent layout shift flickering */}
      {filteredSkills.length > 4 && (
        <div
          className={`mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground transition-opacity duration-150 ${
            isAtBottom ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <svg
            className={`h-3.5 w-3.5 ${isAtBottom ? '' : 'animate-bounce'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          Scroll for more skills
        </div>
      )}
    </div>
  );
}
