import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private page: Page) {}

  get title() {
    return this.page.getByRole('heading', { name: 'Hi! I can see your screen.' });
  }

  get taskInput() {
    return this.page.getByLabel('Chat message input');
  }

  get submitButton() {
    return this.page.getByRole('button', { name: 'Send message' });
  }

  get stopButton() {
    return this.page.getByRole('button', { name: 'Stop agent' });
  }

  get quickActionsButton() {
    return this.page.getByRole('button', { name: 'Open quick actions and defaults' });
  }

  get menuButton() {
    return this.page.getByRole('button', { name: 'Open menu' });
  }

  get whatsOnMyScreenButton() {
    return this.page.getByRole('button', { name: "What's on my screen?" });
  }

  get guideMeLiveButton() {
    return this.page.getByRole('button', { name: 'Guide me live' });
  }

  async openQuickActions() {
    await this.quickActionsButton.click();
  }

  async openMenu() {
    await this.menuButton.click();
  }

  async enterTask(text: string) {
    await this.taskInput.fill(text);
  }

  async submitTask() {
    await this.submitButton.click();
  }
}
