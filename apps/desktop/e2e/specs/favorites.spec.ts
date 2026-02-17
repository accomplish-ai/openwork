import { test, expect } from '../fixtures';
import { HomePage, ExecutionPage } from '../pages';
import { captureForAI } from '../utils';
import { TEST_TIMEOUTS, TEST_SCENARIOS } from '../config';

test.describe('Favorites', () => {
  test('should show favorite toggle on completed task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Capture completed state before favoriting
    await captureForAI(
      window,
      'favorites-toggle',
      'before-favorite',
      [
        'Task is completed',
        'Favorite toggle button is visible',
        'Star icon is not filled (not yet favorited)',
      ]
    );

    // Assert favorite toggle is visible
    await expect(executionPage.favoriteToggle.first()).toBeVisible();

    // Verify aria-pressed is false initially
    const ariaPressed = await executionPage.favoriteToggle.first().getAttribute('aria-pressed');
    expect(ariaPressed).toBe('false');
  });

  test('should toggle favorite on completed task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Click the favorite toggle
    await executionPage.favoriteToggle.first().click();

    // Wait for state update
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Capture favorited state
    await captureForAI(
      window,
      'favorites-toggle',
      'after-favorite',
      [
        'Star icon is now filled (favorited)',
        'Button text changed to "Favorited"',
        'aria-pressed is true',
      ]
    );

    // Verify aria-pressed flipped to true
    const ariaPressed = await executionPage.favoriteToggle.first().getAttribute('aria-pressed');
    expect(ariaPressed).toBe('true');

    // Verify button text changed
    const buttonText = await executionPage.favoriteToggle.first().textContent();
    expect(buttonText).toContain('Favorited');
  });

  test('should unfavorite a previously favorited task', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task and wait for completion
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();

    // Favorite the task
    await executionPage.favoriteToggle.first().click();
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Unfavorite the task
    await executionPage.favoriteToggle.first().click();
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Capture unfavorited state
    await captureForAI(
      window,
      'favorites-toggle',
      'after-unfavorite',
      [
        'Star icon is no longer filled',
        'Button text changed back to "Favorite"',
        'aria-pressed is false',
      ]
    );

    // Verify aria-pressed flipped back to false
    const ariaPressed = await executionPage.favoriteToggle.first().getAttribute('aria-pressed');
    expect(ariaPressed).toBe('false');

    // Verify button text changed back
    const buttonText = await executionPage.favoriteToggle.first().textContent();
    expect(buttonText).toContain('Favorite');
    expect(buttonText).not.toContain('Favorited');
  });

  test('should display favorites section on Home after favoriting', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task, complete it, and favorite it
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();
    await executionPage.favoriteToggle.first().click();
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Navigate back to Home
    await executionPage.startNewTaskButton.click();
    await window.waitForURL(/.*#\/$/, { timeout: TEST_TIMEOUTS.NAVIGATION });

    // Wait for favorites to load
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Capture favorites section on Home
    await captureForAI(
      window,
      'favorites-home',
      'favorites-visible',
      [
        'Favorites section is visible on Home page',
        'At least one favorite item is displayed',
        'Star icon is visible in section header',
      ]
    );

    // Assert favorites section appeared
    await expect(homePage.favoritesSection).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Assert at least one favorite item
    const itemCount = await homePage.favoriteItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('should pre-fill prompt when clicking a favorite on Home', async ({ window }) => {
    const homePage = new HomePage(window);
    const executionPage = new ExecutionPage(window);

    await window.waitForLoadState('domcontentloaded');

    // Submit a task, complete it, and favorite it
    await homePage.enterTask(TEST_SCENARIOS.SUCCESS.keyword);
    await homePage.submitTask();
    await window.waitForURL(/.*#\/execution.*/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await executionPage.waitForComplete();
    await executionPage.favoriteToggle.first().click();
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Navigate back to Home
    await executionPage.startNewTaskButton.click();
    await window.waitForURL(/.*#\/$/, { timeout: TEST_TIMEOUTS.NAVIGATION });
    await window.waitForTimeout(TEST_TIMEOUTS.STATE_UPDATE);

    // Wait for favorites section
    await expect(homePage.favoritesSection).toBeVisible({ timeout: TEST_TIMEOUTS.NAVIGATION });

    // Click the first favorite item
    await homePage.favoriteItems.first().click();

    // Wait for input to be filled
    await window.waitForFunction(
      () => {
        const input = document.querySelector('[data-testid="task-input-textarea"]') as HTMLTextAreaElement;
        return input && input.value.length > 0;
      },
      null,
      { timeout: TEST_TIMEOUTS.NAVIGATION }
    );

    // Capture pre-filled state
    await captureForAI(
      window,
      'favorites-home',
      'prompt-prefilled',
      [
        'Task input is pre-filled with favorite prompt',
        'Input value is not empty',
        'Submit button is enabled',
      ]
    );

    // Assert input is filled
    const inputValue = await homePage.taskInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
    await expect(homePage.submitButton).toBeEnabled();
  });
});
