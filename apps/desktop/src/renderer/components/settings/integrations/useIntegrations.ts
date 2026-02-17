/**
 * useIntegrations Hook
 *
 * State management for messaging integrations.
 * Follows the same pattern as useConnectors.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAccomplish, type IntegrationConfig, type TunnelStateInfo } from '@/lib/accomplish';

export interface IntegrationPlatform {
  id: string;
  name: string;
  available: boolean;
}

export function useIntegrations() {
  const [platforms, setPlatforms] = useState<IntegrationPlatform[]>([]);
  const [configs, setConfigs] = useState<Record<string, IntegrationConfig>>({});
  const [tunnelState, setTunnelState] = useState<TunnelStateInfo>({ active: false });
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState<{ platformId: string; qrString: string; expiresAt: number } | null>(null);
  const bridgeSetup = useRef(false);

  const accomplish = getAccomplish();

  const fetchData = useCallback(async () => {
    try {
      const [platformList, configMap, tunnel] = await Promise.all([
        accomplish.getIntegrationPlatforms(),
        accomplish.getIntegrationConfigs(),
        accomplish.getIntegrationTunnelState(),
      ]);
      setPlatforms(platformList);
      setConfigs(configMap as Record<string, IntegrationConfig>);
      setTunnelState(tunnel);
    } catch (err) {
      console.error('Failed to fetch integration data:', err);
    } finally {
      setLoading(false);
    }
  }, [accomplish]);

  // Initial load and event listeners
  useEffect(() => {
    fetchData();

    // Set up the task bridge once
    if (!bridgeSetup.current) {
      bridgeSetup.current = true;
      accomplish.setupIntegrationTaskBridge().catch((err: Error) => {
        console.error('Failed to set up integration task bridge:', err);
      });
    }

    // Listen for status changes
    const unsubStatus = accomplish.onIntegrationStatusChange?.((data: { platformId: string; status: string; error?: string }) => {
      setConfigs((prev: Record<string, IntegrationConfig>) => ({
        ...prev,
        [data.platformId]: {
          ...prev[data.platformId],
          connectionStatus: data.status as IntegrationConfig['connectionStatus'],
          lastError: data.error,
          ...(data.status === 'connected' ? { connectedAt: new Date().toISOString() } : {}),
        },
      }));
    });

    // Listen for QR codes
    const unsubQR = accomplish.onIntegrationQRCode?.((data: { platformId: string; qrData: { qrString: string; expiresAt: number } }) => {
      setQrData({
        platformId: data.platformId,
        qrString: data.qrData.qrString,
        expiresAt: data.qrData.expiresAt,
      });
    });

    // Listen for tunnel state changes
    const unsubTunnel = accomplish.onIntegrationTunnelState?.((data: TunnelStateInfo) => {
      setTunnelState(data);
    });

    return () => {
      unsubStatus?.();
      unsubQR?.();
      unsubTunnel?.();
    };
  }, [fetchData, accomplish]);

  const connect = useCallback(async (platformId: string) => {
    await accomplish.connectIntegration(platformId);
  }, [accomplish]);

  const disconnect = useCallback(async (platformId: string) => {
    await accomplish.disconnectIntegration(platformId);
    setQrData(null);
  }, [accomplish]);

  const confirmPairing = useCallback(async (phoneNumber?: string) => {
    await accomplish.confirmWhatsAppPairing(phoneNumber);
    setQrData(null);
  }, [accomplish]);

  const setEnabled = useCallback(async (platformId: string, enabled: boolean) => {
    await accomplish.setIntegrationEnabled(platformId, enabled);
    setConfigs((prev: Record<string, IntegrationConfig>) => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        enabled,
      },
    }));
  }, [accomplish]);

  const setTunnelEnabled = useCallback(async (platformId: string, enabled: boolean) => {
    await accomplish.setIntegrationTunnelEnabled(platformId, enabled);
    setConfigs((prev: Record<string, IntegrationConfig>) => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        tunnelEnabled: enabled,
      },
    }));
    // Refresh tunnel state
    const tunnel = await accomplish.getIntegrationTunnelState();
    setTunnelState(tunnel);
  }, [accomplish]);

  return {
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
    refetch: fetchData,
  };
}
