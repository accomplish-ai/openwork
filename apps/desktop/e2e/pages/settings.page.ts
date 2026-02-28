import type { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from '../config';

export class SettingsPage {
  constructor(private page: Page) {}

  get title() {
    return this.page.getByRole('heading', { name: 'Settings' });
  }

  get debugModeToggle() {
    return this.page.getByTestId('settings-debug-toggle');
  }

  get modelSection() {
    return this.page.getByTestId('settings-model-section');
  }

  get modelSelect() {
    return this.page.getByTestId('settings-model-select');
  }

  get providerSection() {
    return this.page.getByTestId('settings-provider-section');
  }

  get apiKeyInput() {
    return this.page.getByTestId('settings-api-key-input');
  }

  get addApiKeyButton() {
    return this.page.getByTestId('settings-add-api-key-button');
  }

  get removeApiKeyButton() {
    return this.page.getByTestId('settings-remove-api-key-button');
  }

  get backButton() {
    return this.page.getByTestId('settings-back-button');
  }

  get menuButton() {
    return this.page.getByRole('button', { name: 'Open menu' });
  }

  get menuSettingsButton() {
    return this.page.getByRole('button', { name: 'Settings' });
  }

  async navigateToSettings() {
    if (await this.title.isVisible().catch(() => false)) {
      return;
    }
    await this.menuButton.click();
    await this.menuSettingsButton.click();
    await this.page.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);
  }

  async toggleDebugMode() {
    await this.debugModeToggle.click();
  }

  async selectModel(modelName: string) {
    await this.modelSelect.click();
    await this.page.getByText(modelName).click();
  }

  async addApiKey(provider: string, key: string) {
    await this.apiKeyInput.fill(key);
    await this.addApiKeyButton.click();
  }
}
