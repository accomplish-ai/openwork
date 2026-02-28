import { describe, expect, it } from 'vitest';

import { collectTextInputCandidates } from '../../../skills/screen-capture/src/text-inputs';
import type { DesktopContextWindow } from '../../../skills/screen-capture/src/types';

describe('Codex composer click point targeting', () => {
  it('biases Codex bottom composers slightly below the geometric center', () => {
    const window: DesktopContextWindow = {
      id: 1,
      appName: 'Codex',
      pid: 111,
      title: 'New thread',
      bounds: { x: 490, y: 44, width: 1336, height: 1112 },
      zOrder: 10,
      isOnScreen: true,
      isMinimized: false,
      isVisible: true,
      isFrontmostApp: true,
      appIsHidden: false,
      layer: 0,
    };

    const tree = {
      role: 'AXWindow',
      children: [
        {
          role: 'AXTextArea',
          title: 'Ask Codex anything',
          description: 'chat composer',
          focused: false,
          enabled: true,
          frame: { x: 642, y: 969, width: 840, height: 132 },
          children: [],
        },
      ],
    };

    const [candidate] = collectTextInputCandidates(tree, window);

    expect(candidate).toBeDefined();
    expect(candidate.reasons).toContain('codex-bottom-composer-shape');
    expect(candidate.clickPoint.x).toBe(1062);
    expect(candidate.clickPoint.y).toBe(1048);
    expect(candidate.clickPoint.y).toBeGreaterThan(1035);
  });

  it('keeps non-composer text fields centered', () => {
    const window: DesktopContextWindow = {
      id: 2,
      appName: 'Terminal',
      pid: 222,
      title: 'Terminal',
      bounds: { x: 100, y: 80, width: 1000, height: 700 },
      zOrder: 5,
      isOnScreen: true,
      isMinimized: false,
      isVisible: true,
      isFrontmostApp: true,
      appIsHidden: false,
      layer: 0,
    };

    const tree = {
      role: 'AXWindow',
      children: [
        {
          role: 'AXTextField',
          title: 'Search',
          description: '',
          focused: false,
          enabled: true,
          frame: { x: 200, y: 180, width: 300, height: 40 },
          children: [],
        },
      ],
    };

    const [candidate] = collectTextInputCandidates(tree, window);

    expect(candidate).toBeDefined();
    expect(candidate.reasons).not.toContain('codex-bottom-composer-shape');
    expect(candidate.clickPoint).toEqual({ x: 350, y: 200 });
  });
});
