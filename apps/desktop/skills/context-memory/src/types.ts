/**
 * Types for session context storage
 */

/**
 * A single tool call record
 */
export interface ToolCallRecord {
  name: string;
  timestamp: string;
  input?: unknown;
  output?: string;
  status: 'pending' | 'completed' | 'error';
}

/**
 * Files that were modified during the session
 */
export interface FileModification {
  path: string;
  operation: 'created' | 'modified' | 'deleted' | 'read';
  timestamp: string;
}

/**
 * The full session context stored by the MCP server
 */
export interface SessionContext {
  /** Session identifier */
  sessionId: string;

  /** Task identifier (for multi-task support) */
  taskId: string;

  /** When context was last updated */
  updatedAt: string;

  /** Original user request */
  originalRequest: string;

  /** Current summary of work completed */
  summary: string;

  /** Key decisions made during the task */
  keyDecisions: string[];

  /** Files that were touched */
  filesModified: FileModification[];

  /** Current status: what the agent is working on */
  currentStatus: string;

  /** Remaining work if partial completion */
  remainingWork?: string;

  /** Recent tool calls (last N for brevity) */
  recentToolCalls: ToolCallRecord[];

  /** Any blockers encountered */
  blockers: string[];

  /** Token estimate for the full session (optional) */
  estimatedTokens?: number;
}

/**
 * Input for update_session_context tool
 */
export interface UpdateContextInput {
  original_request: string;
  summary: string;
  current_status: string;
  key_decisions?: string[];
  files_modified?: string[];
  remaining_work?: string;
  blockers?: string[];
}

/**
 * Output from get_session_context tool
 */
export interface GetContextOutput {
  has_context: boolean;
  context?: SessionContext;
  formatted_prompt?: string;
}
