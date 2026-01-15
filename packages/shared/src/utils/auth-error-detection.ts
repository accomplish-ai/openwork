/**
 * Auth error detection utilities
 * Detects authentication failures from error messages and provides guidance
 */

export interface AuthErrorInfo {
  isAuthError: boolean;
  platform?: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'generic';
  errorType?: 'blocked' | 'captcha' | 'login_required' | 'rate_limited';
  guidance: string[];
}

/**
 * Common auth error patterns across platforms
 */
const AUTH_ERROR_PATTERNS = {
  // HTTP status codes
  unauthorized: /\b(401|unauthorized|unauthenticated)\b/i,
  forbidden: /\b(403|forbidden|access denied)\b/i,
  
  // Platform-specific patterns
  linkedin: /linkedin.*(?:session|login|authentication)/i,
  twitter: /twitter.*(?:session|login|authentication)/i,
  facebook: /facebook.*(?:session|login|authentication)/i,
  instagram: /instagram.*(?:session|login|authentication)/i,
  
  // Generic auth issues
  sessionExpired: /session.*(?:expired|invalid|missing)/i,
  loginRequired: /(?:login|sign.?in).*required/i,
  notLoggedIn: /not.*logged.?in/i,
  authenticationFailed: /authentication.*failed/i,
  
  // Bot detection / CAPTCHA
  captcha: /(?:captcha|recaptcha|challenge|verification)/i,
  botDetected: /(?:bot.*detected|automated.*traffic|suspicious.*activity)/i,
  
  // Rate limiting (often auth-adjacent)
  rateLimited: /(?:rate.*limit|too.*many.*requests|429)/i,
};

/**
 * Detect if an error message indicates an authentication failure
 * Returns detailed information about the auth error type and platform
 */
export function detectAuthError(errorMessage: string): AuthErrorInfo {
  if (!errorMessage) {
    return { isAuthError: false, guidance: [] };
  }

  const lowerError = errorMessage.toLowerCase();
  
  // Check for auth-related errors
  const hasUnauthorized = AUTH_ERROR_PATTERNS.unauthorized.test(errorMessage);
  const hasForbidden = AUTH_ERROR_PATTERNS.forbidden.test(errorMessage);
  const hasSessionExpired = AUTH_ERROR_PATTERNS.sessionExpired.test(errorMessage);
  const hasLoginRequired = AUTH_ERROR_PATTERNS.loginRequired.test(errorMessage);
  const hasNotLoggedIn = AUTH_ERROR_PATTERNS.notLoggedIn.test(errorMessage);
  const hasAuthFailed = AUTH_ERROR_PATTERNS.authenticationFailed.test(errorMessage);
  const hasCaptcha = AUTH_ERROR_PATTERNS.captcha.test(errorMessage);
  const hasBotDetected = AUTH_ERROR_PATTERNS.botDetected.test(errorMessage);
  const hasRateLimit = AUTH_ERROR_PATTERNS.rateLimited.test(errorMessage);

  // Not an auth error
  if (
    !hasUnauthorized &&
    !hasForbidden &&
    !hasSessionExpired &&
    !hasLoginRequired &&
    !hasNotLoggedIn &&
    !hasAuthFailed &&
    !hasCaptcha &&
    !hasBotDetected &&
    !hasRateLimit
  ) {
    return { isAuthError: false, guidance: [] };
  }

  // Determine platform
  let platform: AuthErrorInfo['platform'] = 'generic';
  if (AUTH_ERROR_PATTERNS.linkedin.test(errorMessage)) {
    platform = 'linkedin';
  } else if (AUTH_ERROR_PATTERNS.twitter.test(errorMessage)) {
    platform = 'twitter';
  } else if (AUTH_ERROR_PATTERNS.facebook.test(errorMessage)) {
    platform = 'facebook';
  } else if (AUTH_ERROR_PATTERNS.instagram.test(errorMessage)) {
    platform = 'instagram';
  }

  // Determine error type
  let errorType: AuthErrorInfo['errorType'];
  if (hasCaptcha || hasBotDetected) {
    errorType = 'captcha';
  } else if (hasRateLimit) {
    errorType = 'rate_limited';
  } else if (hasLoginRequired || hasNotLoggedIn) {
    errorType = 'login_required';
  } else {
    errorType = 'blocked';
  }

  // Generate guidance based on error type
  const guidance = generateGuidance(platform, errorType);

  return {
    isAuthError: true,
    platform,
    errorType,
    guidance,
  };
}

/**
 * Generate actionable guidance for auth errors
 */
function generateGuidance(
  platform: AuthErrorInfo['platform'],
  errorType: AuthErrorInfo['errorType']
): string[] {
  const platformName = platform === 'generic' ? 'the website' : platform;
  
  switch (errorType) {
    case 'captcha':
      return [
        'The website detected automated activity and requires verification',
        `Open ${platformName} in a regular browser to complete CAPTCHA`,
        'After verifying, you can import your authenticated session back into Openwork',
      ];
    
    case 'rate_limited':
      return [
        'Too many requests sent in a short time',
        'Wait a few minutes before trying again',
        `If this persists, log in to ${platformName} in a regular browser`,
      ];
    
    case 'login_required':
      return [
        `Authentication required to access ${platformName}`,
        'Log in using a regular browser',
        'Import your authenticated session cookies into Openwork',
      ];
    
    case 'blocked':
    default:
      return [
        `Access to ${platformName} was denied`,
        'This may be due to session expiration or security restrictions',
        'Log in using a regular browser and import your session',
      ];
  }
}
