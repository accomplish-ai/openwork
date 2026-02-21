import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import { createServer, type Server as HttpServer } from 'http';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { validateAriaFile } from '@main/telemetry/aria-schema-validator';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MCP_SERVER_DIR = resolve(
  __dirname,
  '../../../../../packages/agent-core/mcp-tools/dev-browser-mcp',
);
const MCP_SERVER_ENTRY = resolve(MCP_SERVER_DIR, 'dist/index.mjs');

const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>MCP ARIA Contract Test Page</title></head>
<body>
  <header>
    <nav aria-label="Main navigation">
      <a href="/home">Home</a>
      <a href="/about">About</a>
      <button type="button">Menu</button>
    </nav>
  </header>
  <main>
    <h1>Welcome</h1>
    <h2>Registration Form</h2>
    <form aria-label="Registration">
      <label for="name">Name</label>
      <input id="name" type="text" placeholder="Enter your name" />
      <label for="email">Email</label>
      <input id="email" type="email" placeholder="you@example.com" />
      <label for="country">Country</label>
      <select id="country">
        <option value="us">United States</option>
        <option value="uk">United Kingdom</option>
        <option value="ca">Canada</option>
      </select>
      <label>
        <input type="checkbox" id="agree" /> I agree to the terms
      </label>
      <button type="submit">Submit</button>
    </form>
    <hr />
    <h2>Data Table</h2>
    <table>
      <thead><tr><th>Name</th><th>Age</th><th>City</th></tr></thead>
      <tbody>
        <tr><td>Alice</td><td>30</td><td>NYC</td></tr>
        <tr><td>Bob</td><td>25</td><td>LA</td></tr>
      </tbody>
    </table>
    <h2>Items</h2>
    <ul>
      <li>Item one</li>
      <li>Item two</li>
      <li>Item three</li>
    </ul>
    <a href="https://example.com">External link</a>
    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Placeholder image" />
  </main>
  <footer>
    <p>Footer content</p>
  </footer>
</body>
</html>`;

/**
 * Parse MCP snapshot output into the 5-line header format expected by validateAriaFile.
 *
 * MCP browser_snapshot output:
 *   # Page Info
 *   URL: ...
 *   Viewport: WxH (center: x, y)
 *   Mode: ...
 *
 *   # Accessibility Tree
 *   - role ...
 *
 * validateAriaFile expects:
 *   URL: ...
 *   Title: ...
 *   Viewport: WxH
 *   Bounding Box Format: [x, y, width, height]
 *   User-Agent: ...
 *
 *   <ARIA tree body>
 */
function convertMcpSnapshotToValidatorFormat(mcpOutput: string, title: string): string {
  const lines = mcpOutput.split('\n');

  let url = '';
  let viewport = '';
  let ariaTreeStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('URL: ')) {
      url = line.substring('URL: '.length);
    }

    if (line.startsWith('Viewport: ')) {
      const raw = line.substring('Viewport: '.length);
      const parenIndex = raw.indexOf(' (');
      viewport = parenIndex !== -1 ? raw.substring(0, parenIndex) : raw;
    }

    if (line === '# Accessibility Tree') {
      ariaTreeStart = i + 1;
      break;
    }
  }

  if (ariaTreeStart === -1) {
    throw new Error('Could not find "# Accessibility Tree" in MCP output');
  }

  const ariaBody = lines.slice(ariaTreeStart).join('\n');

  return [
    `URL: ${url}`,
    `Title: ${title}`,
    `Viewport: ${viewport}`,
    `Bounding Box Format: [x, y, width, height]`,
    `User-Agent: vitest-mcp-contract-test`,
    '',
    ariaBody,
  ].join('\n');
}

let chromiumProcess: ChildProcess;
let cdpEndpoint: string;
let mcpClient: Client;
let mcpTransport: StdioClientTransport;
let httpServer: HttpServer;
let testPageUrl: string;

async function launchChromiumWithCDP(): Promise<{ process: ChildProcess; wsEndpoint: string }> {
  const executablePath = chromium.executablePath();
  const port = 9222 + Math.floor(Math.random() * 10000);

  const proc = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--use-mock-keychain',
      'about:blank',
    ],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  const wsEndpoint = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for CDP endpoint')),
      10_000,
    );
    let stderrData = '';

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString();
      const match = stderrData.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]!);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(
        new Error(`Chromium exited with code ${code} before CDP was ready. stderr: ${stderrData}`),
      );
    });
  });

  return { process: proc, wsEndpoint };
}

function startHttpServer(html: string): Promise<{ server: HttpServer; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });

    server.on('error', reject);
  });
}

beforeAll(async () => {
  if (!existsSync(MCP_SERVER_ENTRY)) {
    throw new Error(
      `Missing MCP dist entry at ${MCP_SERVER_ENTRY}. Run "pnpm -F @accomplish/desktop build:mcp-tools:dev".`,
    );
  }

  const httpResult = await startHttpServer(TEST_HTML);
  httpServer = httpResult.server;
  testPageUrl = httpResult.url;

  const cdpResult = await launchChromiumWithCDP();
  chromiumProcess = cdpResult.process;
  cdpEndpoint = cdpResult.wsEndpoint;

  mcpTransport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_SERVER_ENTRY],
    cwd: MCP_SERVER_DIR,
    env: {
      ...process.env,
      CDP_ENDPOINT: cdpEndpoint,
      ACCOMPLISH_TASK_ID: 'aria-mcp-test',
    },
  });

  mcpClient = new Client({ name: 'aria-mcp-contract-test', version: '1.0.0' });
  await mcpClient.connect(mcpTransport);
}, 30_000);

afterAll(async () => {
  if (mcpClient) {
    try {
      await mcpClient.close();
    } catch {
      // intentionally empty
    }
  }

  if (mcpTransport) {
    try {
      await mcpTransport.close();
    } catch {
      // intentionally empty
    }
  }

  if (chromiumProcess && !chromiumProcess.killed) {
    chromiumProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        if (!chromiumProcess.killed) {
          chromiumProcess.kill('SIGKILL');
        }
        resolve();
      }, 3_000);

      chromiumProcess.on('exit', () => {
        clearTimeout(forceKill);
        resolve();
      });
    });
  }

  if (httpServer) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

describe('MCP ARIA snapshot contract', () => {
  it('lists browser_snapshot in available tools', async () => {
    const result = await mcpClient.listTools();
    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain('browser_snapshot');
  }, 15_000);

  it('ARIA snapshot via MCP validates against schema', async () => {
    await mcpClient.callTool({
      name: 'browser_navigate',
      arguments: { url: testPageUrl },
    });

    const snapshotResult = await mcpClient.callTool({
      name: 'browser_snapshot',
      arguments: {
        interactive_only: false,
        full_snapshot: true,
        include_history: false,
      },
    });

    expect(snapshotResult.content).toBeDefined();
    expect(Array.isArray(snapshotResult.content)).toBe(true);

    const textContent = (snapshotResult.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === 'text',
    );
    expect(textContent).toBeDefined();

    const mcpOutput = textContent!.text;
    expect(mcpOutput).toContain('# Page Info');
    expect(mcpOutput).toContain('URL:');
    expect(mcpOutput).toContain('Viewport:');
    expect(mcpOutput).toContain('# Accessibility Tree');

    const validatorInput = convertMcpSnapshotToValidatorFormat(
      mcpOutput,
      'MCP ARIA Contract Test Page',
    );
    const result = validateAriaFile(validatorInput);

    expect(result.valid).toBe(true);
    expect(result.errors.filter((e) => e.severity === 'error')).toHaveLength(0);
    expect(result.stats.elementLines).toBeGreaterThan(10);

    expect(result.header).not.toBeNull();
    expect(result.header!.url).toMatch(new RegExp(`^${testPageUrl}/?$`));
    expect(result.header!.title).toBe('MCP ARIA Contract Test Page');
    expect(result.header!.userAgent).toBeTruthy();

    const expectedRoles = ['heading', 'button', 'textbox', 'table', 'list', 'link', 'navigation'];
    for (const role of expectedRoles) {
      expect(mcpOutput).toContain(`- ${role}`);
    }
  }, 15_000);

  it('interactive-only mode returns filtered output', async () => {
    const fullResult = await mcpClient.callTool({
      name: 'browser_snapshot',
      arguments: {
        interactive_only: false,
        full_snapshot: true,
        include_history: false,
      },
    });

    const interactiveResult = await mcpClient.callTool({
      name: 'browser_snapshot',
      arguments: {
        interactive_only: true,
        full_snapshot: true,
        include_history: false,
      },
    });

    const fullText = (fullResult.content as Array<{ type: string; text: string }>).find(
      (c) => c.type === 'text',
    )!.text;
    const interactiveText = (
      interactiveResult.content as Array<{ type: string; text: string }>
    ).find((c) => c.type === 'text')!.text;

    expect(interactiveText.length).toBeLessThan(fullText.length);

    expect(interactiveText).toContain('# Accessibility Tree');
    expect(interactiveText).toContain('Mode: Interactive elements only');
  }, 15_000);
});
