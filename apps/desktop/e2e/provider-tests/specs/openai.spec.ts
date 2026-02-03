import { test, expect } from '../fixtures';
import { SettingsPage } from '../../pages/settings.page';
import { HomePage } from '../../pages/home.page';
import { ExecutionPage } from '../../pages/execution.page';
import { getProviderTestConfig, DEFAULT_TASK_TIMEOUT } from '../provider-test-configs';
import type { ResolvedProviderTestConfig, ApiKeySecrets } from '../types';

test.describe('OpenAI Provider E2E', () => {
  let testConfig: ResolvedProviderTestConfig;

  test.beforeEach(async ({}, testInfo) => {
    const config = getProviderTestConfig('openai');
    if (!config) {
      testInfo.skip(true, 'No OpenAI secrets configured');
      return;
    }
    testConfig = config;
  });

  test('connect and complete task', async ({ providerWindow }) => {
    const settings = new SettingsPage(providerWindow);
    const home = new HomePage(providerWindow);
    const execution = new ExecutionPage(providerWindow);
    const secrets = testConfig.secrets as ApiKeySecrets;

    // Navigate to settings
    await settings.navigateToSettings();

    // Select OpenAI provider
    await settings.selectProvider(testConfig.config.providerId);

    // Check if already connected (from previous run)
    const isAlreadyConnected = await settings.disconnectButton.isVisible();
    if (isAlreadyConnected) {
      // Disconnect first to test the full connection flow
      await settings.clickDisconnect();
      await providerWindow.waitForTimeout(500);
    }

    // Fill API key
    await settings.enterApiKey(secrets.apiKey);

    // Click connect and wait for validation
    await settings.clickConnect();

    // Verify connection succeeded
    const statusText = await settings.connectionStatus.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');

    // Select model from resolved configuration
    await settings.selectModel(testConfig.modelId);

    // Close settings
    await settings.doneButton.click();
    await providerWindow.waitForTimeout(1000);

    // Execute task
    await home.enterTask(testConfig.taskPrompt);
    await home.submitButton.click();

    // Wait for task completion
    
    await execution.waitForCompleteReal(DEFAULT_TASK_TIMEOUT);
  });
});
