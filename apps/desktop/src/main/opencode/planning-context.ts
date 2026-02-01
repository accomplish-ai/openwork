/**
 * Planning context injection for first task messages.
 *
 * This module provides the planning requirements that get prepended
 * to the user's first message, ensuring the agent always starts with
 * a proper plan before taking any actions.
 */

/**
 * Planning context template injected before the user's first task message.
 * This text is visible to the LLM but hidden from the user in the UI.
 *
 * Design notes:
 * - Uses XML-style tags for clear boundaries
 * - Includes self-check mechanism to catch violations
 * - Provides correct/wrong examples for clarity
 */
export const PLANNING_CONTEXT = `[TASK REQUIREMENTS - FOLLOW BEFORE RESPONDING]

Your FIRST output for ANY task MUST be a plan. Tool calls before the plan are FORBIDDEN.

Required sequence:
1. Output "**Plan:**" with Goal and numbered Steps
2. Call todowrite with those steps (first step as "in_progress")
3. Execute step 1
4. Mark step 1 complete IMMEDIATELY after finishing, then proceed to step 2
5. Repeat until all steps complete, then call complete_task

Self-check before your first tool call:
- Did I output "**Plan:**" with Goal and Steps? If no, STOP and do it now.
- Did I call todowrite? If no, STOP and do it now.

Example of CORRECT start:
**Plan:**
Goal: [What we're accomplishing]

Steps:
1. [First action]
2. [Second action]
...

[Then calls todowrite, then executes]

Example of WRONG start (FORBIDDEN):
[Immediately calls a tool without outputting a plan first]

[END TASK REQUIREMENTS]

User request: `;

/**
 * Wraps a user prompt with planning context for first messages.
 *
 * @param prompt - The user's original prompt
 * @param isFirstMessage - Whether this is the first message in a task
 * @returns The prompt, optionally prefixed with planning context
 */
export function injectPlanningContext(prompt: string, isFirstMessage: boolean): string {
  if (!isFirstMessage) {
    return prompt;
  }
  return PLANNING_CONTEXT + prompt;
}
