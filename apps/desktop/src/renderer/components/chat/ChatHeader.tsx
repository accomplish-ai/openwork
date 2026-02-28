import {
  ChevronDown,
  Menu,
  Minimize2,
  Loader2,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { ModelConfig, SelectedModel } from '@accomplish/shared';

interface ChatHeaderProps {
  selectedModel: SelectedModel | null;
  selectedModelLabel: string;
  isUpdatingModel: boolean;
  availableModels: ModelConfig[];
  selectedWorkWithApp: string | null;
  headerStatus: string;
  showMenuPanel: boolean;
  onToggleMenuPanel: () => void;
  onModelChange: (modelId: string) => void;
  onCollapse: () => void;
}

export function ChatHeader({
  selectedModel,
  selectedModelLabel,
  isUpdatingModel,
  availableModels,
  selectedWorkWithApp,
  headerStatus,
  onToggleMenuPanel,
  onModelChange,
  onCollapse,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onToggleMenuPanel}
          title="Open menu"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 px-2 gap-1.5 font-semibold text-sm max-w-[220px]"
                disabled={isUpdatingModel}
                title="Change model"
              >
                <span className="truncate">{selectedModelLabel}</span>
                {isUpdatingModel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Choose model</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={selectedModel?.model ?? ''}
                onValueChange={(value) => {
                  void onModelChange(value);
                }}
              >
                {availableModels.map((model) => (
                  <DropdownMenuRadioItem key={model.fullId} value={model.fullId}>
                    {model.displayName}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs text-muted-foreground truncate" aria-live="polite">
            {selectedWorkWithApp ? `Working with ${selectedWorkWithApp}` : headerStatus}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCollapse}
          title="Close to chat bubble"
          aria-label="Close to chat bubble"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
