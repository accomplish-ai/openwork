import {
  FileText,
  Search,
  Terminal,
  Brain,
  Clock,
  AlertCircle,
  Globe,
  MousePointer2,
  Type,
  Image,
  Code,
  Keyboard,
  ArrowUpDown,
  ListChecks,
  Layers,
  Highlighter,
  ListOrdered,
  Upload,
  Move,
  Frame,
  ShieldCheck,
  MessageCircleQuestion,
  CheckCircle,
  Lightbulb,
  Flag,
  Play,
} from 'lucide-react';

export const THINKING_PHRASES = [
  'Doing...',
  'Executing...',
  'Running...',
  'Handling it...',
  'Accomplishing...',
];

export const TOOL_PROGRESS_MAP: Record<string, { label: string; icon: typeof FileText }> = {
  invalid: { label: 'Retrying...', icon: AlertCircle },
  Read: { label: 'Reading files', icon: FileText },
  Glob: { label: 'Finding files', icon: Search },
  Grep: { label: 'Searching code', icon: Search },
  Bash: { label: 'Running command', icon: Terminal },
  Write: { label: 'Writing file', icon: FileText },
  Edit: { label: 'Editing file', icon: FileText },
  Task: { label: 'Running agent', icon: Brain },
  WebFetch: { label: 'Fetching web page', icon: Search },
  WebSearch: { label: 'Searching web', icon: Search },
  dev_browser_execute: { label: 'Executing browser action', icon: Terminal },
  browser_navigate: { label: 'Navigating', icon: Globe },
  browser_snapshot: { label: 'Reading page', icon: Search },
  browser_click: { label: 'Clicking', icon: MousePointer2 },
  browser_type: { label: 'Typing', icon: Type },
  browser_screenshot: { label: 'Taking screenshot', icon: Image },
  browser_evaluate: { label: 'Running script', icon: Code },
  browser_keyboard: { label: 'Pressing keys', icon: Keyboard },
  browser_scroll: { label: 'Scrolling', icon: ArrowUpDown },
  browser_hover: { label: 'Hovering', icon: MousePointer2 },
  browser_select: { label: 'Selecting option', icon: ListChecks },
  browser_wait: { label: 'Waiting', icon: Clock },
  browser_tabs: { label: 'Managing tabs', icon: Layers },
  browser_pages: { label: 'Getting pages', icon: Layers },
  browser_highlight: { label: 'Highlighting', icon: Highlighter },
  browser_sequence: { label: 'Browser sequence', icon: ListOrdered },
  browser_file_upload: { label: 'Uploading file', icon: Upload },
  browser_drag: { label: 'Dragging', icon: Move },
  browser_get_text: { label: 'Getting text', icon: FileText },
  browser_is_visible: { label: 'Checking visibility', icon: Search },
  browser_is_enabled: { label: 'Checking state', icon: Search },
  browser_is_checked: { label: 'Checking state', icon: Search },
  browser_iframe: { label: 'Switching frame', icon: Frame },
  browser_canvas_type: { label: 'Typing in canvas', icon: Type },
  browser_script: { label: 'Browser Actions', icon: Globe },
  request_file_permission: { label: 'Requesting permission', icon: ShieldCheck },
  AskUserQuestion: { label: 'Asking question', icon: MessageCircleQuestion },
  complete_task: { label: 'Completing task', icon: CheckCircle },
  report_thought: { label: 'Thinking', icon: Lightbulb },
  report_checkpoint: { label: 'Checkpoint', icon: Flag },
  start_task: { label: 'Starting Task', icon: Play },
};

export function getBaseToolName(toolName: string): string {
  let idx = 0;
  while ((idx = toolName.indexOf('_', idx)) !== -1) {
    const candidate = toolName.substring(idx + 1);
    if (TOOL_PROGRESS_MAP[candidate]) {
      return candidate;
    }
    idx += 1;
  }
  return toolName;
}

export function getToolDisplayInfo(
  toolName: string,
): { label: string; icon: typeof FileText } | undefined {
  if (TOOL_PROGRESS_MAP[toolName]) {
    return TOOL_PROGRESS_MAP[toolName];
  }
  const baseName = getBaseToolName(toolName);
  return TOOL_PROGRESS_MAP[baseName];
}
