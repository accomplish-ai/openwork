import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:os', () => ({
  homedir: vi.fn(),
  platform: vi.fn(),
}));

import { homedir, platform } from 'node:os';
import { getDaemonDir, getSocketPath, getPidFilePath } from '../../../src/daemon/socket-path.js';

const mockedHomedir = vi.mocked(homedir);
const mockedPlatform = vi.mocked(platform);

describe('socket-path', () => {
  beforeEach(() => {
    mockedHomedir.mockReturnValue('/home/testuser');
    mockedPlatform.mockReturnValue('linux');
  });

  describe('getDaemonDir', () => {
    it('returns ~/.accomplish', () => {
      mockedHomedir.mockReturnValue('/home/testuser');
      expect(getDaemonDir()).toBe('/home/testuser/.accomplish');
    });

    it('works with different home directories', () => {
      mockedHomedir.mockReturnValue('/Users/alice');
      expect(getDaemonDir()).toBe('/Users/alice/.accomplish');
    });
  });

  describe('getSocketPath', () => {
    it('returns ~/.accomplish/daemon.sock on non-Windows', () => {
      mockedPlatform.mockReturnValue('linux');
      mockedHomedir.mockReturnValue('/home/testuser');
      expect(getSocketPath()).toBe('/home/testuser/.accomplish/daemon.sock');
    });

    it('returns ~/.accomplish/daemon.sock on darwin', () => {
      mockedPlatform.mockReturnValue('darwin');
      mockedHomedir.mockReturnValue('/Users/testuser');
      expect(getSocketPath()).toBe('/Users/testuser/.accomplish/daemon.sock');
    });

    it('returns named pipe on Windows', () => {
      mockedPlatform.mockReturnValue('win32');
      expect(getSocketPath()).toBe('\\\\.\\pipe\\accomplish-daemon');
    });
  });

  describe('getPidFilePath', () => {
    it('returns ~/.accomplish/daemon.pid', () => {
      mockedHomedir.mockReturnValue('/home/testuser');
      expect(getPidFilePath()).toBe('/home/testuser/.accomplish/daemon.pid');
    });
  });
});
