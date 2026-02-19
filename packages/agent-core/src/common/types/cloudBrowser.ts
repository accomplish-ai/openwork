export type CloudBrowserProviderId = 'browserbase';

export const BROWSERBASE_REGIONS = [
  { id: 'us-west-2', name: 'us-west-2 (Oregon)' },
  { id: 'us-east-1', name: 'us-east-1 (Virginia)' },
  { id: 'eu-central-1', name: 'eu-central-1 (Frankfurt)' },
  { id: 'ap-southeast-1', name: 'ap-southeast-1 (Singapore)' },
] as const;

export const BROWSERBASE_VALID_REGION_IDS = BROWSERBASE_REGIONS.map((r) => r.id);

export interface BrowserbaseConfig {
  projectId: string;
  region: string;
}

export interface CloudBrowserConfig {
  providerId: CloudBrowserProviderId;
  config: string;
  enabled: boolean;
  lastValidated?: number;
}
