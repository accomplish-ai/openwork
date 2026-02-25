import { exec, execFile } from 'child_process';
import { promisify } from 'util';

export const execAsync = promisify(exec);
export const execFileAsync = promisify(execFile);
