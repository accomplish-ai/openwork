import { z } from 'zod';

const PRODUCTION_API_URL = 'https://lite.accomplish.ai';

const desktopConfigSchema = z.object({
  apiUrl: z
    .string()
    .url()
    .default(PRODUCTION_API_URL),
});

type DesktopConfig = z.infer<typeof desktopConfigSchema>;

let cachedConfig: DesktopConfig | null = null;

/**
 * Get desktop configuration with graceful fallback.
 *
 * If the environment variable contains an invalid URL, this function
 * will log a warning and return the default configuration instead of crashing.
 * This improves user experience by ensuring the app always starts.
 */
export function getDesktopConfig(): DesktopConfig {
  if (cachedConfig) return cachedConfig;

  const envApiUrl = process.env.ACCOMPLISH_API_URL;

  // If env var is empty or undefined, use default (no warning needed)
  if (!envApiUrl) {
    cachedConfig = { apiUrl: PRODUCTION_API_URL };
    return cachedConfig;
  }

  const parsed = desktopConfigSchema.safeParse({
    apiUrl: envApiUrl,
  });

  if (!parsed.success) {
    // Log warning instead of crashing - improves UX
    const message = parsed.error.issues.map((issue: z.ZodIssue) => issue.message).join('; ');
    console.warn(
      `[Config] Invalid ACCOMPLISH_API_URL "${envApiUrl}": ${message}. Using default: ${PRODUCTION_API_URL}`
    );
    cachedConfig = { apiUrl: PRODUCTION_API_URL };
    return cachedConfig;
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}
