import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const actionExecutorPath = path.resolve(currentDir, '../../../skills/action-executor/src/index.ts');
const actionExecutorSource = readFileSync(actionExecutorPath, 'utf8');

describe('Action Executor Security Regression', () => {
  it('routes type_text input through AppleScript argv instead of inline interpolation', () => {
    expect(actionExecutorSource).toContain(
      'tell application "System Events" to keystroke (item 1 of argv)'
    );
    expect(actionExecutorSource).toContain(
      "await runAppleScript(APPLESCRIPT_TYPE_TEXT, [text],"
    );
    expect(actionExecutorSource).not.toMatch(/keystroke\s+\$\{/);
  });

  it('routes move_mouse coordinates through Python argv values', () => {
    expect(actionExecutorSource).toContain('target_x = float(sys.argv[1])');
    expect(actionExecutorSource).toContain('target_y = float(sys.argv[2])');
    expect(actionExecutorSource).toContain('const calibrated = applyPointerCalibration(x, y);');
    expect(actionExecutorSource).toContain(
      'await runPythonScript(PYTHON_MOVE_MOUSE_SCRIPT, [String(calibrated.x), String(calibrated.y)], {'
    );
  });

  it('moves pointer before click actions so movement is visible', () => {
    const moveCalls = actionExecutorSource.match(/await moveMouse\(x, y\);/g) ?? [];
    expect(moveCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('uses execFile argument arrays for subprocess execution', () => {
    expect(actionExecutorSource).toContain('await execFileAsync(command, args, {');
    expect(actionExecutorSource).toMatch(
      /await runExecutable\('osascript', \[\.\.\.args, (?:'--', )?\.\.\.scriptArgs\], context\);/
    );
    expect(actionExecutorSource).toContain("await runExecutable('python3', ['-c', script, ...scriptArgs], context);");
    expect(actionExecutorSource).not.toMatch(/\bexec\(/);
  });

  it('routes activate_app target via AppleScript argv without string interpolation', () => {
    expect(actionExecutorSource).toContain('set appName to item 1 of argv');
    expect(actionExecutorSource).toContain('tell application appName to activate');
    expect(actionExecutorSource).toContain('await runAppleScript(APPLESCRIPT_ACTIVATE_APP, [appName], {');
  });
});
