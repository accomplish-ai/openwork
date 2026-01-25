import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect } from "vitest";
import { getSnapshotScript, clearSnapshotScriptCache } from "../browser-script";

let browser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
  clearSnapshotScriptCache(); // Start fresh for each test
});

afterEach(async () => {
  await context.close();
});

async function setContent(html: string): Promise<void> {
  await page.setContent(html, { waitUntil: "domcontentloaded" });
}

async function getSnapshot(options?: { maxTokens?: number; maxElements?: number; viewportOnly?: boolean }): Promise<string> {
  const script = getSnapshotScript();
  return await page.evaluate(
    ({ s, opts }: { s: string; opts?: { maxTokens?: number; maxElements?: number; viewportOnly?: boolean } }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = globalThis as any;
      if (!w.__devBrowser_getAISnapshot) {
        // eslint-disable-next-line no-eval
        eval(s);
      }
      return w.__devBrowser_getAISnapshot(opts);
    },
    { s: script, opts: options }
  );
}

async function selectRef(ref: string): Promise<unknown> {
  return await page.evaluate((refId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = globalThis as any;
    const element = w.__devBrowser_selectSnapshotRef(refId);
    return {
      tagName: element.tagName,
      textContent: element.textContent?.trim(),
    };
  }, ref);
}

describe("ARIA Snapshot", () => {
  test("generates snapshot for simple page", async () => {
    await setContent(`
      <html>
        <body>
          <h1>Hello World</h1>
          <button>Click me</button>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("heading");
    expect(snapshot).toContain("Hello World");
    expect(snapshot).toContain("button");
    expect(snapshot).toContain("Click me");
  });

  test("assigns refs to interactive elements", async () => {
    await setContent(`
      <html>
        <body>
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    // Should have refs
    expect(snapshot).toMatch(/\[ref=e\d+\]/);
  });

  test("refs persist on window.__devBrowserRefs", async () => {
    await setContent(`
      <html>
        <body>
          <button>Test Button</button>
        </body>
      </html>
    `);

    await getSnapshot();

    // Check that refs are stored
    const hasRefs = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = globalThis as any;
      return typeof w.__devBrowserRefs === "object" && Object.keys(w.__devBrowserRefs).length > 0;
    });

    expect(hasRefs).toBe(true);
  });

  test("selectSnapshotRef returns element for valid ref", async () => {
    await setContent(`
      <html>
        <body>
          <button>My Button</button>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    // Extract a ref from the snapshot
    const refMatch = snapshot.match(/\[ref=(e\d+)\]/);
    expect(refMatch).toBeTruthy();
    expect(refMatch![1]).toBeDefined();
    const ref = refMatch![1] as string;

    // Select the element by ref
    const result = (await selectRef(ref)) as { tagName: string; textContent: string };
    expect(result.tagName).toBe("BUTTON");
    expect(result.textContent).toBe("My Button");
  });

  test("includes links with URLs", async () => {
    await setContent(`
      <html>
        <body>
          <a href="https://example.com">Example Link</a>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("link");
    expect(snapshot).toContain("Example Link");
    // URL should be included as a prop
    expect(snapshot).toContain("/url:");
  });

  test("includes form elements", async () => {
    await setContent(`
      <html>
        <body>
          <input type="text" placeholder="Enter name" />
          <input type="checkbox" />
          <select>
            <option>Option 1</option>
            <option>Option 2</option>
          </select>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("textbox");
    expect(snapshot).toContain("checkbox");
    expect(snapshot).toContain("combobox");
  });

  test("renders nested structure correctly", async () => {
    await setContent(`
      <html>
        <body>
          <nav>
            <ul>
              <li><a href="/home">Home</a></li>
              <li><a href="/about">About</a></li>
            </ul>
          </nav>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("navigation");
    expect(snapshot).toContain("list");
    expect(snapshot).toContain("listitem");
    expect(snapshot).toContain("link");
  });

  test("handles disabled elements", async () => {
    await setContent(`
      <html>
        <body>
          <button disabled>Disabled Button</button>
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("[disabled]");
  });

  test("handles checked checkboxes", async () => {
    await setContent(`
      <html>
        <body>
          <input type="checkbox" checked />
        </body>
      </html>
    `);

    const snapshot = await getSnapshot();

    expect(snapshot).toContain("[checked]");
  });

  test("should truncate to maxElements with priority", async () => {
    // Navigate to a page with many elements (reduced count to avoid timeout)
    await setContent(`
      <html>
        <body>
          ${Array.from({ length: 20 }, (_, i) => `<button>Button ${i}</button>`).join("")}
          ${Array.from({ length: 20 }, (_, i) => `<a href="#">Link ${i}</a>`).join("")}
        </body>
      </html>
    `);

    // Call the snapshot function with maxElements
    const snapshot = await getSnapshot({ maxElements: 15 });

    // Should include truncation header
    expect(snapshot).toContain("# Elements:");
    expect(snapshot).toContain("of 40");

    // Should have at most 15 element lines (plus header)
    const elementLines = snapshot.split("\n").filter((line: string) => line.match(/^\s*-\s+\w+/));
    expect(elementLines.length).toBeLessThanOrEqual(15);

    // Should prioritize buttons over links (buttons have higher priority)
    const buttonCount = elementLines.filter((line: string) => line.includes("button")).length;
    const linkCount = elementLines.filter((line: string) => line.includes("link")).length;
    expect(buttonCount).toBeGreaterThanOrEqual(linkCount);
  });

  test("should respect maxTokens budget", async () => {
    // Create page with many elements (reduced count to avoid timeout)
    await setContent(`
      <html>
        <body>
          ${Array.from({ length: 50 }, (_, i) => `<button>Button with a moderately long name ${i}</button>`).join("")}
        </body>
      </html>
    `);

    // Request small token budget
    const snapshot = await getSnapshot({ maxTokens: 500 });

    // Should have token info in header
    expect(snapshot).toContain("# Tokens:");

    // Estimate actual tokens (rough approximation: ~4 chars per token)
    const estimatedTokens = Math.ceil(snapshot.length / 4);
    expect(estimatedTokens).toBeLessThanOrEqual(750); // Allow some overhead
  });
});
