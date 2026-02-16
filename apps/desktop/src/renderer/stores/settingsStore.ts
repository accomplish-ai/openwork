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
        set((state) => ({
          cloudBrowsers: { ...state.cloudBrowsers, awsConfig: config },
        })),
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
