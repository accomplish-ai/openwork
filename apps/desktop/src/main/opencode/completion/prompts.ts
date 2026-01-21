/**
 * Prompt templates for continuation and verification flows.
 *
 * PROMPT DESIGN RATIONALE:
 *
 * CONTINUATION PROMPT:
 * - Assertive tone ("STOP", "MUST", "NOW") because agent already ignored the requirement
 * - Lists all three statuses so agent picks the appropriate one
 * - "Do not respond with text" prevents agent from explaining instead of acting
 *
 * VERIFICATION PROMPT:
 * - Uses screenshot because browser automation tasks often claim success without
 *   confirming UI state actually changed
 * - Echoes back the agent's own summary and original request for comparison
 * - Requires re-calling complete_task(success) only if screenshot proves completion
 * - If criteria not met, agent continues working (no complete_task call)
 */

export function getContinuationPrompt(): string {
  return `STOP. You MUST call the complete_task tool before you can finish.

Call complete_task NOW with:
- status: "success" if you finished everything the user asked
- status: "blocked" if you hit a problem and cannot continue
- status: "partial" if you completed some parts but not all

Do not respond with text. Just call the tool immediately.`;
}

export function getVerificationPrompt(summary: string, originalRequest: string): string {
  return `VERIFICATION REQUIRED.

You claimed to have completed the task with this summary:
"${summary}"

The original request was:
"${originalRequest}"

Before I accept completion, you MUST verify your work:

1. Take a screenshot of the current browser state using the browser tool
2. Review your plan's completion criteria
3. Compare the screenshot against each criterion

Then either:
- If ALL criteria are met: Call complete_task again with status="success"
- If ANY criteria are NOT met: Continue working to complete them

Do NOT call complete_task with success unless the screenshot proves the task is done.`;
}
