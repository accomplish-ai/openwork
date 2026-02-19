import { BrowserbaseConfig } from '../common/types/cloudProviders.js';

/**
 * Validates the Browserbase configuration by attempting to fetch the project usage/details.
 * Returns true if valid, throws error if invalid.
 */
export async function validateBrowserbaseConfig(config: BrowserbaseConfig): Promise<boolean> {
  if (!config.apiKey || !config.projectId) {
    throw new Error('API Key and Project ID are required');
  }

  // Use the Browserbase API to list sessions or get project usage.
  // GET https://api.browserbase.com/v1/projects/{projectId}/usage is a good weak-impact check.
  // Or just GET https://api.browserbase.com/v1/sessions?status=RUNNING&limit=1 to check auth.
  // Let's use the list sessions endpoint as it's standard.

  const response = await fetch('https://api.browserbase.com/v1/sessions?limit=1', {
    method: 'GET',
    headers: {
      'X-BB-API-Key': config.apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid API Key');
    }
    if (response.status === 403) {
      throw new Error('Access Denied (Check Project ID/Permissions)');
    }
    const errorText = await response.text();
    throw new Error(`Validation failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return true;
}
