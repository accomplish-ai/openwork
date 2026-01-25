/**
 * Todo Enforcer Plugin for OpenCode
 *
 * This plugin prevents premature task completion by:
 * 1. Tracking todo state via the todo.updated event
 * 2. Detecting session idle and prompting continuation if todos are incomplete
 *
 * Enforcement Mode: Prompt on idle (respects agent judgment after one prompt)
 *
 * NOTE: OpenCode does not have a "stop" hook that can block the model from stopping.
 * We use session.idle to detect when the model becomes idle and prompt continuation.
 */

import type { Plugin } from '@opencode-ai/plugin';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
}

// Track todo state per session
const sessionTodos = new Map<string, TodoItem[]>();

// Track if we've already prompted for continuation (prompt once only)
const sessionPrompted = new Map<string, boolean>();

/**
 * Get incomplete todos for a session
 */
function getIncompleteTodos(sessionId: string): TodoItem[] {
  const todos = sessionTodos.get(sessionId) || [];
  return todos.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );
}

/**
 * Format incomplete todos for the continuation prompt
 */
function formatIncompleteTodos(todos: TodoItem[]): string {
  return todos.map((t) => `- [${t.status}] ${t.content}`).join('\n');
}

/**
 * Todo Enforcer Plugin
 *
 * Hooks into OpenCode to detect premature task completion when todos are incomplete.
 */
export const TodoEnforcerPlugin: Plugin = async (ctx) => {
  const { client } = ctx;

  console.log('[todo-enforcer] Plugin initialized');

  return {
    /**
     * Listen to all events to track todo updates and session state
     */
    event: async ({ event }) => {
      // Log all events for debugging
      if (event.type.includes('session') || event.type.includes('todo') || event.type.includes('message')) {
        console.log(`[todo-enforcer] Event: ${event.type}`, JSON.stringify(event.properties).substring(0, 200));
      }

      // Track todo updates
      if (event.type === 'todo.updated') {
        const payload = event.properties as { sessionID?: string; todos?: TodoItem[] };
        const sessionId = payload.sessionID;
        const todos = payload.todos;

        if (sessionId && todos && Array.isArray(todos)) {
          sessionTodos.set(sessionId, todos);
          // Reset prompted flag when todos are updated
          sessionPrompted.set(sessionId, false);

          console.log(
            `[todo-enforcer] Updated todos for session ${sessionId}:`,
            todos.map((t) => `${t.id}:${t.status}`).join(', ')
          );
        }
      }

      // Handle session idle - prompt continuation if todos incomplete
      if (event.type === 'session.idle') {
        const payload = event.properties as { sessionID?: string };
        const sessionId = payload.sessionID;

        if (sessionId) {
          const incomplete = getIncompleteTodos(sessionId);

          // Only prompt once per idle event - respect agent judgment after that
          if (incomplete.length > 0 && !sessionPrompted.get(sessionId)) {
            console.log(
              `[todo-enforcer] Session ${sessionId} idle with ${incomplete.length} incomplete todos - prompting continuation`
            );

            sessionPrompted.set(sessionId, true);

            try {
              // Use the client to send a continuation prompt
              // noReply: false (default) triggers an AI response
              await client.session.prompt({
                path: { id: sessionId },
                body: {
                  parts: [
                    {
                      type: 'text',
                      text: `You have ${incomplete.length} incomplete todo(s). Please complete all tasks before stopping:\n${formatIncompleteTodos(incomplete)}`,
                    },
                  ],
                },
              });
              console.log('[todo-enforcer] Successfully prompted continuation');
            } catch (err) {
              console.error('[todo-enforcer] Failed to prompt continuation:', err);
            }
          }
        }
      }

      // Clean up on session end
      if (event.type === 'session.deleted') {
        const payload = event.properties as { sessionID?: string };
        const sessionId = payload.sessionID;

        if (sessionId) {
          sessionTodos.delete(sessionId);
          sessionPrompted.delete(sessionId);
          console.log(`[todo-enforcer] Cleaned up state for session ${sessionId}`);
        }
      }
    },

    /**
     * Hook after tool execution to detect todowrite calls
     * This is a backup for tracking todos if todo.updated event doesn't fire
     */
    'tool.execute.after': async (
      { tool, sessionID },
      { output }
    ) => {
      // Check if this is a todowrite call (might be prefixed with MCP server name)
      if (tool === 'todowrite' || tool.endsWith('_todowrite')) {
        try {
          // Try to parse todos from output
          const result = typeof output === 'string' ? JSON.parse(output) : output;
          const todos = result?.todos;

          if (todos && Array.isArray(todos)) {
            sessionTodos.set(sessionID, todos);
            sessionPrompted.set(sessionID, false);

            console.log(
              `[todo-enforcer] Tracked todos from tool.execute.after for ${sessionID}:`,
              todos.map((t: TodoItem) => `${t.id}:${t.status}`).join(', ')
            );
          }
        } catch (err) {
          // Output might not be JSON, that's okay
          console.log('[todo-enforcer] Could not parse todowrite output');
        }
      }
    },
  };
};

export default TodoEnforcerPlugin;
