import { test, expect } from '../fixtures';
import { SettingsPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS } from '../config';

test.describe('Settings - Google Vertex AI', () => {
  test('should display Vertex AI provider button', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await expect(settingsPage.vertexProviderButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'provider-button-visible',
      ['Vertex AI provider button is visible', 'User can select Vertex AI']
    );
  });

  test('should show Vertex AI credential form when selected', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Verify Service Account tab is visible (default)
    await expect(settingsPage.vertexServiceAccountTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexADCTab).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'credential-form-visible',
      ['Vertex AI credential form is visible', 'Auth tabs are shown']
    );
  });

  test('should switch between Service Account and ADC tabs', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Default is Service Account - verify inputs
    await expect(settingsPage.vertexProjectIdInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexServiceAccountInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Switch to ADC tab
    await settingsPage.selectVertexADCTab();
    await expect(settingsPage.vertexProjectIdInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexServiceAccountInput).not.toBeVisible();

    // Switch back to Service Account
    await settingsPage.selectVertexServiceAccountTab();
    await expect(settingsPage.vertexServiceAccountInput).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    await captureForAI(
      window,
      'settings-vertex-ai',
      'tab-switching',
      ['Can switch between auth tabs', 'Form fields update correctly']
    );
  });

  test('should allow typing in Vertex AI service account fields', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    const testProjectId = 'my-test-project';
    const testServiceAccount = '{"type": "service_account", "project_id": "test"}';

    await settingsPage.vertexProjectIdInput.fill(testProjectId);
    await settingsPage.vertexServiceAccountInput.fill(testServiceAccount);

    await expect(settingsPage.vertexProjectIdInput).toHaveValue(testProjectId);
    await expect(settingsPage.vertexServiceAccountInput).toHaveValue(testServiceAccount);

    await captureForAI(
      window,
      'settings-vertex-ai',
      'service-account-fields-filled',
      ['Service account fields accept input', 'Project ID field works']
    );
  });

  test('should allow selecting location', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    // Change location
    await settingsPage.vertexLocationSelect.selectOption('us-east4');
    await expect(settingsPage.vertexLocationSelect).toHaveValue('us-east4');

    await captureForAI(
      window,
      'settings-vertex-ai',
      'location-selected',
      ['Location dropdown works', 'Can select different regions']
    );
  });

  test('should have save button for Vertex AI credentials', async ({ window }) => {
    const settingsPage = new SettingsPage(window);
    await window.waitForLoadState('domcontentloaded');
    await settingsPage.navigateToSettings();

    await settingsPage.selectVertexProvider();

    await expect(settingsPage.vertexSaveButton).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });
    await expect(settingsPage.vertexSaveButton).toHaveText('Save Vertex AI Credentials');

    await captureForAI(
      window,
      'settings-vertex-ai',
      'save-button-visible',
      ['Save button is visible', 'Button text is correct']
    );
  });
});
