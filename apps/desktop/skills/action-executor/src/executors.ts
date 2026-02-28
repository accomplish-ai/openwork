import { execFile } from 'child_process';
import { promisify } from 'util';
import { EXECUTION_TIMEOUT_MS, PERMISSION_REMEDIATION, RUNTIME_REMEDIATION } from './constants';
import { ActionExecutorError, isPermissionError, extractExecDetails, errorMessage } from './errors';

const execFileAsync = promisify(execFile);

export async function runExecutable(command: string, args: string[], context: Record<string, unknown>): Promise<void> {
  try {
    await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024,
      timeout: EXECUTION_TIMEOUT_MS,
      killSignal: 'SIGTERM',
    });
  } catch (error) {
    const details = { ...context, command, args };
    if (isPermissionError(error)) {
      throw new ActionExecutorError(
        'PERMISSION_MISSING',
        'Accessibility permission is required to run mouse and keyboard actions.',
        { ...details, ...extractExecDetails(error), cause: errorMessage(error) },
        PERMISSION_REMEDIATION
      );
    }
    throw new ActionExecutorError(
      'RUNTIME_FAILURE',
      'Action execution failed.',
      { ...details, ...extractExecDetails(error), cause: errorMessage(error) },
      RUNTIME_REMEDIATION
    );
  }
}

export async function runPythonScript(
  script: string,
  scriptArgs: string[],
  context: Record<string, unknown>
): Promise<void> {
  await runExecutable('python3', ['-c', script, ...scriptArgs], context);
}

export async function runAppleScript(
  lines: string[],
  scriptArgs: string[],
  context: Record<string, unknown>
): Promise<void> {
  const args = lines.flatMap((line) => ['-e', line]);
  // `--` prevents osascript from treating user-supplied values as additional CLI flags (for example, `-e`).
  await runExecutable('osascript', [...args, '--', ...scriptArgs], context);
}
