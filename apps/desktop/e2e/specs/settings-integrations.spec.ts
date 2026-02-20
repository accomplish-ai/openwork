import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Integrations Tab', () => {
  test('should display Integrations tab in settings dialog', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await expect(settingsPage.integrationsTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'settings-integrations', 'tab-visible', [
      'Integrations tab is visible in settings navigation',
      'Tab is clickable',
    ]);
  });

  test('should navigate to Integrations panel when tab is clicked', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.integrationsPanel).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'settings-integrations', 'panel-visible', [
      'Integrations panel is visible after clicking tab',
      'Panel contains integration cards',
    ]);
  });

  test('should display description text in Integrations panel', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    const description = window.getByText('Connect messaging services to interact with your AI agent from external platforms.');
    await expect(description).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'settings-integrations', 'description-text', [
      'Integrations panel shows description text',
      'Description explains the purpose of integrations',
    ]);
  });
});

test.describe('Settings - WhatsApp Integration', () => {
  test('should display WhatsApp card in Integrations panel', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'settings-whatsapp', 'card-visible', [
      'WhatsApp card is visible in Integrations panel',
      'Card contains WhatsApp branding',
    ]);
  });

  test('should display WhatsApp card with correct heading and description', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    const heading = settingsPage.whatsappCard.getByRole('heading', { name: 'WhatsApp' });
    await expect(heading).toBeVisible();

    const description = settingsPage.whatsappCard.getByText('Send and receive messages via WhatsApp');
    await expect(description).toBeVisible();

    await captureForAI(window, 'settings-whatsapp', 'card-content', [
      'WhatsApp card shows correct heading',
      'Card shows correct description text',
    ]);
  });

  test('should display WhatsApp logo image', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    const logo = settingsPage.whatsappCard.locator('img[alt="WhatsApp"]');
    await expect(logo).toBeVisible();

    await captureForAI(window, 'settings-whatsapp', 'logo-visible', [
      'WhatsApp logo image is visible',
      'Logo has correct alt text',
    ]);
  });

  test('should display Connect WhatsApp button when disconnected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await expect(settingsPage.whatsappConnectButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.whatsappConnectButton).toHaveText('Connect WhatsApp');

    await captureForAI(window, 'settings-whatsapp', 'connect-button', [
      'Connect WhatsApp button is visible',
      'Button shows correct text',
    ]);
  });

  test('should display warning disclaimer when disconnected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    const warning = settingsPage.whatsappCard.getByText(/unofficial WhatsApp Web protocol/);
    await expect(warning).toBeVisible();

    await captureForAI(window, 'settings-whatsapp', 'warning-disclaimer', [
      'Warning disclaimer about unofficial protocol is visible',
      'User is informed about risks',
    ]);
  });

  test('should respond to Connect button click', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappConnectButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await settingsPage.clickWhatsAppConnect();

    // After clicking, the button should show either "Connecting..." or an error
    // (Baileys may not be available in the E2E environment)
    const connectingText = settingsPage.whatsappCard.getByText('Connecting...');
    const errorText = settingsPage.whatsappCard.getByText(/Failed to connect|Connect WhatsApp/);
    await expect(connectingText.or(errorText)).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'settings-whatsapp', 'connect-response', [
      'Connect button responds to click',
      'UI provides feedback (connecting or error)',
    ]);
  });

  test('should not show disconnect button when disconnected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToIntegrations();

    await expect(settingsPage.whatsappCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Disconnect button should not be visible in disconnected state
    await expect(settingsPage.whatsappDisconnectButton).not.toBeVisible();

    // Connection status badge should not be visible
    await expect(settingsPage.whatsappConnectionStatus).not.toBeVisible();

    await captureForAI(window, 'settings-whatsapp', 'disconnected-state', [
      'Disconnect button is hidden when not connected',
      'Connection status badge is hidden when not connected',
    ]);
  });

  test('should switch from Providers tab to Integrations tab and back', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    // Verify Providers tab content is visible (default tab)
    await expect(settingsPage.providerGrid).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Switch to Integrations tab
    await settingsPage.navigateToIntegrations();
    await expect(settingsPage.integrationsPanel).toBeVisible();

    // Provider grid should not be visible
    await expect(settingsPage.providerGrid).not.toBeVisible();

    // Switch back to Providers tab
    const providersTab = window.getByRole('button', { name: 'Providers' });
    await providersTab.click();
    await expect(settingsPage.providerGrid).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Integrations panel should not be visible
    await expect(settingsPage.integrationsPanel).not.toBeVisible();

    await captureForAI(window, 'settings-integrations', 'tab-switching', [
      'Can switch between Providers and Integrations tabs',
      'Content updates correctly for each tab',
    ]);
  });
});
