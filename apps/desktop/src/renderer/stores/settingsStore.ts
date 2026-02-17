import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AwsAgentCoreConfig } from '@accomplish_ai/agent-core/common';

interface SettingsState {
  cloudBrowsers: {
    selectedProvider: 'aws-agent-core' | 'browserbase';
    awsConfig: Omit<AwsAgentCoreConfig, 'accessKeyId' | 'secretAccessKey'>;
  };
  setCloudBrowserProvider: (provider: 'aws-agent-core' | 'browserbase') => void;
  setAwsConfig: (config: Omit<AwsAgentCoreConfig, 'accessKeyId' | 'secretAccessKey'>) => void;
}

/**
 * Zustand store hook for managing application settings, including cloud browser configurations.
 * Persists data to local storage with security exclusions for sensitive keys.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      cloudBrowsers: {
        selectedProvider: 'aws-agent-core',
        awsConfig: {
          region: 'us-east-1',
        },
      },
      setCloudBrowserProvider: (provider) =>
        set((state) => ({
          cloudBrowsers: { ...state.cloudBrowsers, selectedProvider: provider },
        })),
      setAwsConfig: (config) =>
        set((state) => {
          // Defensive strip: ensure no secrets are persisted even if passed by mistake
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { accessKeyId, secretAccessKey, ...safeConfig } = config as AwsAgentCoreConfig;
          return {
            cloudBrowsers: { ...state.cloudBrowsers, awsConfig: safeConfig },
          };
        }),
    }),
    {
      name: 'accomplish-settings-storage',
      partialize: (state) => ({ cloudBrowsers: state.cloudBrowsers }),
      version: 1,
      migrate: (persistedState, version) => {
        return persistedState as SettingsState;
      },
    }
  )
);
