// apps/desktop/src/renderer/components/schedule/TemplateCard.tsx

import { useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import type { ScheduleTemplate, TemplateCategory } from '@accomplish/shared';
import { Badge } from '@/components/ui/badge';

interface TemplateCardProps {
  template: ScheduleTemplate;
  onSelect: (template: ScheduleTemplate) => void;
}

// Category color mapping
const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  developer: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  productivity: 'bg-green-500/10 text-green-500 border-green-500/20',
  monitoring: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  learning: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  creative: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  maintenance: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const CATEGORY_ICON_COLORS: Record<TemplateCategory, string> = {
  developer: 'text-blue-500',
  productivity: 'text-green-500',
  monitoring: 'text-orange-500',
  learning: 'text-purple-500',
  creative: 'text-pink-500',
  maintenance: 'text-slate-400',
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  developer: 'Developer',
  productivity: 'Productivity',
  monitoring: 'Monitoring',
  learning: 'Learning',
  creative: 'Creative',
  maintenance: 'Maintenance',
};

/**
 * Get a Lucide icon component by name
 */
function getIconComponent(iconName: string): LucideIcons.LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcons.LucideIcon>;
  return icons[iconName] || LucideIcons.FileQuestion;
}

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const IconComponent = useMemo(() => getIconComponent(template.icon), [template.icon]);
  const categoryColor = CATEGORY_COLORS[template.category];
  const iconColor = CATEGORY_ICON_COLORS[template.category];

  return (
    <button
      onClick={() => onSelect(template)}
      className="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-accent transition-colors group"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`p-2 rounded-lg bg-muted/50 group-hover:bg-background transition-colors ${iconColor}`}
        >
          <IconComponent className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Name */}
          <h3 className="font-medium text-foreground truncate">{template.name}</h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {template.description}
          </p>

          {/* Category badge */}
          <div className="mt-2">
            <Badge variant="outline" className={`text-xs border ${categoryColor}`}>
              {CATEGORY_LABELS[template.category]}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  );
}
