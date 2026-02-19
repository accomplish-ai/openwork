import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Cloud Browsers (Browserbase)', () => {
  let settingsPage: SettingsPage;

  test.beforeEach(async ({ window }) => {
    settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToCloudBrowsers();
  });

  test('should display Cloud Browsers tab in settings', async ({ window }) => {
    // Tab is already clicked in beforeEach, verify it exists and has active styling
    await expect(settingsPage.cloudBrowsersTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'cloud-browsers',
      'tab-visible',
      ['Cloud Browsers tab is visible in settings navigation', 'Tab is clickable']
    );
  });

  test('should show Cloud Browsers panel when tab is clicked', async ({ window }) => {
    await expect(settingsPage.cloudBrowsersPanel).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'cloud-browsers',
      'panel-visible',
      ['Cloud Browsers panel is visible after clicking tab', 'Panel contains cloud browser settings']
    );
  });

  test('should show Browserbase card', async ({ window }) => {
    await expect(settingsPage.browserbaseCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify the card contains the Browserbase name
    await expect(settingsPage.browserbaseCard.getByText('Browserbase')).toBeVisible();

    await captureForAI(
      window,
      'cloud-browsers',
      'browserbase-card-visible',
      ['Browserbase card is visible', 'Card shows provider name and description']
    );
  });

  test('should display API Key and Project ID inputs', async ({ window }) => {
    await expect(settingsPage.browserbaseApiKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.browserbaseProjectIdInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'cloud-browsers',
      'credential-inputs-visible',
      ['API Key input is visible', 'Project ID input is visible', 'Both fields are ready for user input']
    );
  });

  test('should show region selector with 4 regions', async ({ window }) => {
    const regionSelectWrapper = settingsPage.browserbaseRegionSelect;
    await expect(regionSelectWrapper).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // SearchableSelect renders a trigger button — click to open the dropdown
    const trigger = regionSelectWrapper.getByTestId('browserbase-region');
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Verify all 4 regions are present as option buttons
    const options = [
      regionSelectWrapper.getByTestId('browserbase-region-option-us-west-2'),
      regionSelectWrapper.getByTestId('browserbase-region-option-us-east-1'),
      regionSelectWrapper.getByTestId('browserbase-region-option-eu-central-1'),
      regionSelectWrapper.getByTestId('browserbase-region-option-ap-southeast-1'),
    ];

    for (const option of options) {
      await expect(option).toBeVisible();
    }

    await expect(options[0]).toHaveText('us-west-2 (Oregon)');
    await expect(options[1]).toHaveText('us-east-1 (Virginia)');
    await expect(options[2]).toHaveText('eu-central-1 (Frankfurt)');
    await expect(options[3]).toHaveText('ap-southeast-1 (Singapore)');

    // Close the dropdown
    await trigger.click();

    await captureForAI(
      window,
      'cloud-browsers',
      'region-selector-visible',
      ['Region selector is visible', 'All 4 regions are available', 'Default region is us-west-2']
    );
  });

  test('should show Connect button', async ({ window }) => {
    await expect(settingsPage.browserbaseConnectButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'cloud-browsers',
      'connect-button-visible',
      ['Connect button is visible', 'User can initiate connection to Browserbase']
    );
  });

  test('should allow typing in API key field', async ({ window }) => {
    const testApiKey = 'bb_live_test_api_key_12345';

    await settingsPage.browserbaseApiKeyInput.fill(testApiKey);
    await expect(settingsPage.browserbaseApiKeyInput).toHaveValue(testApiKey);

    await captureForAI(
      window,
      'cloud-browsers',
      'api-key-field-filled',
      ['API key field accepts input', 'Value is stored correctly in the input']
    );
  });

  test('should allow typing in project ID field', async ({ window }) => {
    const testProjectId = 'proj_abc123def456';

    await settingsPage.browserbaseProjectIdInput.fill(testProjectId);
    await expect(settingsPage.browserbaseProjectIdInput).toHaveValue(testProjectId);

    await captureForAI(
      window,
      'cloud-browsers',
      'project-id-field-filled',
      ['Project ID field accepts input', 'Value is stored correctly in the input']
    );
  });

  test('should disable Connect button when required fields are empty', async ({ window }) => {
    // Both fields empty - Connect button should be disabled
    const connectButton = settingsPage.browserbaseConnectButton.getByRole('button');
    await expect(connectButton).toBeDisabled();

    // Fill only API key - still disabled
    await settingsPage.browserbaseApiKeyInput.fill('bb_live_test_key');
    await expect(connectButton).toBeDisabled();

    // Clear API key, fill only Project ID - still disabled
    await settingsPage.browserbaseApiKeyInput.clear();
    await settingsPage.browserbaseProjectIdInput.fill('proj_123');
    await expect(connectButton).toBeDisabled();

    // Fill both fields - button should be enabled
    await settingsPage.browserbaseApiKeyInput.fill('bb_live_test_key');
    await expect(connectButton).toBeEnabled();

    await captureForAI(
      window,
      'cloud-browsers',
      'connect-button-validation',
      [
        'Connect button is disabled when fields are empty',
        'Connect button is disabled when only one field is filled',
        'Connect button is enabled when both fields are filled',
      ]
    );
  });

  test('should allow selecting different regions', async ({ window }) => {
    const regionWrapper = settingsPage.browserbaseRegionSelect;
    const trigger = regionWrapper.getByTestId('browserbase-region');

    // Default should show us-west-2 (Oregon)
    await expect(trigger).toHaveText(/us-west-2 \(Oregon\)/);

    // Helper to select a region from the SearchableSelect dropdown
    async function selectRegion(regionId: string) {
      await trigger.click();
      await regionWrapper.getByTestId(`browserbase-region-option-${regionId}`).click();
    }

    // Select us-east-1
    await selectRegion('us-east-1');
    await expect(trigger).toHaveText(/us-east-1 \(Virginia\)/);

    // Select eu-central-1
    await selectRegion('eu-central-1');
    await expect(trigger).toHaveText(/eu-central-1 \(Frankfurt\)/);

    // Select ap-southeast-1
    await selectRegion('ap-southeast-1');
    await expect(trigger).toHaveText(/ap-southeast-1 \(Singapore\)/);

    // Switch back to default
    await selectRegion('us-west-2');
    await expect(trigger).toHaveText(/us-west-2 \(Oregon\)/);

    await captureForAI(
      window,
      'cloud-browsers',
      'region-selection',
      [
        'User can switch between all 4 regions',
        'Selected region value updates correctly',
        'Default region is us-west-2',
      ]
    );
  });
});
