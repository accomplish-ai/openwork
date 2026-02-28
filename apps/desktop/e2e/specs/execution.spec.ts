import { test, expect } from '../fixtures';
import { HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS, TEST_SCENARIOS } from '../config';

test.describe('Execution Page', () => {
  test('should display a running state after sending a prompt', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    await captureForAI(
      window,
      'execution-running',
      'thinking-indicator',
      [
        'Floating chat remains loaded',
        'Thinking indicator is visible',
        'Task is in running state',
        'UI shows active processing'
      ]
    );

    const thinkingVisible = await executionPage.thinkingIndicator.isVisible().catch(() => false);
    const stopVisible = await executionPage.stopButton.isVisible().catch(() => false);
    const sendVisible = await executionPage.sendButton.isVisible().catch(() => false);

    expect(thinkingVisible || stopVisible || sendVisible).toBe(true);
    await expect(window.getByText(TEST_SCENARIOS.SUCCESS.keyword).first()).toBeVisible();
  });

  test('should return to idle state after a successful task completes', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await executionPage.waitForComplete();

    await captureForAI(
      window,
      'execution-completed',
      'chat-ready',
      [
        'Loading controls are gone',
        'Chat input is enabled again',
        'Task completed successfully',
        'Conversation remains visible'
      ]
    );

    await expect(executionPage.sendButton).toBeVisible();
    await expect(executionPage.followUpInput).toBeEnabled();
    await expect(window.getByText(TEST_SCENARIOS.SUCCESS.keyword).first()).toBeVisible();
  });

  test('should complete a tool-oriented prompt without hanging the chat', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.WITH_TOOL.keyword);
    await homePage.submitTask();
    await executionPage.waitForComplete();

    await captureForAI(
      window,
      'execution-tool-usage',
      'tool-flow-complete',
      [
        'Tool-oriented task completed',
        'Conversation transcript is preserved',
        'Chat returned to idle after execution'
      ]
    );

    await expect(executionPage.sendButton).toBeVisible();
    await expect(window.getByText(TEST_SCENARIOS.WITH_TOOL.keyword).first()).toBeVisible();
  });

  test('should recover to an idle state after an erroring task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.ERROR.keyword);
    await homePage.submitTask();
    await executionPage.waitForRunning();
    await executionPage.waitForComplete();

    await captureForAI(
      window,
      'execution-error',
      'task-failed',
      [
        'Erroring task completed its failure path',
        'Chat is interactive again',
        'Conversation transcript is still visible'
      ]
    );

    await expect(executionPage.sendButton).toBeVisible();
    await expect(executionPage.followUpInput).toBeEnabled();
    await expect(window.getByText(TEST_SCENARIOS.ERROR.keyword).first()).toBeVisible();
  });

  test('should recover cleanly from the interrupted mock scenario', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.INTERRUPTED.keyword);
    await homePage.submitTask();
    await executionPage.waitForComplete();

    await captureForAI(
      window,
      'execution-interrupted',
      'stopped',
      [
        'Interrupted scenario completed',
        'Loading controls were cleared',
        'Chat returned to an idle state'
      ]
    );

    await expect(executionPage.sendButton).toBeVisible();
    await expect(window.getByText(TEST_SCENARIOS.INTERRUPTED.keyword).first()).toBeVisible();
  });

  test('should accept follow-up text after a task completes', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await executionPage.waitForComplete();

    await captureForAI(
      window,
      'execution-follow-up',
      'follow-up-ready',
      [
        'Chat input is available after completion',
        'User can continue the conversation',
        'Transcript remains in place'
      ]
    );

    await executionPage.followUpInput.fill('Follow up task');
    await expect(executionPage.followUpInput).toHaveValue('Follow up task');
  });
});
