const WAITING_PATTERNS: RegExp[] = [
  /\blet me know\b/i,
  /\btell me\b/i,
  /\b(wait(ing)? (for|on) (you|your|the user))\b/i,
  /\bi('| a)?ll wait\b/i,
  /\b(waiting for (your|user) (input|response|approval|confirmation))\b/i,
  /\b(once|after|when)\b.*\b(you|you're|you've|done|ready|finished|complete|logged in|log in|sign in|enter)\b/i,
  /\bplease\b.*\b(log ?in|sign ?in|enter|fill|complete|click|select|confirm|verify|authenticate)\b/i,
  /\b(you need to|requires|require)\b.*\b(manual|manually|your|you|verify|log ?in|sign ?in|enter)\b/i,
  /\b(a manual step is needed|manual intervention)\b/i,
  /\b(manually (enter|complete|do)|you('| wi)?ll need to do this yourself|i need you to)\b/i,
  /\bauthenticate yourself\b/i,
  /\byou will need to verify\b/i,
  /\b(enter|authenticate|complete|verify)\b.*\b(credentials|password|otp|captcha|identity|account|authentication|login)\b/i,
  /\bready to (continue|proceed)\??\b/i,
  /\b(continue|proceed|click continue|press continue|hit continue)\b.*\b(when|once|after)\b/i,
  /\b(standing by|awaiting your response|i will be here waiting|i'll be here)\b/i,
];

/**
 * Detect whether assistant output indicates it is waiting on user input.
 */
export function isWaitingForUser(message: string | null | undefined): boolean {
  if (typeof message !== 'string') {
    return false;
  }

  const normalized = message.trim();
  if (!normalized) {
    return false;
  }

  return WAITING_PATTERNS.some((pattern) => pattern.test(normalized));
}
