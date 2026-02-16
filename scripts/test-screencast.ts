/**
 * test-screencast.ts
 *
 * Standalone integration test for the SSE-based screencast architecture.
 *
 * What it does:
 *  1. Starts the dev-browser HTTP server on port 9224
 *  2. Navigates to a page via the MCP tool (JSON-RPC over stdio)
 *  3. POSTs to /screencast/start to begin CDP screencasting
 *  4. Connects to GET /screencast/stream (SSE) and waits for frames
 *  5. POSTs to /screencast/stop and exits
 *
 * Usage:
 *   npx tsx scripts/test-screencast.ts
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_BROWSER_PORT = '9224';
const DEV_BROWSER_CDP_PORT = '9225';
const BASE_URL = `http://localhost:${DEV_BROWSER_PORT}`;

const DEV_BROWSER_ROOT = path.resolve(__dirname, '../packages/agent-core/mcp-tools/dev-browser');
const DEV_BROWSER_MCP_ROOT = path.resolve(__dirname, '../packages/agent-core/mcp-tools/dev-browser-mcp');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, maxRetries = 20): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Server at ${url} did not become ready`);
}

async function testScreencast() {
  let browserServer: ChildProcess | null = null;
  let mcpProcess: ChildProcess | null = null;
  let sseAbort: AbortController | null = null;

  const cleanup = () => {
    sseAbort?.abort();
    // Kill process trees — npx spawns child processes
    for (const proc of [mcpProcess, browserServer]) {
      if (proc?.pid) {
        try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* ignore */ }
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      }
    }
  };
  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('SIGTERM', () => { cleanup(); process.exit(1); });

  try {
    // ── 1. Start dev-browser server ─────────────────────────────────
    console.log('🚀 Starting dev-browser server...');
    browserServer = spawn('npx', ['tsx', 'scripts/start-server.ts'], {
      cwd: DEV_BROWSER_ROOT,
      env: {
        ...process.env,
        DEV_BROWSER_PORT,
        DEV_BROWSER_CDP_PORT,
        HEADLESS: 'true',
      },
      stdio: 'inherit',
      detached: true, // so we can kill the process group
    });
    browserServer.on('error', (err) => console.error('dev-browser spawn error:', err));

    await waitForServer(BASE_URL, 40); // Playwright browser startup can take a while
    console.log('✅ dev-browser server is up');

    // ── 2. Navigate via MCP tool ────────────────────────────────────
    console.log('🌐 Starting MCP tool and navigating to example.com...');
    mcpProcess = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: DEV_BROWSER_MCP_ROOT,
      env: {
        ...process.env,
        DEV_BROWSER_PORT,
        ACCOMPLISH_TASK_ID: 'test-task',
      },
      stdio: ['pipe', 'pipe', 'inherit'],
      detached: true,
    });
    mcpProcess.on('error', (err) => console.error('MCP spawn error:', err));

    const sendRpc = (id: number, method: string, params: unknown) => {
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      mcpProcess!.stdin!.write(msg + '\n');
    };

    // Collect stdout for JSON-RPC responses
    const rpcResponses = new Map<number, unknown>();
    const waitForRpcResponse = (id: number, timeoutMs = 30_000): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`RPC id=${id} timed out`)), timeoutMs);
        const check = () => {
          if (rpcResponses.has(id)) {
            clearTimeout(timer);
            resolve(rpcResponses.get(id));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

    mcpProcess.stdout!.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.id != null) rpcResponses.set(parsed.id, parsed);
        } catch {
          // partial / non-JSON lines
        }
      }
    });

    // Initialize MCP
    sendRpc(0, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    await waitForRpcResponse(0);
    console.log('  ✅ MCP initialized');

    // Navigate
    sendRpc(1, 'tools/call', {
      name: 'browser_navigate',
      arguments: { url: 'https://example.com' },
    });
    await waitForRpcResponse(1);
    console.log('  ✅ Navigated to example.com');

    // ── 3. Start screencast via HTTP ────────────────────────────────
    console.log('📹 Starting screencast...');
    const startRes = await fetch(`${BASE_URL}/screencast/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'main',
        quality: 50,
        everyNthFrame: 6,
        maxWidth: 800,
        maxHeight: 600,
      }),
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start screencast: ${startRes.status} ${await startRes.text()}`);
    }
    console.log('  ✅ Screencast started');

    // ── 4. Connect to SSE stream and wait for frames ────────────────
    console.log('📡 Connecting to SSE stream...');
    sseAbort = new AbortController();
    const sseRes = await fetch(`${BASE_URL}/screencast/stream?name=main`, {
      signal: sseAbort.signal,
    });
    if (!sseRes.ok || !sseRes.body) {
      throw new Error(`SSE connection failed: ${sseRes.status}`);
    }

    let frameCount = 0;
    const TARGET_FRAMES = 3;
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (frameCount < TARGET_FRAMES) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // keep incomplete event in buffer

      for (const event of events) {
        const lines = event.split('\n');
        let eventType = '';
        let eventData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          if (line.startsWith('data: ')) eventData = line.slice(6);
        }
        if (eventType === 'frame' && eventData) {
          frameCount++;
          const parsed = JSON.parse(eventData);
          console.log(
            `  🖼  Frame ${frameCount}: ${parsed.data.length} bytes base64`
          );
        } else if (eventType === 'navigate') {
          console.log(`  🔗 Navigate: ${eventData}`);
        } else if (eventType === 'status') {
          console.log(`  ℹ️  Status: ${eventData}`);
        }
      }
    }

    sseAbort.abort();
    console.log(`✅ Received ${frameCount} frames`);

    // ── 5. Stop screencast ──────────────────────────────────────────
    console.log('🛑 Stopping screencast...');
    const stopRes = await fetch(`${BASE_URL}/screencast/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'main' }),
    });
    if (!stopRes.ok) {
      console.warn(`  ⚠️  Stop returned ${stopRes.status}`);
    } else {
      console.log('  ✅ Screencast stopped');
    }

    console.log('\n🎉 All tests passed!');
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

testScreencast();
