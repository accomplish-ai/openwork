import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/cli.js';

describe('Daemon index', () => {
  describe('parseArgs', () => {
    it('should extract --socket-path', () => {
      const result = parseArgs(['--socket-path', '/tmp/daemon.sock']);
      expect(result.socketPath).toBe('/tmp/daemon.sock');
    });

    it('should extract --data-dir', () => {
      const result = parseArgs(['--data-dir', '/custom/data']);
      expect(result.dataDir).toBe('/custom/data');
    });

    it('should extract --version', () => {
      const result = parseArgs(['--version']);
      expect(result.version).toBe(true);
    });

    it('should handle all args together', () => {
      const result = parseArgs([
        '--socket-path', '/tmp/test.sock',
        '--data-dir', '/data',
        '--version',
      ]);
      expect(result.socketPath).toBe('/tmp/test.sock');
      expect(result.dataDir).toBe('/data');
      expect(result.version).toBe(true);
    });

    it('should return empty object for no args', () => {
      const result = parseArgs([]);
      expect(result).toEqual({});
    });

    it('should ignore --socket-path without value', () => {
      const result = parseArgs(['--socket-path']);
      expect(result.socketPath).toBeUndefined();
    });

    it('should ignore --data-dir without value', () => {
      const result = parseArgs(['--data-dir']);
      expect(result.dataDir).toBeUndefined();
    });

    it('should ignore unknown arguments', () => {
      const result = parseArgs(['--unknown', 'value']);
      expect(result).toEqual({});
    });
  });
});
