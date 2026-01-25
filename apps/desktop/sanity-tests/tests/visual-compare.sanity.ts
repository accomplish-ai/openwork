// apps/desktop/sanity-tests/tests/visual-compare.sanity.ts
import { test, expect } from '../fixtures';
import { getModelsToTest } from '../utils/models';
import { globalSetup } from '../utils/setup';
import { fileExists, fileContains, SANITY_OUTPUT_DIR } from '../utils/validators';
import { SanityExecutionPage } from '../page-objects';

// Run global setup once
test.beforeAll(() => {
  globalSetup();
});

const models = getModelsToTest();

for (const model of models) {
  test.describe(`Visual Comparison [${model.displayName}]`, () => {
    test.use({ currentModel: model });

    test('should compare two URLs and save report', async ({ window }) => {
      const homePage = window;
      const executionPage = new SanityExecutionPage(window);

      const taskInput = homePage.getByTestId('task-input-textarea');
      await taskInput.fill(
        `Take screenshots of https://example.com and https://example.org, compare them visually, and save a comparison report to ${SANITY_OUTPUT_DIR}/comparison.md`
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
      expect(fileExists('comparison.md')).toBe(true);
      // Should mention both URLs
      expect(fileContains('comparison.md', 'example.com')).toBe(true);
      expect(fileContains('comparison.md', 'example.org')).toBe(true);
    });
  });
}
