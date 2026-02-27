import type { DesktopControlCapability } from './accomplish';
import type { DesktopControlRequirement } from '../components/desktop-control/fallbackGuard';

export const LIVE_VIEW_HINTS =
  /\b(live\s*(view|stream)|livestream|real[-\s]?time|watch\s+my\s+screen|monitor\s+my\s+screen|film(?:ing)?\s+my\s+(screen|computer)|record(?:ing)?\s+my\s+(screen|computer))\b/i;

export const SCREEN_CAPTURE_HINTS =
  /\b(screenshot|screen\s?shot|capture\s+(?:my\s+)?screen|what(?:'| i)?s on my screen|look at my screen|see my screen)\b/i;

export const ACTION_EXECUTION_HINTS =
  /\b(click|double[-\s]?click|move\s+(?:my\s+|the\s+)?mouse|drag|drop|scroll|press\s+(?:the\s+)?(?:key|button)|type(?:\s+text)?|keyboard|mouse\s+(?:to|over|onto)|shortcut)\b/i;

export const LIVE_GUIDANCE_PROMPT_APPEND = `

LIVE GUIDANCE MODE REQUIREMENTS:
- Start by calling start_live_view with sample_fps=2, duration_seconds=300, include_cursor=true.
- Use get_live_frame repeatedly during this same turn after each meaningful user interaction to track changes.
- Guide the user one step at a time with precise location instructions (top-left, button labels, nearby landmarks).
- Keep each step short and actionable. If the UI changed unexpectedly, adapt immediately.
- Follow the user's exact request and app context. Do not switch tasks unless asked.
- If they ask to commit code changes, inspect current git changes first, then commit only what they asked for.
- If commit details are missing, ask one short clarification (for example: commit message).
- If they ask you to perform actions, execute only safe non-destructive actions unless they explicitly confirm risky actions.
- Before ending your response, report what changed on-screen most recently and what exact next click/keypress to do.
`;

export const SCREEN_CAPTURE_PROMPT_APPEND = `

SCREEN CAPTURE MODE:
- Before answering, capture a fresh screenshot of the user's current screen.
- Base your guidance on that latest screenshot and mention what you can currently see.
`;

export function appendWorkWithContext(prompt: string, workWithApp: string | null): string {
  if (!workWithApp) {
    return prompt;
  }

  return `${prompt}

WORK WITH APP CONTEXT:
- The user is working inside ${workWithApp}.
- Prioritize guidance that matches ${workWithApp} UI, messages, and workflows.
- If you need fresher context from ${workWithApp}, ask for a new screenshot or live view frame.`;
}

export function inferDesktopControlRequirement(
  prompt: string
): DesktopControlRequirement | null {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return null;

  const needsLiveView = LIVE_VIEW_HINTS.test(normalizedPrompt);
  const needsActionExecution = ACTION_EXECUTION_HINTS.test(normalizedPrompt);
  const needsScreenCapture = needsLiveView || SCREEN_CAPTURE_HINTS.test(normalizedPrompt);

  if (!needsActionExecution && !needsScreenCapture) {
    return null;
  }

  const capabilities = new Set<DesktopControlCapability>(['mcp_health']);
  if (needsScreenCapture) {
    capabilities.add('screen_capture');
  }
  if (needsActionExecution) {
    capabilities.add('action_execution');
  }

  let blockedAction = 'desktop control actions';
  if (needsLiveView) {
    blockedAction = 'live screen capture';
  } else if (needsScreenCapture && needsActionExecution) {
    blockedAction = 'desktop actions and screenshots';
  } else if (needsActionExecution) {
    blockedAction = 'desktop actions';
  } else if (needsScreenCapture) {
    blockedAction = 'screenshots';
  }

  return {
    blockedAction,
    capabilities: Array.from(capabilities),
  };
}

