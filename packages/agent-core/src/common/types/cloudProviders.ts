import { z } from 'zod';

export const CloudBrowserProviderIdSchema = z.enum(['browserbase', 'brightdata']);
export type CloudBrowserProviderId = z.infer<typeof CloudBrowserProviderIdSchema>;

export const BrowserbaseConfigSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required'),
  projectId: z.string().min(1, 'Project ID is required'),
  region: z.string().optional(), // optional as it might have a default or be inferred
});
export type BrowserbaseConfig = z.infer<typeof BrowserbaseConfigSchema>;

// Intentionally empty for now, effectively serves as a placeholder for future providers
export const BrightDataConfigSchema = z.object({});
export type BrightDataConfig = z.infer<typeof BrightDataConfigSchema>;

export type CloudBrowserConfig =
  | { providerId: 'browserbase'; config: BrowserbaseConfig }
  | { providerId: 'brightdata'; config: BrightDataConfig };

export interface CloudProviderAccount {
  id: string; // generated UUID or similar
  providerId: CloudBrowserProviderId;
  name: string; // User-defined name, e.g., "My Browserbase"
  config: BrowserbaseConfig | BrightDataConfig;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
