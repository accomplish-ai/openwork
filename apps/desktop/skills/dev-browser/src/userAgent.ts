import { platform } from "os";

export type BrowserType = "chrome" | "firefox" | "safari" as const;
export type Platform = "darwin" | "win32" | "linux" as const;

const CURRENT_PLATFORM = platform();

const CHROME_VERSION = "120.0.6099.109";
const FIREFOX_VERSION = "120.0";
const SAFARI_VERSION = "17.2";

const USER_AGENTS: Record<Platform, Record<BrowserType, string>> = {
  darwin: {
    chrome: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    firefox: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`,
    safari: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI_VERSION} Safari/605.1.15`,
  },
  win32: {
    chrome: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    firefox: `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`,
    safari: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
  },
  linux: {
    chrome: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    firefox: `Mozilla/5.0 (X11; Linux x86_64; rv:${FIREFOX_VERSION}) Gecko/20100101 Firefox/${FIREFOX_VERSION}`,
    safari: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
  },
};

const ACCEPT_LANGUAGE: Record<Platform, string> = {
  darwin: "en-US,en;q=0.9",
  win32: "en-US,en;q=0.9",
  linux: "en-US,en;q=0.9",
};

const SEC_CH_UA: Record<Platform, string> = {
  darwin: `"Not_A Brand";v="8", "Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}"`,
  win32: `"Not_A Brand";v="8", "Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}"`,
  linux: `"Not_A Brand";v="8", "Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}"`,
};

const SEC_CH_UA_PLATFORM: Record<Platform, string> = {
  darwin: '"macOS"',
  win32: '"Windows"',
  linux: '"Linux"',
};

export interface UserAgentConfig {
  userAgent: string;
  acceptLanguage: string;
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: "?0";
}

export function getUserAgent(browserType: BrowserType = "chrome", customPlatform?: Platform): UserAgentConfig {
  const platform = customPlatform || (CURRENT_PLATFORM as Platform);
  const userAgent = USER_AGENTS[platform][browserType];

  return {
    userAgent,
    acceptLanguage: ACCEPT_LANGUAGE[platform],
    secChUa: SEC_CH_UA[platform],
    secChUaPlatform: SEC_CH_UA_PLATFORM[platform],
    secChUaMobile: "?0",
  };
}

export function getHeadersForBrowser(browserType: BrowserType = "chrome", customPlatform?: Platform): Record<string, string> {
  const config = getUserAgent(browserType, customPlatform);

  return {
    "User-Agent": config.userAgent,
    "Accept-Language": config.acceptLanguage,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Ch-Ua": config.secChUa,
    "Sec-Ch-Ua-Mobile": config.secChUaMobile,
    "Sec-Ch-Ua-Platform": config.secChUaPlatform,
    "Sec-Ch-Ua-Platform-Version": platformVersion(),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };
}

function platformVersion(): string {
  const platform = CURRENT_PLATFORM as Platform;
  if (platform === "darwin") {
    return '"10.15.7"';
  }
  if (platform === "win32") {
    return '"10.0"';
  }
  return '""';
}
