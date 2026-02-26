/**
 * CLI Bridge
 *
 * Standalone script that sends JSON-RPC 2.0 commands to the Accomplish daemon
 * socket. Works without Electron — uses only Node.js built-ins.
 *
 * Usage:
 *   npx ts-node cli-bridge.ts run "List files in /tmp"
 *   npx ts-node cli-bridge.ts schedule "0 9 * * 1-5" "Check email"
 *   npx ts-node cli-bridge.ts list-scheduled
 *   npx ts-node cli-bridge.ts cancel-scheduled sched-abc123
 *   npx ts-node cli-bridge.ts list
 *   npx ts-node cli-bridge.ts ping
 *   npx ts-node cli-bridge.ts health
 *   npx ts-node cli-bridge.ts status
 */

import net from 'net';
import path from 'path';
import os from 'os';

function getDefaultSocketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\accomplish-daemon';
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Accomplish', 'daemon.sock');
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(xdgConfigHome, 'Accomplish', 'daemon.sock');
}

function sendRpc(
  socketPath: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

    const client = net.createConnection(socketPath, () => {
      client.write(payload);
    });

    let buffer = '';
    client.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) {
          client.destroy();
          let response: {
            result?: unknown;
            error?: { code: number; message: string; data?: unknown };
          };
          try {
            response = JSON.parse(line) as typeof response;
          } catch {
            reject(new Error('Invalid JSON response from daemon'));
            return;
          }
          if (response.error) {
            reject(new Error(`RPC error ${response.error.code}: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
          return;
        }
      }
    });

    client.on('error', (err) => {
      reject(new Error(`Cannot connect to daemon at ${socketPath}: ${err.message}`));
    });

    client.setTimeout(10_000, () => {
      client.destroy();
      reject(new Error('Timeout waiting for daemon response'));
    });
  });
}

export async function handleCliCommand(args: string[]): Promise<void> {
  const socketPath = process.env.ACCOMPLISH_SOCKET ?? getDefaultSocketPath();
  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    return;
  }

  switch (command) {
    case 'run': {
      const prompt = rest.join(' ');
      if (!prompt) {
        console.error('Usage: run "<prompt>"');
        process.exit(1);
      }
      const result = (await sendRpc(socketPath, 'task.start', { prompt })) as { taskId: string };
      console.log('Task started:', result.taskId);
      break;
    }

    case 'schedule': {
      const [cron, ...promptParts] = rest;
      const prompt = promptParts.join(' ');
      if (!cron || !prompt) {
        console.error('Usage: schedule "<cron>" "<prompt>"');
        process.exit(1);
      }
      const scheduled = await sendRpc(socketPath, 'task.schedule', { cron, prompt });
      console.log('Scheduled task:', JSON.stringify(scheduled, null, 2));
      break;
    }

    case 'list-scheduled': {
      const result = (await sendRpc(socketPath, 'task.listScheduled')) as {
        schedules: Array<{
          id: string;
          cron: string;
          prompt: string;
          enabled: boolean;
          nextRunAt?: string;
          lastRunAt?: string;
        }>;
      };
      if (result.schedules.length === 0) {
        console.log('No scheduled tasks.');
      } else {
        console.log('Scheduled tasks:');
        for (const s of result.schedules) {
          const status = s.enabled ? 'ON' : 'OFF';
          console.log(`  [${status}] ${s.id} "${s.prompt}" @ ${s.cron}`);
          if (s.nextRunAt) {
            console.log(`     Next run: ${s.nextRunAt}`);
          }
          if (s.lastRunAt) {
            console.log(`     Last run: ${s.lastRunAt}`);
          }
        }
      }
      break;
    }

    case 'cancel-scheduled': {
      const [scheduleId] = rest;
      if (!scheduleId) {
        console.error('Usage: cancel-scheduled <scheduleId>');
        process.exit(1);
      }
      await sendRpc(socketPath, 'task.cancelScheduled', { scheduleId });
      console.log('Cancelled schedule:', scheduleId);
      break;
    }

    case 'list': {
      const result = (await sendRpc(socketPath, 'task.list')) as { tasks: string[] };
      if (result.tasks.length === 0) {
        console.log('No active tasks.');
      } else {
        console.log('Active tasks:');
        for (const t of result.tasks) {
          console.log(`  ${t}`);
        }
      }
      break;
    }

    case 'stop': {
      const [taskId] = rest;
      if (!taskId) {
        console.error('Usage: stop <taskId>');
        process.exit(1);
      }
      await sendRpc(socketPath, 'task.stop', { taskId });
      console.log('Task stopped:', taskId);
      break;
    }

    case 'get': {
      const [taskId] = rest;
      if (!taskId) {
        console.error('Usage: get <taskId>');
        process.exit(1);
      }
      const result = await sendRpc(socketPath, 'task.get', { taskId });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'ping': {
      const result = await sendRpc(socketPath, 'daemon.ping');
      console.log('Daemon response:', JSON.stringify(result));
      break;
    }

    case 'health': {
      const result = (await sendRpc(socketPath, 'daemon.health')) as {
        version: string;
        uptime: number;
        activeTasks: number;
        memoryUsage: number;
      };
      console.log(`Version: ${result.version}`);
      console.log(`Uptime: ${result.uptime}s`);
      console.log(`Active tasks: ${result.activeTasks}`);
      console.log(`Memory: ${Math.round(result.memoryUsage / 1024 / 1024)}MB`);
      break;
    }

    case 'status': {
      const result = await sendRpc(socketPath, 'daemon.status');
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

function printUsage(): void {
  console.log(
    `
Accomplish CLI Bridge

Commands:
  run "<prompt>"                  Start a task immediately
  schedule "<cron>" "<prompt>"    Schedule a recurring task
  list-scheduled                  List all scheduled tasks
  cancel-scheduled <id>           Cancel a scheduled task
  list                            List active tasks
  stop <taskId>                   Stop a running task
  get <taskId>                    Get task details
  ping                            Check if daemon is alive
  health                          Show daemon health info
  status                          Show daemon status

Environment:
  ACCOMPLISH_SOCKET    Override daemon socket path
`.trim(),
  );
}

// Run as standalone script
if (process.argv[1] && process.argv[1].includes('cli-bridge')) {
  handleCliCommand(process.argv.slice(2)).catch((err) => {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
