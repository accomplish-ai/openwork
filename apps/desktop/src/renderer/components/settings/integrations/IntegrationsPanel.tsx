/**
 * IntegrationsPanel Component
 *
 * Main settings panel for messaging integrations.
 * Shows available platforms, connection status, QR code pairing,
 * and tunnel configuration.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { IntegrationCard } from './IntegrationCard';
import { QRCodeDisplay } from './QRCodeDisplay';
import { useIntegrations } from './useIntegrations';

export function IntegrationsPanel() {
  const {
    platforms,
    configs,
    tunnelState,
    qrData,
    loading,
    connect,
    disconnect,
    confirmPairing,
    setEnabled,
    setTunnelEnabled,
  } = useIntegrations();

  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showSimulatePairing, setShowSimulatePairing] = useState(false);

  const handleConnect = useCallback(async (platformId: string) => {
    setConnectError(null);
    try {
      await connect(platformId);
      setSelectedPlatform(platformId);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [connect]);

  const handleDisconnect = useCallback(async (platformId: string) => {
    try {
      await disconnect(platformId);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [disconnect]);

  const handleConfirmPairing = useCallback(async () => {
    try {
      await confirmPairing();
      setShowSimulatePairing(false);
    } catch (err) {
      console.error('Failed to confirm pairing:', err);
    }
  }, [confirmPairing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const selectedConfig = selectedPlatform ? configs[selectedPlatform] : null;
  const isAwaitingScan = selectedConfig?.connectionStatus === 'awaiting_scan';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Connect messaging platforms to trigger Accomplish tasks remotely.
          Send a message from your phone and Accomplish will run it on this machine.
        </p>
      </div>

      {/* Error display */}
      <AnimatePresence>
        {connectError && (
          <motion.div
            className="rounded-lg border border-destructive/50 bg-destructive/10 p-3"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            <p className="text-sm text-destructive">{connectError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform Cards */}
      <div className="space-y-3">
        {platforms.map((platform) => (
          <IntegrationCard
            key={platform.id}
            platform={platform}
            config={configs[platform.id]}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onToggleEnabled={setEnabled}
            onToggleTunnel={setTunnelEnabled}
            selected={selectedPlatform === platform.id}
            onSelect={setSelectedPlatform}
          />
        ))}
      </div>

      {/* QR Code Section - shown when awaiting scan */}
      <AnimatePresence>
        {isAwaitingScan && qrData && selectedPlatform === qrData.platformId && (
          <motion.div
            className="rounded-lg border border-border bg-card p-6"
            variants={settingsVariants.slideDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            <div className="text-center space-y-4">
              <div>
                <h3 className="font-medium text-foreground">Scan QR Code</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
                </p>
              </div>

              <div className="flex justify-center">
                <QRCodeDisplay
                  qrString={qrData.qrString}
                  expiresAt={qrData.expiresAt}
                  onExpired={() => {
                    // QR will auto-refresh via the provider
                  }}
                  size={200}
                />
              </div>

              <div className="space-y-2">
                <ol className="text-xs text-muted-foreground text-left mx-auto max-w-xs space-y-1">
                  <li>1. Open WhatsApp on your phone</li>
                  <li>2. Tap <strong>Menu</strong> or <strong>Settings</strong></li>
                  <li>3. Tap <strong>Linked Devices</strong></li>
                  <li>4. Tap <strong>Link a Device</strong></li>
                  <li>5. Point your phone at the QR code above</li>
                </ol>
              </div>

              {/* Dev/testing: simulate pairing */}
              <div className="pt-2 border-t border-border">
                <button
                  onClick={() => setShowSimulatePairing(!showSimulatePairing)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSimulatePairing ? 'Hide' : 'Simulate pairing (dev)'}
                </button>
                <AnimatePresence>
                  {showSimulatePairing && (
                    <motion.div
                      className="mt-2"
                      variants={settingsVariants.fadeSlide}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      <button
                        onClick={handleConfirmPairing}
                        className="rounded-md bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                      >
                        Simulate Successful QR Scan
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tunnel Status */}
      <AnimatePresence>
        {tunnelState.active && (
          <motion.div
            className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-4"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                Tunnel Active
              </span>
            </div>
            {tunnelState.url && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-500 font-mono">
                {tunnelState.url}
              </p>
            )}
            {tunnelState.connectedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Active since {new Date(tunnelState.connectedAt).toLocaleString()}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info footer */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong>How it works:</strong> When you send a message through a connected platform,
              it reaches this computer through a secure tunnel and starts an Accomplish task.
              Progress updates are sent back to you in real-time.
            </p>
            <p>
              The tunnel connection keeps your machine accessible only through authenticated channels.
              No data is stored on external servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
