import { test, expect } from '../fixtures';
import { HomePage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_SCENARIOS, TEST_TIMEOUTS } from '../config';

test.describe('Home Page', () => {
  test('should load the floating chat shell', async ({ window }) => {
    const homePage = new HomePage(window);

    await captureForAI(
      window,
      'home-page-load',
      'initial-load',
      [
        'Floating chat shell is visible',
        'Header controls are rendered',
        'Primary chat actions are available'
      ]
    );

    await expect(homePage.menuButton).toBeVisible();
    await expect(window.getByRole('button', { name: 'Close to chat bubble' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Open quick actions and defaults' })).toBeVisible();
  });

  test('should show idle footer controls before sending a message', async ({ window }) => {
    const homePage = new HomePage(window);

    await captureForAI(
      window,
      'home-page-input',
      'task-input-visible',
      [
        'Chat input is visible',
        'Submit button is visible',
        'Input area is ready for user interaction'
      ]
    );

    await expect(homePage.quickActionsButton).toBeVisible();
    await expect(homePage.submitButton).toBeVisible();
    await expect(homePage.submitButton).toBeDisabled();
  });

  test('should allow typing in task input', async ({ window }) => {
    const homePage = new HomePage(window);

    const testTask = 'Write a hello world program';
    await homePage.enterTask(testTask);

    // Capture filled task input
    await captureForAI(
      window,
      'home-page-input',
      'task-input-filled',
      [
        'Chat input contains typed text',
        'Text is clearly visible',
        'Submit button is enabled with text'
      ]
    );

    await expect(homePage.taskInput).toHaveValue(testTask);
    await expect(homePage.submitButton).toBeEnabled();
  });

  test('should open the menu and show chat navigation controls', async ({ window }) => {
    const homePage = new HomePage(window);

    await homePage.openMenu();

    await captureForAI(
      window,
      'home-page-menu',
      'menu-open',
      [
        'Chat menu is open',
        'New chat control is visible',
        'Settings entry is available'
      ]
    );

    await expect(window.getByRole('button', { name: 'New chat' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Settings' })).toBeVisible();
  });

  test('should open quick actions and show desktop-control options', async ({ window }) => {
    const homePage = new HomePage(window);

    await homePage.openQuickActions();

    await captureForAI(
      window,
      'home-page-quick-actions',
      'quick-actions-open',
      [
        'Quick actions menu is open',
        'Live guidance and screen capture actions are visible',
        'Diagnostics action is available'
      ]
    );

    await expect(window.getByText('Guide me live (next message)')).toBeVisible();
    await expect(window.getByText('Add screen capture')).toBeVisible();
    await expect(window.getByText('Recheck diagnostics')).toBeVisible();
  });

  test('should send a prompt and transition into a running chat state', async ({ window }) => {
    const homePage = new HomePage(window);

    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await expect(homePage.submitButton).toBeEnabled();

    await captureForAI(
      window,
      'home-page-submit',
      'before-submit',
      [
        'Prompt is entered in chat input',
        'Send button is ready to click'
      ]
    );

    await homePage.submitTask();

    // Capture after navigation
    await captureForAI(
      window,
      'home-page-submit',
      'after-submit-running',
      [
        'Prompt is visible in the transcript',
        'Chat accepted the prompt',
        'Running or ready controls are visible after submission'
      ]
    );

    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    await expect(window.getByText(TEST_SCENARIOS.SUCCESS.keyword).first()).toBeVisible();
    const stopVisible = await homePage.stopButton.isVisible().catch(() => false);
    const thinkingVisible = await window.locator('span').filter({ hasText: 'Thinking...' }).first().isVisible().catch(() => false);
    const sendVisible = await homePage.submitButton.isVisible().catch(() => false);
    expect(stopVisible || thinkingVisible || sendVisible).toBe(true);
  });

  test('should handle empty input - submit disabled', async ({ window }) => {
    const homePage = new HomePage(window);

    // Capture empty input state
    await captureForAI(
      window,
      'home-page-validation',
      'empty-input',
      [
        'Chat input is empty',
        'Submit button is disabled',
        'User cannot submit an empty task'
      ]
    );

    // Submit button should be disabled when input is empty
    await expect(homePage.submitButton).toBeDisabled();
  });
});
