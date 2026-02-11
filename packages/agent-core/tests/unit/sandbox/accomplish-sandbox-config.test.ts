import { describe, it, expect } from 'vitest';
import { buildAccomplishSandboxConfig } from '../../../src/sandbox/accomplish-sandbox-config.js';

describe('buildAccomplishSandboxConfig', () => {
  it('should return a valid config with defaults', () => {
    const config = buildAccomplishSandboxConfig();

    expect(config.network.allowedDomains).toContain('api.anthropic.com');
    expect(config.network.allowedDomains).toContain('api.openai.com');
    expect(config.network.allowedDomains).toContain('github.com');
    expect(config.network.deniedDomains).toEqual([]);
    expect(config.network.allowAllUnixSockets).toBe(true);
    expect(config.network.allowLocalBinding).toBe(true);
    expect(config.allowPty).toBe(true);
    expect(config.filesystem.allowWrite.length).toBeGreaterThan(0);
  });

  it('should include working directory in allowWrite', () => {
    const config = buildAccomplishSandboxConfig({
      workingDirectory: '/my/project',
    });

    expect(config.filesystem.allowWrite).toContain('/my/project');
  });

  it('should merge additional allowed domains', () => {
    const config = buildAccomplishSandboxConfig({
      additionalAllowedDomains: ['custom-api.example.com'],
    });

    expect(config.network.allowedDomains).toContain('custom-api.example.com');
    expect(config.network.allowedDomains).toContain('api.anthropic.com');
  });

  it('should merge additional write paths', () => {
    const config = buildAccomplishSandboxConfig({
      additionalAllowWrite: ['/extra/path'],
    });

    expect(config.filesystem.allowWrite).toContain('/extra/path');
  });

  it('should include deny read paths', () => {
    const config = buildAccomplishSandboxConfig({
      additionalDenyRead: ['/secret/dir'],
    });

    expect(config.filesystem.denyRead).toContain('/secret/dir');
  });

  it('should include deny write paths for sensitive config files', () => {
    const config = buildAccomplishSandboxConfig();

    expect(config.filesystem.denyWrite).toContain('~/.claude/settings.json');
    expect(config.filesystem.denyWrite).toContain('.git/hooks');
  });

  it('should respect allowPty override', () => {
    const config = buildAccomplishSandboxConfig({ allowPty: false });
    expect(config.allowPty).toBe(false);
  });

  it('should respect enableWeakerNestedSandbox', () => {
    const config = buildAccomplishSandboxConfig({
      enableWeakerNestedSandbox: true,
    });
    expect(config.enableWeakerNestedSandbox).toBe(true);
  });
});
