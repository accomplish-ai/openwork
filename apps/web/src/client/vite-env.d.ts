/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

import type {
  IntegrationConfig,
  IntegrationPlatform,
  QRCodeData,
  ProviderType,
  Skill,
  TodoItem,
  McpConnector,
} from '@accomplish_ai/agent-core';

// Type interface for the Accomplish Electron IPC API
interface IAccomplishAPI {
  // App info
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;
  openExternal(url: string): Promise<void>;
  startTask(config: { description: string }): Promise<unknown>;
  cancelTask(taskId: string): Promise<void>;
  interruptTask(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<unknown>;
  listTasks(): Promise<unknown[]>;
  deleteTask(taskId: string): Promise<void>;
  clearTaskHistory(): Promise<void>;
  getTodosForTask(taskId: string): Promise<TodoItem[]>;
  respondToPermission(response: { taskId: string; allowed: boolean }): Promise<void>;
  resumeSession(sessionId: string, prompt: string, taskId?: string): Promise<unknown>;
  getApiKeys(): Promise<unknown[]>;
  addApiKey(provider: ProviderType, key: string, label?: string): Promise<unknown>;
  removeApiKey(id: string): Promise<void>;
  getDebugMode(): Promise<boolean>;
  setDebugMode(enabled: boolean): Promise<void>;
  getTheme(): Promise<string>;
  setTheme(theme: string): Promise<void>;
  onThemeChange(callback: (data: { theme: string; resolved: string }) => void): () => void;
  getAppSettings(): Promise<{ debugMode: boolean; onboardingComplete: boolean; theme: string }>;
  getOpenAiBaseUrl(): Promise<string>;
  setOpenAiBaseUrl(baseUrl: string): Promise<void>;
  getOpenAiOauthStatus(): Promise<{ connected: boolean; expires?: number }>;
  loginOpenAiWithChatGpt(): Promise<{ ok: boolean; openedUrl?: string }>;
  hasApiKey(): Promise<boolean>;
  listSkills(): Promise<Skill[]>;
  getSkill(skillId: string): Promise<Skill>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSkill(config: any): Promise<Skill>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateSkill(skillId: string, config: any): Promise<Skill>;
  deleteSkill(skillId: string): Promise<void>;
  getWorkspaceDir(): Promise<string>;
  isInitialized(): Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getModelCodeConfig(): Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setModelCodeConfig(config: any): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerMcpConnector(config: any): Promise<any>;
  getMcpConnectorStatus(name: string): Promise<string>;
  getMcpConnectors(): Promise<McpConnector[]>;
  requestMcpResource(name: string, uri: string, mimeType?: string): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callMcpTool(name: string, toolName: string, args: Record<string, any>): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAuthMcpCallback(callback: (data: any) => void): () => void;
  // Platform integrations
  integrations: {
    list(): Promise<IntegrationConfig[]>;
    connect(platform: IntegrationPlatform | string): Promise<QRCodeData>;
    disconnect(platform: IntegrationPlatform | string): Promise<void>;
    status(platform: IntegrationPlatform | string): Promise<string>;
    setupTunnel(platform: IntegrationPlatform | string): Promise<unknown>;
    toggleTunnel(platform: IntegrationPlatform | string, enabled: boolean): Promise<void>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onQRUpdate(callback: (data: any) => void): () => void;
  };
}

// Type declarations for Electron IPC API exposed to renderer
declare global {
  interface Window {
    accomplish?: IAccomplishAPI;
  }
}

export {};
