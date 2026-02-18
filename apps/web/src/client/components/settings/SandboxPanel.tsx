'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import type { SandboxConfig, SandboxMode } from '@accomplish_ai/agent-core/common';

const DEFAULT_CONFIG: SandboxConfig = {
  mode: 'none',
  networkPolicy: {
    allowOutbound: true,
  },
};

export function SandboxPanel() {
  const [config, setConfig] = useState<SandboxConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const accomplish = getAccomplish();

  useEffect(() => {
    accomplish.getSandboxConfig().then((c) => {
      if (c) {
        setConfig(c);
      }
    });
  }, [accomplish]);

  // Check Docker availability on mount
  useEffect(() => {
    const checkDocker = async () => {
      try {
        // This is a best-effort check - the actual Docker availability
        // is validated when a task starts in sandbox mode
        setDockerAvailable(null); // Unknown until we can check
      } catch {
        setDockerAvailable(false);
      }
    };
    checkDocker();
  }, []);

  const saveConfig = useCallback(
    async (newConfig: SandboxConfig) => {
      setSaving(true);
      try {
        await accomplish.setSandboxConfig(newConfig);
        setConfig(newConfig);
      } finally {
        setSaving(false);
      }
    },
    [accomplish],
  );

  const handleModeChange = useCallback(
    async (mode: SandboxMode) => {
      await saveConfig({ ...config, mode });
    },
    [config, saveConfig],
  );

  const handleNetworkToggle = useCallback(async () => {
    await saveConfig({
      ...config,
      networkPolicy: {
        ...config.networkPolicy,
        allowOutbound: !config.networkPolicy.allowOutbound,
      },
    });
  }, [config, saveConfig]);

  const handleAllowedHostsChange = useCallback(
    async (hosts: string) => {
      const hostList = hosts
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean);
      await saveConfig({
        ...config,
        networkPolicy: {
          ...config.networkPolicy,
          allowedHosts: hostList.length > 0 ? hostList : undefined,
        },
      });
    },
    [config, saveConfig],
  );

  const handleAllowedPathsChange = useCallback(
    async (paths: string) => {
      const pathList = paths
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);
      await saveConfig({
        ...config,
        allowedPaths: pathList.length > 0 ? pathList : undefined,
      });
    },
    [config, saveConfig],
  );

  const handleDockerImageChange = useCallback(
    async (image: string) => {
      await saveConfig({
        ...config,
        dockerImage: image.trim() || undefined,
      });
    },
    [config, saveConfig],
  );

  return (
    <div className="space-y-4">
      {/* Sandbox Mode Selection */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="font-medium text-foreground">Sandbox Mode</div>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Control how the agent executes tasks. Docker mode isolates the agent in a container with
          restricted filesystem and network access.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="sandbox-mode"
              checked={config.mode === 'none'}
              onChange={() => handleModeChange('none')}
              className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
            />
            <div>
              <div className="text-sm font-medium text-foreground">No Sandbox (Default)</div>
              <p className="text-sm text-muted-foreground">
                Agent runs directly on your system with full access. Best for trusted tasks.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="sandbox-mode"
              checked={config.mode === 'docker'}
              onChange={() => handleModeChange('docker')}
              className="mt-1 h-4 w-4 rounded-full border-border text-primary focus:ring-primary/50"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Docker Sandbox</span>
                {dockerAvailable === false && (
                  <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                    Docker Not Found
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Agent runs inside a Docker container with isolated filesystem and configurable
                network access. Requires Docker to be installed and running.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Docker Settings (shown when Docker mode is selected) */}
      {config.mode === 'docker' && (
        <>
          {/* Docker Image */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Docker Image</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Custom Docker image to use for the sandbox. Leave empty to use the default image.
            </p>
            <input
              type="text"
              placeholder="accomplish/sandbox:latest (default)"
              value={config.dockerImage ?? ''}
              onChange={(e) => handleDockerImageChange(e.target.value)}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Network Policy */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Network Access</div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Control whether the sandboxed agent can make outbound network requests.
                </p>
              </div>
              <button
                onClick={handleNetworkToggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-accomplish ${
                  config.networkPolicy.allowOutbound ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-accomplish ${
                    config.networkPolicy.allowOutbound ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {config.networkPolicy.allowOutbound && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-foreground mb-1">
                  Allowed Hosts (optional)
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Restrict outbound access to specific hosts. One per line. Leave empty to allow
                  all.
                </p>
                <textarea
                  placeholder={'api.openai.com\napi.anthropic.com\ngithub.com'}
                  value={config.networkPolicy.allowedHosts?.join('\n') ?? ''}
                  onChange={(e) => handleAllowedHostsChange(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                />
              </div>
            )}

            {!config.networkPolicy.allowOutbound && (
              <div className="mt-3 rounded-lg bg-warning/10 p-3">
                <p className="text-sm text-warning">
                  Network access is disabled. The agent will not be able to reach external APIs,
                  which may prevent it from completing tasks that require network access.
                </p>
              </div>
            )}
          </div>

          {/* Filesystem Access */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Filesystem Access</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Specify which host directories the sandboxed agent can access. These paths will be
              mounted as volumes in the Docker container.
            </p>
            <textarea
              placeholder={'/Users/you/projects\n/tmp/accomplish-workspace'}
              value={config.allowedPaths?.join('\n') ?? ''}
              onChange={(e) => handleAllowedPathsChange(e.target.value)}
              rows={3}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              One path per line. The agent&apos;s working directory is always mounted.
            </p>
          </div>
        </>
      )}

      {/* Status indicator */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              config.mode === 'docker' ? 'bg-green-500' : 'bg-muted-foreground'
            }`}
          />
          <span className="text-muted-foreground">
            {config.mode === 'none'
              ? 'Sandbox is disabled — agent runs with full system access'
              : 'Docker sandbox enabled — agent runs in an isolated container'}
          </span>
        </div>
      </div>
    </div>
  );
}
