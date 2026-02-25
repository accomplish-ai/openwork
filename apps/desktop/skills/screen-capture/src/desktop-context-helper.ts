import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';

import { HELPER_REQUEST_TIMEOUT_MS } from './constants';
import { normalizeHelperFailure, parseHelperError, ToolError } from './errors';
import type {
  DesktopContextCommand,
  DesktopContextResponse,
  DesktopContextWindow,
  PendingRequest,
} from './types';

export class DesktopContextHelperClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private requestCounter = 0;
  private pending = new Map<string, PendingRequest>();
  private stdoutBuffer = '';

  private resolveHelperSpec(): { command: string; args: string[]; helperPath: string } {
    const helperPath = process.env.DESKTOP_CONTEXT_HELPER_PATH;
    if (!helperPath) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_UNAVAILABLE',
        'Desktop context helper path is not configured. Set DESKTOP_CONTEXT_HELPER_PATH.'
      );
    }

    if (!fs.existsSync(helperPath)) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_UNAVAILABLE',
        `Desktop context helper not found at ${helperPath}.`
      );
    }

    if (helperPath.endsWith('.swift')) {
      const swiftCommand = process.env.DESKTOP_CONTEXT_SWIFT_COMMAND || 'swift';
      return {
        command: swiftCommand,
        args: [helperPath],
        helperPath,
      };
    }

    return {
      command: helperPath,
      args: [],
      helperPath,
    };
  }

  private startProcess(): void {
    if (this.child) {
      return;
    }

    const helperSpec = this.resolveHelperSpec();

    this.child = spawn(helperSpec.command, helperSpec.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');

    this.child.stdout.on('data', (chunk: string) => {
      this.stdoutBuffer += chunk;
      const lines = this.stdoutBuffer.split('\n');
      this.stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        this.handleResponse(trimmed);
      }
    });

    this.child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text.length > 0) {
        console.error(`[desktop-context-helper] ${text}`);
      }
    });

    this.child.on('error', (error) => {
      this.rejectAllPending(
        new ToolError('ERR_DESKTOP_CONTEXT_HELPER_EXITED', `Desktop context helper error: ${error.message}`)
      );
      this.child = null;
    });

    this.child.on('exit', (code, signal) => {
      const reason = `Desktop context helper exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
      this.rejectAllPending(new ToolError('ERR_DESKTOP_CONTEXT_HELPER_EXITED', reason));
      this.child = null;
    });
  }

  private rejectAllPending(error: ToolError): void {
    for (const [requestId, request] of this.pending.entries()) {
      clearTimeout(request.timeout);
      request.reject(error);
      this.pending.delete(requestId);
    }
  }

  private handleResponse(line: string): void {
    let response: DesktopContextResponse;
    try {
      response = JSON.parse(line) as DesktopContextResponse;
    } catch {
      console.error('[desktop-context-helper] Invalid JSON response:', line);
      return;
    }

    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);

    if (!response.success) {
      pending.reject(parseHelperError(response.error ?? 'Unknown helper error'));
      return;
    }

    pending.resolve(response);
  }

  async send(command: DesktopContextCommand): Promise<DesktopContextResponse> {
    this.startProcess();

    if (!this.child || !this.child.stdin.writable) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_UNAVAILABLE',
        'Desktop context helper is not available.'
      );
    }

    return await new Promise<DesktopContextResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(command.id);
        reject(
          new ToolError(
            'ERR_DESKTOP_CONTEXT_TIMEOUT',
            `Desktop context helper request timed out after ${HELPER_REQUEST_TIMEOUT_MS}ms.`
          )
        );
      }, HELPER_REQUEST_TIMEOUT_MS);

      this.pending.set(command.id, {
        resolve,
        reject,
        timeout,
      });

      try {
        this.child?.stdin.write(`${JSON.stringify(command)}\n`, 'utf8');
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(command.id);
        reject(normalizeHelperFailure(error));
      }
    });
  }

  private nextRequestId(prefix: string): string {
    this.requestCounter += 1;
    return `${prefix}_${Date.now()}_${this.requestCounter}`;
  }

  async listWindows(): Promise<DesktopContextWindow[]> {
    const response = await this.send({
      cmd: 'list_windows',
      id: this.nextRequestId('list'),
    });

    return response.data?.windows ?? [];
  }

  async captureWindow(windowId: number): Promise<{ imagePath: string }> {
    const response = await this.send({
      cmd: 'capture',
      id: this.nextRequestId('capture_window'),
      params: {
        mode: 'window',
        windowId,
      },
    });

    const imagePath = response.data?.imagePath;
    if (!imagePath) {
      throw new ToolError(
        'ERR_DESKTOP_CONTEXT_PROTOCOL',
        'Desktop context helper did not return an imagePath for capture.'
      );
    }

    return { imagePath };
  }

  async inspectWindow(windowId: number, maxDepth: number, maxNodes: number): Promise<unknown> {
    const response = await this.send({
      cmd: 'inspect_window',
      id: this.nextRequestId('inspect'),
      params: {
        windowId,
        maxDepth,
        maxNodes,
      },
    });

    return response.data?.tree ?? null;
  }

  dispose(): void {
    this.rejectAllPending(
      new ToolError('ERR_DESKTOP_CONTEXT_HELPER_EXITED', 'Desktop context helper is shutting down.')
    );

    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

export const desktopContextHelper = new DesktopContextHelperClient();
