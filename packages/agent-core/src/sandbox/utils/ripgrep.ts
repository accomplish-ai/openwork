import { execFile } from 'child_process'
import type { ExecFileException } from 'child_process'
import { whichSync } from './which.js'

export interface RipgrepConfig {
  command: string
  args?: string[]
}

/**
 * Check if ripgrep (rg) is available synchronously
 * Returns true if rg is installed, false otherwise
 */
export function hasRipgrepSync(): boolean {
  return whichSync('rg') !== null
}

/**
 * Execute ripgrep with the given arguments
 * @param args Command-line arguments to pass to rg
 * @param target Target directory or file to search
 * @param abortSignal AbortSignal to cancel the operation
 * @param config Ripgrep configuration (command and optional args)
 * @returns Array of matching lines (one per line of output)
 * @throws Error if ripgrep exits with non-zero status (except exit code 1 which means no matches)
 */
export async function ripGrep(
  args: string[],
  target: string,
  abortSignal: AbortSignal,
  config: RipgrepConfig = { command: 'rg' },
): Promise<string[]> {
  const { command, args: commandArgs = [] } = config

  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...commandArgs, ...args, target],
      {
        maxBuffer: 20_000_000, // 20MB
        signal: abortSignal,
        timeout: 10_000, // 10 second timeout
      },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        // Success case - exit code 0
        if (!error) {
          resolve(stdout.trim().split('\n').filter(Boolean))
          return
        }

        // Exit code 1 means "no matches found" - this is normal, return empty array
        if (error.code === 1) {
          resolve([])
          return
        }

        // All other errors should fail
        reject(
          new Error(
            `ripgrep failed with exit code ${error.code}: ${stderr || error.message}`,
          ),
        )
      },
    )
  })
}
