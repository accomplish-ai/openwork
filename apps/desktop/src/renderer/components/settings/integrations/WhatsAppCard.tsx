import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { settingsVariants, settingsTransitions } from '@/lib/animations';
import { getAccomplish } from '@/lib/accomplish';
import { FormError } from '../shared';
import { QRCodeSVG } from 'qrcode.react';
import type { MessagingConnectionStatus } from '@accomplish_ai/agent-core/common';
import whatsappLogo from '/assets/integrations/whatsapp.svg';

const QR_EXPIRY_SECONDS = 60;

interface WhatsAppState {
  status: MessagingConnectionStatus;
  phoneNumber?: string;
  lastConnectedAt?: number;
}

export function WhatsAppCard() {
  const accomplish = getAccomplish();

  const [config, setConfig] = useState<WhatsAppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_EXPIRY_SECONDS);
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!confirmDisconnect) {
      return;
    }
    const timer = setTimeout(() => setConfirmDisconnect(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDisconnect]);

  const startQrTimer = useCallback(() => {
    if (qrTimerRef.current) {
      clearInterval(qrTimerRef.current);
    }
    setQrSecondsLeft(QR_EXPIRY_SECONDS);
    qrTimerRef.current = setInterval(() => {
      setQrSecondsLeft((prev) => {
        if (prev <= 1) {
          if (qrTimerRef.current) {
            clearInterval(qrTimerRef.current);
            qrTimerRef.current = null;
          }
          setQrCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (qrTimerRef.current) {
        clearInterval(qrTimerRef.current);
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    };
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const result = await accomplish.getWhatsAppConfig();
      if (result && result.enabled) {
        setConfig({
          status: result.status,
          phoneNumber: result.phoneNumber,
          lastConnectedAt: result.lastConnectedAt,
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

  useEffect(() => {
    const unsubQR = accomplish.onWhatsAppQR((qr: string) => {
      setQrCode(qr);
      startQrTimer();
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setConfig((prev) => prev ? { ...prev, status: 'qr_ready' } : { status: 'qr_ready' });
    });

    const unsubStatus = accomplish.onWhatsAppStatus((status) => {
      setConfig((prev) => prev ? { ...prev, status } : { status });

      if (status === 'connected') {
        setQrCode(null);
        setConnecting(false);
        if (qrTimerRef.current) {
          clearInterval(qrTimerRef.current);
          qrTimerRef.current = null;
        }
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        fetchConfig();
      }
      if (status === 'disconnected' || status === 'logged_out') {
        setQrCode(null);
        setConnecting(false);
        if (qrTimerRef.current) {
          clearInterval(qrTimerRef.current);
          qrTimerRef.current = null;
        }
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
      }
    });

    return () => {
      unsubQR();
      unsubStatus();
    };
  }, [accomplish, fetchConfig, startQrTimer]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setQrCode(null);

    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
    }
    connectTimeoutRef.current = setTimeout(() => {
      setConnecting((prev) => {
        if (prev) {
          setError('Connection timed out. Please try again.');
        }
        return false;
      });
    }, 30_000);

    try {
      await accomplish.connectWhatsApp();
    } catch (err) {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnecting(false);
    }
  }, [accomplish]);

  const handleDisconnect = useCallback(async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      return;
    }

    setDisconnecting(true);
    setConfirmDisconnect(false);

    try {
      await accomplish.disconnectWhatsApp();
      setConfig(null);
      setQrCode(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }, [confirmDisconnect, accomplish]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="whatsapp-card">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  const isConnected = config?.status === 'connected';
  const isReconnecting = config?.status === 'reconnecting';
  const isLoggedOut = config?.status === 'logged_out';
  const isQrReady = config?.status === 'qr_ready' || qrCode;
  const isConnecting = connecting || config?.status === 'connecting';

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4" data-testid="whatsapp-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#25D366]/10">
          <img src={whatsappLogo} alt="WhatsApp" className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-foreground">WhatsApp</h3>
          <p className="text-xs text-muted-foreground">Send and receive messages via WhatsApp</p>
        </div>
      </div>

      <FormError error={error} />

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
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-full bg-green-500/20 px-2 py-0.5 w-fit text-green-600 dark:text-green-400"
              data-testid="whatsapp-connection-status"
            >
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium">
                Connected{config?.phoneNumber ? ` (+${config.phoneNumber})` : ''}
              </span>
            </div>

            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnecting}
              aria-label={confirmDisconnect ? 'Confirm disconnect from WhatsApp' : 'Disconnect from WhatsApp'}
              data-testid="whatsapp-disconnect-button"
              className={`w-full ${confirmDisconnect ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}`}
            >
              {(() => {
                if (disconnecting) {
                  return (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Disconnecting...
                    </>
                  );
                }
                if (confirmDisconnect) {
                  return 'Confirm Disconnect?';
                }
                return 'Disconnect';
              })()}
            </Button>
          </motion.div>
        ) : isReconnecting ? (
          <motion.div
            key="reconnecting"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
            className="space-y-3"
          >
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-full bg-yellow-500/20 px-2 py-0.5 w-fit text-yellow-600 dark:text-yellow-400"
              data-testid="whatsapp-connection-status"
            >
              <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-xs font-medium">Reconnecting...</span>
            </div>

            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnecting}
              aria-label="Cancel reconnection and disconnect WhatsApp"
              data-testid="whatsapp-disconnect-button"
              className="w-full"
            >
              {disconnecting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Disconnecting...
                </>
              ) : (
                'Cancel & Disconnect'
              )}
            </Button>
          </motion.div>
        ) : isLoggedOut ? (
          <motion.div
            key="logged-out"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
            className="space-y-3"
          >
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-xs text-destructive">
                Your WhatsApp session has been logged out. This may happen if you unlinked the device from your phone. Please reconnect to continue.
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              aria-label="Reconnect to WhatsApp"
              className="w-full"
              data-testid="whatsapp-connect-button"
            >
              {isConnecting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Connecting...
                </>
              ) : (
                'Reconnect WhatsApp'
              )}
            </Button>
          </motion.div>
        ) : isQrReady && qrCode ? (
          <motion.div
            key="qr"
            variants={settingsVariants.fadeSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={settingsTransitions.enter}
            className="space-y-3"
          >
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-lg bg-white p-3 ring-1 ring-border dark:ring-border/50" role="img" aria-label="WhatsApp QR code for linking device">
                <QRCodeSVG value={qrCode} size={200} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Open WhatsApp on your phone, go to <strong>Settings &gt; Linked Devices</strong>, and scan this QR code.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {qrSecondsLeft > 0
                    ? `QR code expires in ${qrSecondsLeft}s`
                    : 'QR code expired. Click below to refresh.'}
                </p>
              </div>
              {qrSecondsLeft <= 0 && (
                <Button
                  variant="outline"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  aria-label="Refresh QR code"
                  className="w-full"
                >
                  Refresh QR Code
                </Button>
              )}
            </div>
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
            <div className="rounded-lg bg-warning/10 p-3">
              <p className="text-xs text-warning">
                This integration uses an unofficial WhatsApp Web protocol. Use at your own risk. Your account may be subject to WhatsApp&apos;s Terms of Service enforcement.
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              aria-label="Connect to WhatsApp"
              className="w-full"
              data-testid="whatsapp-connect-button"
            >
              {isConnecting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  Connecting...
                </>
              ) : (
                'Connect WhatsApp'
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
