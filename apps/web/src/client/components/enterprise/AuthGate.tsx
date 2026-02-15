import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { springs, variants } from '@/lib/animations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Building2 } from 'lucide-react';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [orgIdentifier, setOrgIdentifier] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authenticated) {
    return <>{children}</>;
  }

  const handleSignIn = async () => {
    if (isSigningIn || !orgIdentifier.trim()) return;
    setIsSigningIn(true);
    setError(null);
    // TODO(auth0): Replace this entire block with Auth0 Universal Login redirect.
    // This placeholder auto-authenticates with NO credential verification.
    // Must NOT ship to production without real Auth0 integration.
    await new Promise((resolve) => setTimeout(resolve, 800));
    setAuthenticated(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <motion.div
          initial="initial"
          animate="animate"
          variants={variants.fadeUp}
          transition={springs.gentle}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-light tracking-tight text-foreground">Accomplish</h1>
          <p className="text-sm text-muted-foreground">Enterprise Single Sign-On</p>
          {/* TODO(auth0): Remove this banner once real Auth0 is integrated */}
          <div
            data-testid="dev-auth-banner"
            className="rounded-md bg-yellow-500/15 border border-yellow-500/30 px-3 py-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400"
          >
            DEV MODE — Auth is bypassed (no real verification)
          </div>
        </motion.div>

        <motion.div
          initial="initial"
          animate="animate"
          variants={variants.fadeUp}
          transition={{ ...springs.gentle, delay: 0.1 }}
          className="w-full"
        >
          <Card className="w-full bg-card/95 backdrop-blur-md shadow-xl">
            <CardContent className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="org-identifier" className="text-sm font-medium text-foreground">
                  Organization
                </label>
                <Input
                  id="org-identifier"
                  type="text"
                  placeholder="your-company"
                  value={orgIdentifier}
                  onChange={(e) => setOrgIdentifier(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSignIn();
                  }}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Enter your organization identifier to continue
                </p>
              </div>

              {error && (
                <p data-testid="auth-error" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                onClick={handleSignIn}
                disabled={!orgIdentifier.trim() || isSigningIn}
                size="lg"
                className="w-full"
              >
                {isSigningIn ? (
                  <Loader2 data-testid="sign-in-spinner" className="h-4 w-4 animate-spin" />
                ) : (
                  'Sign in with SSO'
                )}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
