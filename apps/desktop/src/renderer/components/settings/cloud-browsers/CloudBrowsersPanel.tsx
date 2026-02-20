import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import { ConnectButton, FormError } from '../shared';
import { BROWSERBASE_REGIONS } from '@accomplish_ai/agent-core/common';
import browserbaseLogo from '/assets/cloud-browsers/browserbase.svg';

interface BrowserbaseState {
  region: string;
  projectId: string;
  hasCredentials: boolean;
  credentialPrefix?: string;
}

export function CloudBrowsersPanel() {
  const accomplish = getAccomplish();

  const [config, setConfig] = useState<BrowserbaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [region, setRegion] = useState('us-west-2');

  useEffect(() => {
    if (!confirmDisconnect) {
      return;
    }
    const timer = setTimeout(() => setConfirmDisconnect(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDisconnect]);

  const fetchConfig = useCallback(async () => {
    try {
      const result = await accomplish.getBrowserbaseConfig();
      if (result.config && result.hasCredentials) {
        setConfig({
          region: result.config.region,
          projectId: result.config.projectId,
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
      await accomplish.connectBrowserbase(apiKey.trim(), projectId.trim(), region);
      setApiKey('');
      setProjectId('');
      await fetchConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }, [apiKey, projectId, region, fetchConfig, accomplish]);

  const handleDisconnect = useCallback(async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }

    setDisconnecting(true);
    setConfirmDisconnect(false);

    try {
      await accomplish.disconnectBrowserbase();
      setConfig(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }, [confirmDisconnect, accomplish]);

  const isConnectDisabled = connecting || !apiKey.trim() || !projectId.trim();

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

      <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="browserbase-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F03603]/10">
            <img src={browserbaseLogo} alt="Browserbase" className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Browserbase</h3>
            <p className="text-xs text-muted-foreground">Serverless cloud browser infrastructure for AI agents</p>
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
                data-testid="browserbase-connection-status"
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
                data-testid="browserbase-disconnect-button"
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
              <div>
                <label htmlFor="browserbase-api-key" className="mb-2 block text-sm font-medium text-foreground">API Key</label>
                <Input
                  id="browserbase-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="bb_live_..."
                  data-testid="browserbase-api-key-input"
                />
              </div>

              <div>
                <label htmlFor="browserbase-project-id" className="mb-2 block text-sm font-medium text-foreground">Project ID</label>
                <Input
                  id="browserbase-project-id"
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="Enter your project ID"
                  data-testid="browserbase-project-id-input"
                />
              </div>

              <div data-testid="browserbase-region-select">
                <SearchableSelect
                  items={BROWSERBASE_REGIONS.map((r) => ({ id: r.id, name: r.name }))}
                  value={region}
                  onChange={setRegion}
                  label="Region"
                  placeholder="Select region..."
                  searchPlaceholder="Search regions..."
                  emptyMessage="No regions found"
                  testId="browserbase-region"
                />
              </div>

              <FormError error={error} />

              <div data-testid="browserbase-connect-button">
                <ConnectButton
                  onClick={handleConnect}
                  connecting={connecting}
                  disabled={isConnectDisabled}
                />
              </div>

              <button
                type="button"
                onClick={() => accomplish.openExternal('https://www.browserbase.com/settings')}
                className="inline-block text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Get credentials from Browserbase →
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
