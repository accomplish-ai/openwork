// apps/desktop/src/renderer/components/schedule/TemplateGallery.tsx

import { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, X, LayoutGrid } from 'lucide-react';
import type { ScheduleTemplate, TemplateCategory } from '@accomplish/shared';
import { TEMPLATE_CATEGORIES } from '@accomplish/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TemplateCard } from './TemplateCard';
import { SCHEDULE_TEMPLATES, searchTemplates, getTemplatesByCategory } from '@/data/scheduleTemplates';

interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: ScheduleTemplate) => void;
}

type CategoryFilter = TemplateCategory | 'all';

/**
 * Get a Lucide icon component by name
 */
function getIconComponent(iconName: string): LucideIcons.LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>;
  return icons[iconName] || LucideIcons.FileQuestion;
}

export function TemplateGallery({ open, onOpenChange, onSelectTemplate }: TemplateGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let templates: ScheduleTemplate[];

    // First apply search filter
    if (searchQuery.trim()) {
      templates = searchTemplates(searchQuery);
    } else {
      templates = SCHEDULE_TEMPLATES;
    }

    // Then apply category filter
    if (selectedCategory !== 'all') {
      templates = templates.filter((t) => t.category === selectedCategory);
    }

    return templates;
  }, [searchQuery, selectedCategory]);

  // Group templates by category for display when no search
  const groupedTemplates = useMemo(() => {
    if (searchQuery.trim() || selectedCategory !== 'all') {
      return null; // Show flat list when filtering
    }

    const groups: Record<TemplateCategory, ScheduleTemplate[]> = {
      developer: [],
      productivity: [],
      monitoring: [],
      learning: [],
      creative: [],
      maintenance: [],
    };

    for (const template of SCHEDULE_TEMPLATES) {
      groups[template.category].push(template);
    }

    return groups;
  }, [searchQuery, selectedCategory]);

  const handleSelectTemplate = (template: ScheduleTemplate) => {
    onSelectTemplate(template);
    onOpenChange(false);
    // Reset filters
    setSearchQuery('');
    setSelectedCategory('all');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
  };

  const hasActiveFilters = searchQuery.trim() || selectedCategory !== 'all';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Schedule Templates
          </DialogTitle>
          <DialogDescription>
            Choose a template to quickly create a scheduled task with pre-configured prompts and
            schedules.
          </DialogDescription>
        </DialogHeader>

        {/* Search and Filters */}
        <div className="flex flex-col gap-3 py-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedCategory === 'all' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
              className="h-8"
            >
              All
            </Button>
            {TEMPLATE_CATEGORIES.map((cat) => {
              const IconComponent = getIconComponent(cat.icon);
              return (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="h-8 gap-1.5"
                >
                  <IconComponent className="h-3.5 w-3.5" />
                  {cat.label}
                </Button>
              );
            })}
          </div>

          {/* Active filters indicator */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} found
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Template grid */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {filteredTemplates.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No templates found</p>
              <p className="text-sm mt-1">Try a different search term or category</p>
            </div>
          ) : groupedTemplates ? (
            // Grouped view (no filters active)
            <div className="space-y-8 pb-4">
              {TEMPLATE_CATEGORIES.map((cat) => {
                const templates = groupedTemplates[cat.id];
                if (templates.length === 0) return null;

                const IconComponent = getIconComponent(cat.icon);
                return (
                  <div key={cat.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <IconComponent className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium text-foreground">{cat.label}</h3>
                      <span className="text-xs text-muted-foreground">({templates.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {templates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onSelect={handleSelectTemplate}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat view (filters active)
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onSelect={handleSelectTemplate}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
