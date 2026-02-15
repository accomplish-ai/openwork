import type { ToolSupportStatus } from '@accomplish_ai/agent-core/common';
import { ModelSelector } from './ModelSelector';

interface ToolAwareModel {
  id: string;
  name: string;
  toolSupport?: ToolSupportStatus;
}

interface ToolAwareModelSelectorProps {
  models: ToolAwareModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  error: boolean;
  idPrefix?: string;
}

export function ToolAwareModelSelector({
  models,
  value,
  onChange,
  error,
  idPrefix,
}: ToolAwareModelSelectorProps) {
  const sortedModels = [...models].sort((a, b) => {
    const order: Record<ToolSupportStatus, number> = { supported: 0, unknown: 1, unsupported: 2 };
    const aOrder = order[a.toolSupport || 'unknown'];
    const bOrder = order[b.toolSupport || 'unknown'];
    return aOrder - bOrder;
  });

  const selectorModels = sortedModels.map((model) => {
    const toolSupport = model.toolSupport || 'unknown';
    const toolIcon = toolSupport === 'supported' ? '✓' : toolSupport === 'unsupported' ? '✗' : '?';
    const id = idPrefix ? `${idPrefix}/${model.id}` : model.id;
    return {
      id,
      name: `${model.name} ${toolIcon}`,
    };
  });

  const selectedModel = idPrefix
    ? models.find((m) => `${idPrefix}/${m.id}` === value)
    : models.find((m) => m.id === value);
  const hasUnsupportedSelected = selectedModel?.toolSupport === 'unsupported';
  const hasUnknownSelected = selectedModel?.toolSupport === 'unknown';

  return (
    <div>
      <ModelSelector models={selectorModels} value={value} onChange={onChange} error={error} />

      {hasUnsupportedSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <svg
            className="h-5 w-5 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="font-medium">This model does not support tool/function calling</p>
            <p className="text-red-400/80 mt-1">
              Tasks requiring browser automation or file operations will not work correctly.
            </p>
          </div>
        </div>
      )}

      {hasUnknownSelected && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
          <svg
            className="h-5 w-5 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="font-medium">Tool support could not be verified</p>
            <p className="text-yellow-400/80 mt-1">
              This model may or may not support tool/function calling. Test it to confirm.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
