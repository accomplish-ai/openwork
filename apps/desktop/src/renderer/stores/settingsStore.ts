import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AwsAgentCoreConfig } from '@accomplish_ai/agent-core/common';

interface SettingsState {
  cloudBrowsers: {
    selectedProvider: 'aws' | 'browserbase';
    awsConfig: AwsAgentCoreConfig;
  };
  setCloudBrowserProvider: (provider: 'aws' | 'browserbase') => void;
  setAwsConfig: (config: AwsAgentCoreConfig) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      cloudBrowsers: {
        selectedProvider: 'aws',
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
    }
  )
);
