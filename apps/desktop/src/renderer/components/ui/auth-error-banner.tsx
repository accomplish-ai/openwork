import { AlertCircle, ExternalLink, Cookie } from 'lucide-react';
import { Button } from './button';
import { Card } from './card';
import { cn } from '@/lib/utils';
import type { AuthErrorInfo } from '@accomplish/shared';

interface AuthErrorBannerProps {
  authError: AuthErrorInfo;
  url?: string;
  className?: string;
  onOpenBrowser?: (url: string) => void;
  onImportCookies?: () => void;
}

/**
 * Banner component that displays auth error guidance with actionable steps
 * Shows when authentication failures are detected in task execution
 */
export function AuthErrorBanner({
  authError,
  url,
  className,
  onOpenBrowser,
  onImportCookies,
}: AuthErrorBannerProps) {
  if (!authError.isAuthError) {
    return null;
  }

  const platformName = authError.platform === 'generic' ? 'Website' : 
    (authError.platform ? authError.platform.charAt(0).toUpperCase() + authError.platform.slice(1) : '');

  const getErrorTypeLabel = () => {
    switch (authError.errorType) {
      case 'captcha':
        return 'Verification Required';
      case 'rate_limited':
        return 'Rate Limited';
      case 'login_required':
        return 'Login Required';
      case 'blocked':
      default:
        return 'Access Denied';
    }
  };

  return (
    <Card className={cn('border-amber-500/50 bg-amber-500/5', className)}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                {getErrorTypeLabel()}
              </h3>
              {platformName && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700">
                  {platformName}
                </span>
              )}
            </div>

            <div className="space-y-2 mb-4">
              {authError.guidance.map((step, index) => (
                <p key={index} className="text-sm text-muted-foreground">
                  {index + 1}. {step}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {url && onOpenBrowser && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => onOpenBrowser(url)}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Browser
                </Button>
              )}
              
              {onImportCookies && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onImportCookies}
                  className="gap-2"
                >
                  <Cookie className="h-4 w-4" />
                  Import Cookies
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
