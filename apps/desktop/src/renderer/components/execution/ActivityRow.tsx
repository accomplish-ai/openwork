import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, FileText, Search, SquareTerminal, Brain, Globe, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { springs } from '../../lib/animations';
import { CodeBlock } from './CodeBlock';
import loadingSymbol from '/assets/loading-symbol.svg';

// Normalize tool name to PascalCase for consistent matching
function normalizeToolName(tool: string): string {
  if (!tool) return tool;
  const lowerTool = tool.toLowerCase();
  const toolMap: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    glob: 'Glob',
    grep: 'Grep',
    bash: 'Bash',
    task: 'Task',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
  };
  return toolMap[lowerTool] || tool.charAt(0).toUpperCase() + tool.slice(1);
}

// Tool icon mapping
const TOOL_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Glob: Search,
  Grep: Search,
  Bash: SquareTerminal,
  Task: Brain,
  WebFetch: Globe,
  WebSearch: Globe,
};

// Human-readable tool names
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  Read: 'Read File',
  Write: 'Write File',
  Edit: 'Edit File',
  Glob: 'Find Files',
  Grep: 'Search Code',
  Bash: 'Run Command',
  Task: 'Agent Task',
  WebFetch: 'Fetch URL',
  WebSearch: 'Web Search',
};

export interface ActivityRowProps {
  id: string;
  tool: string;
  input: unknown;
  output?: string;
  status: 'running' | 'complete' | 'error';
}

// Clean output by removing common noise/warnings
function cleanOutput(output: string): string {
  if (!output) return output;

  // Patterns to filter out (line by line)
  const noisePatterns = [
    /^npm warn\b/i,
    /^npm WARN\b/,
    /^warning:/i,
    /^\[warn\]/i,
    /^Debugger attached\./,
    /^Waiting for the debugger/,
    /^For help, see:/,
  ];

  const lines = output.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // Keep empty lines
    return !noisePatterns.some(pattern => pattern.test(trimmed));
  });

  return filteredLines.join('\n').trim();
}

// Format request in a readable way based on tool type
function formatRequest(tool: string, input: unknown): string {
  if (input === null || input === undefined) return '';
  const inp = input as Record<string, unknown>;

  switch (tool) {
    case 'Read': {
      const filePath = inp?.file_path as string;
      const offset = inp?.offset as number;
      const limit = inp?.limit as number;
      const lines: string[] = [];
      if (filePath) lines.push(`file: ${filePath}`);
      if (offset) lines.push(`offset: ${offset}`);
      if (limit) lines.push(`limit: ${limit}`);
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'Write': {
      const filePath = inp?.file_path as string;
      const content = inp?.content as string;
      const lines: string[] = [];
      if (filePath) lines.push(`file: ${filePath}`);
      if (content) {
        const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
        lines.push(`content: ${preview}`);
      }
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'Edit': {
      const filePath = inp?.file_path as string;
      const oldString = inp?.old_string as string;
      const newString = inp?.new_string as string;
      const lines: string[] = [];
      if (filePath) lines.push(`file: ${filePath}`);
      if (oldString) {
        const preview = oldString.length > 100 ? oldString.slice(0, 100) + '...' : oldString;
        lines.push(`old: ${preview}`);
      }
      if (newString) {
        const preview = newString.length > 100 ? newString.slice(0, 100) + '...' : newString;
        lines.push(`new: ${preview}`);
      }
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'Glob': {
      const pattern = inp?.pattern as string;
      const path = inp?.path as string;
      const lines: string[] = [];
      if (pattern) lines.push(`pattern: ${pattern}`);
      if (path) lines.push(`path: ${path}`);
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'Grep': {
      const pattern = inp?.pattern as string;
      const path = inp?.path as string;
      const glob = inp?.glob as string;
      const lines: string[] = [];
      if (pattern) lines.push(`pattern: ${pattern}`);
      if (path) lines.push(`path: ${path}`);
      if (glob) lines.push(`glob: ${glob}`);
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'WebFetch': {
      const url = inp?.url as string;
      const prompt = inp?.prompt as string;
      const lines: string[] = [];
      if (url) lines.push(`url: ${url}`);
      if (prompt) lines.push(`prompt: ${prompt}`);
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'WebSearch': {
      const query = inp?.query as string;
      if (query) return `query: ${query}`;
      return JSON.stringify(input, null, 2);
    }

    case 'Bash': {
      const description = inp?.description as string;
      const command = inp?.command as string;
      const workdir = inp?.workdir as string;
      const lines: string[] = [];
      if (description) lines.push(`description: ${description}`);
      if (command) {
        // Show short commands fully, truncate long ones
        if (command.length <= 100) {
          lines.push(`command: ${command}`);
        } else {
          lines.push(`command: (${command.length} chars)`);
        }
      }
      if (workdir) {
        // Show just the last part of the path
        const shortPath = workdir.split('/').slice(-2).join('/');
        lines.push(`workdir: .../${shortPath}`);
      }
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    case 'Task': {
      const description = inp?.description as string;
      const prompt = inp?.prompt as string;
      const lines: string[] = [];
      if (description) lines.push(`description: ${description}`);
      if (prompt) {
        const preview = prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt;
        lines.push(`prompt: ${preview}`);
      }
      return lines.join('\n') || JSON.stringify(input, null, 2);
    }

    default:
      // For unknown tools, show a clean JSON but limit size
      try {
        const json = JSON.stringify(input, null, 2);
        return json.length > 500 ? json.slice(0, 500) + '\n...(truncated)' : json;
      } catch {
        return String(input);
      }
  }
}

// Generate smart summary based on tool and input
function getSummary(tool: string, input: unknown, fallbackName: string): string {
  const inp = input as Record<string, unknown>;

  switch (tool) {
    case 'Read': {
      const filePath = inp?.file_path as string;
      if (filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return `Read ${basename}`;
      }
      return 'Read File';
    }

    case 'Write': {
      const filePath = inp?.file_path as string;
      if (filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return `Write ${basename}`;
      }
      return 'Write File';
    }

    case 'Edit': {
      const filePath = inp?.file_path as string;
      if (filePath) {
        const basename = filePath.split('/').pop() || filePath;
        return `Edit ${basename}`;
      }
      return 'Edit File';
    }

    case 'Glob': {
      const pattern = inp?.pattern as string;
      return pattern ? `Find ${pattern}` : 'Find Files';
    }

    case 'Grep': {
      const pattern = inp?.pattern as string;
      return pattern ? `Search for "${pattern}"` : 'Search Code';
    }

    case 'WebFetch': {
      const url = inp?.url as string;
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          return `Fetch ${hostname}`;
        } catch {
          return 'Fetch URL';
        }
      }
      return 'Fetch URL';
    }

    case 'WebSearch': {
      const query = inp?.query as string;
      return query ? `Search "${query}"` : 'Web Search';
    }

    case 'Bash': {
      const description = inp?.description as string;
      if (description) return description;
      const command = inp?.command as string;
      if (command) {
        const shortCmd = command.length > 50 ? command.slice(0, 50) + '...' : command;
        return shortCmd;
      }
      return 'Run Command';
    }

    case 'Task': {
      const description = inp?.description as string;
      return description || 'Agent Task';
    }

    default:
      return fallbackName;
  }
}

// Spinning icon component
const SpinningIcon = ({ className }: { className?: string }) => (
  <img
    src={loadingSymbol}
    alt=""
    className={cn('animate-spin-ccw', className)}
  />
);

export const ActivityRow = memo(function ActivityRow({
  id,
  tool,
  input,
  output,
  status,
}: ActivityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedTool = normalizeToolName(tool);
  const Icon = TOOL_ICONS[normalizedTool] || Wrench;
  const fallbackName = TOOL_DISPLAY_NAMES[normalizedTool] || normalizedTool;
  const summary = getSummary(normalizedTool, input, fallbackName);
  const formattedInput = formatRequest(normalizedTool, input);
  const formattedOutput = cleanOutput(output || '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.gentle}
      className="w-full relative"
    >
      {/* Timeline connector dot */}
      <div className="absolute -left-[21px] top-3 w-2 h-2 rounded-full bg-muted-foreground/50" />

      {/* Collapsed row - Tool name as title */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
          'hover:bg-muted/50 transition-colors',
          'text-left text-sm'
        )}
      >
        {/* Tool icon */}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

        {/* Tool summary */}
        <span className="flex-1 font-medium text-foreground truncate">{summary}</span>

        {/* Status indicator */}
        {status === 'running' ? (
          <SpinningIcon className="h-4 w-4 shrink-0" />
        ) : status === 'error' ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
        )}

        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded details - Request/Response blocks */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 mt-1 space-y-2 pb-2">
              {/* Request block */}
              {formattedInput && (
                <CodeBlock label="Request" content={formattedInput} />
              )}

              {/* Response block */}
              {status !== 'running' && formattedOutput && (
                <CodeBlock
                  label="Response"
                  content={formattedOutput.length > 2000
                    ? formattedOutput.slice(0, 2000) + '\n...(truncated)'
                    : formattedOutput}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
