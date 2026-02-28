import type { Page } from '@playwright/test';
import { TEST_TIMEOUTS } from '../config';

export class ExecutionPage {
  constructor(private page: Page) {}

  get thinkingIndicator() {
    return this.page.locator('span').filter({ hasText: 'Thinking...' }).first();
  }

  get followUpInput() {
    return this.page.getByLabel('Chat message input');
  }

  get stopButton() {
    return this.page.getByRole('button', { name: 'Stop agent' });
  }

  get sendButton() {
    return this.page.getByRole('button', { name: 'Send message' });
  }

  get readyStatus() {
    return this.page.getByText('Ready to help');
  }

  async waitForRunning() {
    await Promise.race([
      this.stopButton.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.PERMISSION_MODAL }),
      this.thinkingIndicator.waitFor({ state: 'visible', timeout: TEST_TIMEOUTS.PERMISSION_MODAL }),
    ]);
  }

  async waitForComplete() {
    await this.sendButton.waitFor({
      state: 'visible',
      timeout: TEST_TIMEOUTS.PERMISSION_MODAL,
    });
  }
}
