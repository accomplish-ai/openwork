import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Cloud Browsers', () => {
  let settingsPage: SettingsPage;

  test.beforeEach(async ({ window }) => {
    settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();
    await settingsPage.navigateToCloudBrowsers();
  });

  test('should display Cloud Browsers tab in settings', async ({ window }) => {
    await expect(settingsPage.cloudBrowsersTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'tab-visible', [
      'Cloud Browsers tab is visible in settings',
    ]);
  });

  test('should show Cloud Browsers panel when tab is clicked', async ({ window }) => {
    await expect(settingsPage.cloudBrowsersPanel).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'panel-visible', [
      'Cloud Browsers panel is visible after clicking tab',
    ]);
  });

  test('should show AWS AgentCore card', async ({ window }) => {
    await expect(settingsPage.awsAgentCoreCard).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'aws-card-visible', [
      'AWS AgentCore card is displayed',
    ]);
  });

  test('should display AWS Profile auth type by default', async ({ window }) => {
    await expect(settingsPage.awsAuthTypeProfile).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.awsAuthTypeAccessKeys).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.awsProfileInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'default-auth-type', [
      'AWS Profile is shown by default',
      'Profile input is visible',
    ]);
  });

  test('should toggle between auth types', async ({ window }) => {
    // Click Access Keys auth type and wait for fields to appear
    await settingsPage.selectAwsAuthTypeAccessKeys();

    // Verify access key fields are visible
    await expect(settingsPage.awsAccessKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.awsSecretKeyInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify profile input is NOT visible (mutual exclusivity)
    await expect(settingsPage.awsProfileInput).not.toBeVisible();

    // Click Profile auth type and wait for field to appear
    await settingsPage.selectAwsAuthTypeProfile();

    // Verify profile field is visible
    await expect(settingsPage.awsProfileInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Verify access key fields are NOT visible (mutual exclusivity)
    await expect(settingsPage.awsAccessKeyInput).not.toBeVisible();
    await expect(settingsPage.awsSecretKeyInput).not.toBeVisible();

    await captureForAI(window, 'cloud-browsers', 'auth-type-toggle', [
      'Can toggle between AWS Profile and Access Keys',
      'Form fields update correctly',
    ]);
  });

  test('should show region selector', async ({ window }) => {
    await expect(settingsPage.awsRegionSelect).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'region-selector', [
      'Region selector is visible',
    ]);
  });

  test('should show Connect button', async ({ window }) => {
    await expect(settingsPage.awsConnectButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(window, 'cloud-browsers', 'connect-button', [
      'Connect button is visible',
      'User can connect to AWS',
    ]);
  });

  test('should allow typing in access key fields', async ({ window }) => {
    // Switch to Access Keys
    await settingsPage.selectAwsAuthTypeAccessKeys();

    const testAccessKey = 'AKIAIOSFODNN7EXAMPLE';
    const testSecretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';

    await settingsPage.enterAwsAccessKeyCredentials(testAccessKey, testSecretKey);

    await expect(settingsPage.awsAccessKeyInput).toHaveValue(testAccessKey);
    await expect(settingsPage.awsSecretKeyInput).toHaveValue(testSecretKey);

    await captureForAI(window, 'cloud-browsers', 'access-key-fields-filled', [
      'Access key fields accept input',
      'Values are correctly displayed',
    ]);
  });

  test('should allow typing in profile name field', async ({ window }) => {
    await settingsPage.enterAwsProfileName('my-dev-profile');

    await expect(settingsPage.awsProfileInput).toHaveValue('my-dev-profile');

    await captureForAI(window, 'cloud-browsers', 'profile-field-filled', [
      'Profile name field accepts input',
    ]);
  });

  test('should disable Connect button when required fields are empty', async ({ window }) => {
    // Switch to Access Keys auth type
    await settingsPage.selectAwsAuthTypeAccessKeys();

    // Both access key fields are empty, so the connect button should be disabled
    const connectButton = settingsPage.awsConnectButton.locator('button');
    await expect(connectButton).toBeDisabled();

    // Fill only one field - button should still be disabled
    await settingsPage.awsAccessKeyInput.fill('AKIAIOSFODNN7EXAMPLE');
    await expect(connectButton).toBeDisabled();

    // Clear and switch to profile auth type
    await settingsPage.selectAwsAuthTypeProfile();

    // Clear the profile name field completely
    await settingsPage.awsProfileInput.clear();
    await expect(connectButton).toBeDisabled();

    await captureForAI(window, 'cloud-browsers', 'connect-button-disabled', [
      'Connect button is disabled when required fields are empty',
      'Form validation prevents empty submissions',
    ]);
  });
});
