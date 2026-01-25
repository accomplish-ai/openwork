// apps/desktop/sanity-tests/tests/web-scraping.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest, type SanityModel } from '../utils/models';
import { globalSetup } from '../utils/setup';
import { fileExists, countLines, fileContains, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

// Run global setup once
test.beforeAll(() => {
  globalSetup();
});

const models = getModelsToTest();

for (const model of models) {
  test.describe(`Web Scraping [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should scrape Hacker News and save to CSV', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      // Enter the task prompt
      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Go to Hacker News (https://news.ycombinator.com), get the top 5 stories (title, URL, points), and save them to ${SANITY_OUTPUT_DIR}/hn-top5.csv`
      );

      // Submit the task
      const submitButton = homePage.getByTestId('task-input-submit');
      await submitButton.click();

      // Wait for navigation to execution page
      await homePage.waitForURL(/\/execution\//);

      // Auto-allow permissions
      await executionPage.autoAllowPermissions();

      // Wait for task to complete
      const status = await executionPage.waitForComplete();
      executionPage.stopAutoAllow();

      // Validate completion
      expect(status).toBe('completed');

      // Validate output file
      expect(fileExists('hn-top5.csv')).toBe(true);
      expect(countLines('hn-top5.csv')).toBeGreaterThanOrEqual(5); // Header + 5 rows
      expect(fileContains('hn-top5.csv', /title|url|points/i)).toBe(true);
    });
  });
}
