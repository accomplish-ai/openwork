/**
 * Classifies a process exit error based on the recent output buffered from the CLI.
 *
 * When the OpenCode CLI exits with a non-zero exit code, the output buffer is checked
 * for known error patterns so we can surface a helpful message to the user instead of
 * the generic "process exited with code N" text.
 */
export function classifyProcessError(exitCode: number, outputBuffer: string): string {
  const output = outputBuffer.toLowerCase();

  if (
    output.includes('insufficient_quota') ||
    output.includes('exceeded your current quota') ||
    output.includes('billing_hard_limit_reached')
  ) {
    return 'API quota exceeded. Check your billing and usage limits, then try again.';
  }

  if (
    output.includes('resource_exhausted') ||
    output.includes('rate limit') ||
    output.includes('ratelimit') ||
    output.includes('too many requests') ||
    /\b(?:http|status|statuscode)\s*429\b/i.test(output)
  ) {
    return 'Rate limit reached. Please wait a moment before retrying.';
  }

  if (
    output.includes('invalid_api_key') ||
    output.includes('incorrect api key') ||
    output.includes('invalid api key') ||
    output.includes('unauthenticated') ||
    output.includes('unauthorized') ||
    output.includes('authentication')
  ) {
    return 'Invalid or missing API key. Check your credentials in Settings.';
  }

  if (
    output.includes('model_not_found') ||
    output.includes('model does not exist') ||
    output.includes('the model does not exist') ||
    output.includes('model not found') ||
    output.includes('no such model')
  ) {
    return 'Model not found or not available. Try selecting a different model in Settings.';
  }

  if (
    output.includes('context_length_exceeded') ||
    output.includes('maximum context length') ||
    output.includes('context window') ||
    output.includes('too many tokens')
  ) {
    return 'The conversation is too long for this model. Start a new task to continue.';
  }

  if (
    output.includes('network') ||
    output.includes('econnrefused') ||
    output.includes('enotfound')
  ) {
    return 'Network error. Check your internet connection and try again.';
  }

  return `Task process exited with code ${exitCode}. Check the debug panel for details.`;
}
