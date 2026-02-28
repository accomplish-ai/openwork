import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const screenCapturePath = path.resolve(currentDir, '../../../skills/screen-capture/src/index.ts');
const configGeneratorPath = path.resolve(currentDir, '../../../src/main/opencode/config-generator.ts');
const desktopContextHelperPath = path.resolve(currentDir, '../../../native/desktop-context-helper.swift');

const screenCaptureSource = readFileSync(screenCapturePath, 'utf8');
const configGeneratorSource = readFileSync(configGeneratorPath, 'utf8');
const desktopContextHelperSource = readFileSync(desktopContextHelperPath, 'utf8');

describe('Composer Targeting Reliability', () => {
  it('exposes find_text_inputs tool with click-safe output guidance', () => {
    expect(screenCaptureSource).toContain("name: 'find_text_inputs'");
    expect(screenCaptureSource).toContain('recommended.clickPoint');
    expect(screenCaptureSource).toContain('collectTextInputCandidates');
  });

  it('system prompt requires accessibility-driven composer targeting before send', () => {
    expect(configGeneratorSource).toContain('find_text_inputs');
    expect(configGeneratorSource).toContain('/Users/hareli/Projects/openwork/docs/codex-desktop-map.md');
    expect(configGeneratorSource).toContain('Run list_windows, select the visible Codex window');
    expect(configGeneratorSource).toContain('lower-middle interior of the composer body');
    expect(configGeneratorSource).toContain('The send button is the circular up-arrow at the far-right end of the composer');
    expect(configGeneratorSource).toContain('button area often turns darker/gray');
    expect(configGeneratorSource).toContain('left sidebar = roughly x 0% to 24% of the window width');
    expect(configGeneratorSource).toContain('Button meaning quick map');
    expect(configGeneratorSource).toContain('Continue this verify-and-correct loop until send is verified');
    expect(configGeneratorSource).toContain('up to 90 seconds total for the full send attempt');
    expect(configGeneratorSource).toContain('Do not stop the turn after a miss while the retry budget remains');
  });

  it('desktop context helper uses scored matching for inspect_window', () => {
    expect(desktopContextHelperSource).toContain('scoreWindowMatch(');
    expect(desktopContextHelperSource).toContain('var bestScore = Int.min');
    expect(desktopContextHelperSource).not.toContain("AX doesn't directly give us CGWindowID, so we'll use the first window");
  });
});
