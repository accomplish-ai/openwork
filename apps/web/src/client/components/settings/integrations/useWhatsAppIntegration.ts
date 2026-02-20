import { useState, useCallback, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';

export type WhatsAppConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WhatsAppState {
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  tunnelEnabled: boolean;
  loading: boolean;
}

export function useWhatsAppIntegration() {
  const [state, setState] = useState<WhatsAppState>({
    status: 'disconnected',
    qrCode: null,
    tunnelEnabled: false,
    loading: true,
  });

  const accomplish = getAccomplish();

  // Load initial status
  useEffect(() => {
    accomplish
      .getWhatsAppStatus()
      .then((res) => {
        setState({
          status: res.status as WhatsAppConnectionStatus,
          qrCode: res.qrCode,
          tunnelEnabled: res.config?.tunnelEnabled ?? false,
          loading: false,
        });
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loading: false }));
      });
  }, [accomplish]);

  // Subscribe to QR code updates
  useEffect(() => {
    const unsub = window.accomplish?.onWhatsAppQr?.((data: { qr: string }) => {
      setState((prev) => ({ ...prev, qrCode: data.qr }));
    });
    return () => {
      unsub?.();
    };
  }, []);

  // Subscribe to status changes
  useEffect(() => {
    const unsub = window.accomplish?.onWhatsAppStatusChange?.((data: { status: string }) => {
      setState((prev) => ({
        ...prev,
        status: data.status as WhatsAppConnectionStatus,
        // Clear QR code once connected
        qrCode: data.status === 'connected' ? null : prev.qrCode,
      }));
    });
    return () => {
      unsub?.();
    };
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'connecting' }));
    try {
      await accomplish.connectWhatsApp();
    } catch (err) {
      console.error('Failed to connect WhatsApp:', err);
      setState((prev) => ({ ...prev, status: 'error' }));
    }
  }, [accomplish]);

  const disconnect = useCallback(async () => {
    try {
      await accomplish.disconnectWhatsApp();
      setState((prev) => ({ ...prev, status: 'disconnected', qrCode: null }));
    } catch (err) {
      console.error('Failed to disconnect WhatsApp:', err);
    }
  }, [accomplish]);

  const setTunnelEnabled = useCallback(
    async (enabled: boolean) => {
      try {
        await accomplish.setIntegrationTunnelEnabled('whatsapp', enabled);
        setState((prev) => ({ ...prev, tunnelEnabled: enabled }));
      } catch (err) {
        console.error('Failed to toggle tunnel:', err);
      }
    },
    [accomplish],
  );

  return {
    ...state,
    connect,
    disconnect,
    setTunnelEnabled,
  };
}
