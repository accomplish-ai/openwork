import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import { RegionSelector, ConnectButton, FormError } from '../shared';
import awsLogo from '/assets/ai-logos/aws.svg';
import awsLogoDark from '/assets/ai-logos/aws-dark.svg';

interface CloudBrowserState {
  region: string;
  hasCredentials: boolean;
  credentialPrefix?: string;
}

export function CloudBrowsersPanel() {
  const accomplish = getAccomplish();

  const [config, setConfig] = useState<CloudBrowserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [authType, setAuthType] = useState<'profile' | 'accessKeys'>('profile');
  const [profileName, setProfileName] = useState('default');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState('us-east-1');

  useEffect(() => {
    if (!confirmDisconnect) {
      return;
    }
    const timer = setTimeout(() => setConfirmDisconnect(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDisconnect]);

  const fetchConfig = useCallback(async () => {
    try {
      const result = await accomplish.getAwsCloudBrowserConfig();
      if (result.config && result.hasCredentials) {
        setConfig({
          region: result.config.region,
          hasCredentials: result.hasCredentials,
          credentialPrefix: result.credentialPrefix ?? undefined,
        });
      } else {
        setConfig(null);
      }
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [accomplish]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      if (authType === 'profile') {
        await accomplish.connectAwsCloudBrowser({
          region,
          authType,
          profileName: profileName.trim() || 'default',
        });
      } else {
        await accomplish.connectAwsCloudBrowser({
          region,
          authType,
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
        });
      }
      setAccessKeyId('');
      setSecretAccessKey('');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }, [region, authType, profileName, accessKeyId, secretAccessKey, fetchConfig, accomplish]);

  const handleDisconnect = useCallback(async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }

    setDisconnecting(true);
    setConfirmDisconnect(false);

    try {
      await accomplish.disconnectAwsCloudBrowser();
      setConfig(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }, [confirmDisconnect, accomplish]);

  const isConnectDisabled = connecting || (
    authType === 'accessKeys'
      ? !accessKeyId.trim() || !secretAccessKey.trim()
      : !profileName.trim()
  );

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading cloud browser settings...</div>
      </div>
    );
  }

  const isConnected = config?.hasCredentials === true;

  return (
    <div className="flex flex-col gap-4" data-testid="cloud-browsers-panel">
      <p className="text-sm text-muted-foreground">
        Connect a cloud browser service to enable web browsing capabilities for your AI agent.
      </p>

      <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="aws-agentcore-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF9900]/10">
            <img src={awsLogo} alt="AWS" className="h-6 w-6 dark:hidden" />
            <img src={awsLogoDark} alt="AWS" className="h-6 w-6 hidden dark:block" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">AWS AgentCore Browser</h3>
            <p className="text-xs text-muted-foreground">Cloud-hosted browser via Amazon Bedrock AgentCore</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div
              key="connected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <div
                className="flex items-center gap-2 rounded-full bg-green-500/20 px-2 py-0.5 w-fit text-green-600 dark:text-green-400"
                data-testid="aws-connection-status"
              >
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs font-medium">
                  Connected{config.credentialPrefix ? ` (${config.credentialPrefix})` : ''} &middot; {config.region}
                </span>
              </div>

              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnecting}
                data-testid="aws-disconnect-button"
                className={`w-full ${confirmDisconnect ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}`}
              >
                {disconnecting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Disconnecting...
                  </>
                ) : confirmDisconnect ? (
                  'Confirm Disconnect?'
                ) : (
                  'Disconnect'
                )}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="disconnected"
              variants={settingsVariants.fadeSlide}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={settingsTransitions.enter}
              className="space-y-3"
            >
              <div
                className="flex gap-2"
                role="radiogroup"
                aria-label="Authentication type"
              >
                <button
                  onClick={() => setAuthType('profile')}
                  role="radio"
                  aria-checked={authType === 'profile'}
                  data-testid="aws-auth-type-profile"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authType === 'profile'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  AWS Profile
                </button>
                <button
                  onClick={() => setAuthType('accessKeys')}
                  role="radio"
                  aria-checked={authType === 'accessKeys'}
                  data-testid="aws-auth-type-access-keys"
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    authType === 'accessKeys'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Access Keys
                </button>
              </div>

              <div data-testid="aws-region-select" className="[&_.max-h-60]:max-h-40">
                <RegionSelector value={region} onChange={setRegion} />
              </div>

              {authType === 'profile' ? (
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Uses credentials from ~/.aws/credentials on your machine (set up via AWS CLI).</p>
                  <label htmlFor="aws-profile-name" className="mb-2 block text-sm font-medium text-foreground">Profile Name</label>
                  <Input
                    id="aws-profile-name"
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="default"
                    data-testid="aws-profile-input"
                  />
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Enter your IAM access key and secret from the AWS Console.</p>
                  <div>
                    <label htmlFor="aws-access-key-id" className="mb-2 block text-sm font-medium text-foreground">Access Key ID</label>
                    <Input
                      id="aws-access-key-id"
                      type="text"
                      value={accessKeyId}
                      onChange={(e) => setAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                      data-testid="aws-access-key-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="aws-secret-access-key" className="mb-2 block text-sm font-medium text-foreground">Secret Access Key</label>
                    <Input
                      id="aws-secret-access-key"
                      type="password"
                      value={secretAccessKey}
                      onChange={(e) => setSecretAccessKey(e.target.value)}
                      placeholder="Enter secret access key"
                      data-testid="aws-secret-key-input"
                    />
                  </div>
                </>
              )}

              <FormError error={error} />

              <div data-testid="aws-connect-button">
                <ConnectButton
                  onClick={handleConnect}
                  connecting={connecting}
                  disabled={isConnectDisabled}
                />
              </div>

              <a
                href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Get credentials from AWS Console &rarr;
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
