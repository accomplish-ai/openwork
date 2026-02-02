import { test, expect } from '../fixtures';
import { SettingsPage } from '../../pages/settings.page';
import { HomePage } from '../../pages/home.page';
import { ExecutionPage } from '../../pages/execution.page';
import { getProviderSecrets, getTaskPrompt } from '../secrets-loader';
import type { ApiKeySecrets } from '../types';


test.describe('OpenAI Provider E2E', () => {
  test.beforeEach(async ({}, testInfo) => {
    const secrets = getProviderSecrets('openai');
    if (!secrets) {
      testInfo.skip(true, 'No OpenAI secrets configured');
    }
  });

  test('connect and complete task', async ({ providerWindow }) => {
    const settings = new SettingsPage(providerWindow);
    const home = new HomePage(providerWindow);
    const execution = new ExecutionPage(providerWindow);
    const secrets = getProviderSecrets('openai') as ApiKeySecrets;

    // Navigate to settings
    await settings.navigateToSettings();

    // Select OpenAI provider
    await settings.selectProvider('openai');

    // Check if already connected (from previous run)
    const isAlreadyConnected = await settings.disconnectButton.isVisible();

    if (isAlreadyConnected) {
      // Disconnect first to test the full connection flow
      await settings.clickDisconnect();
      // Wait for disconnect to complete
      await providerWindow.waitForTimeout(500);
    }

    // Fill API key
    await settings.enterApiKey(secrets.apiKey);

    // Click connect and wait for validation
    await settings.clickConnect();



    // Verify connection succeeded (status should show connected state)

    console.log('waiting for connected');
    const statusText = await settings.connectionStatus.textContent();
    expect(statusText?.toLowerCase()).toContain('connected');
    console.log('statusText', statusText);  
    // Verify we got a response
    await settings.doneButton.click();
    console.log('clicked done');
// wait for 2 seconds to make sure the dialog is closed
    await providerWindow.waitForTimeout(2000);
    await home.enterTask('Say hello');
    console.log('entered task');
    await home.submitButton.click();
    console.log('clicked submit');
    await execution.waitForCompleteReal(180000);
    // keep test open for debugging
    await providerWindow.pause();
    // Verify the response contains expected text from our simple prompt
  });
});
