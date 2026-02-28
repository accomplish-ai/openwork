import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const actionExecutorActionsPath = path.resolve(
  currentDir,
  '../../../skills/action-executor/src/actions.ts'
);
const actionExecutorExecutorsPath = path.resolve(
  currentDir,
  '../../../skills/action-executor/src/executors.ts'
);
const actionExecutorScriptsPath = path.resolve(
  currentDir,
  '../../../skills/action-executor/src/scripts.ts'
);
const actionExecutorActionsSource = readFileSync(actionExecutorActionsPath, 'utf8');
const actionExecutorExecutorsSource = readFileSync(actionExecutorExecutorsPath, 'utf8');
const actionExecutorScriptsSource = readFileSync(actionExecutorScriptsPath, 'utf8');

describe('Action Executor Security Regression', () => {
  it('routes type_text input through AppleScript argv instead of inline interpolation', () => {
    expect(actionExecutorScriptsSource).toContain(
      'tell application "System Events" to keystroke (item 1 of argv)'
    );
    expect(actionExecutorActionsSource).toContain(
      "await runAppleScript(APPLESCRIPT_TYPE_TEXT, [text],"
    );
    expect(actionExecutorScriptsSource).not.toMatch(/keystroke\s+\$\{/);
  });

  it('routes move_mouse coordinates through Python argv values', () => {
    expect(actionExecutorScriptsSource).toContain('target_x = float(sys.argv[1])');
    expect(actionExecutorScriptsSource).toContain('target_y = float(sys.argv[2])');
    expect(actionExecutorActionsSource).toContain(
      'await runPythonScript(PYTHON_MOVE_MOUSE_SCRIPT, [String(x), String(y)], {'
    );
  });

  it('moves pointer before click actions so movement is visible', () => {
    const moveCalls = actionExecutorActionsSource.match(/await moveMouse\(x, y\);/g) ?? [];
    expect(moveCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('uses execFile argument arrays for subprocess execution', () => {
    expect(actionExecutorExecutorsSource).toContain('await execFileAsync(command, args, {');
    expect(actionExecutorExecutorsSource).toMatch(
      /await runExecutable\('osascript', \[\.\.\.args, (?:'--', )?\.\.\.scriptArgs\], context\);/
    );
    expect(actionExecutorExecutorsSource).toContain(
      "await runExecutable('python3', ['-c', script, ...scriptArgs], context);"
    );
    expect(actionExecutorExecutorsSource).not.toMatch(/\bexec\(/);
  });

  it('routes activate_app target via AppleScript argv without string interpolation', () => {
    expect(actionExecutorScriptsSource).toContain('set appName to item 1 of argv');
    expect(actionExecutorScriptsSource).toContain('tell application appName to activate');
    expect(actionExecutorActionsSource).toContain(
      'await runAppleScript(APPLESCRIPT_ACTIVATE_APP, [appName], {'
    );
  });
});
