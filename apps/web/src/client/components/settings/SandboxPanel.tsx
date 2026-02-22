import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccomplish } from '@/lib/accomplish';
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
  const [configError, setConfigError] = useState<string | null>(null);
  const dockerImageRef = useRef<HTMLInputElement>(null);
  const hostsRef = useRef<HTMLTextAreaElement>(null);
  const pathsRef = useRef<HTMLTextAreaElement>(null);
  const accomplish = useAccomplish();

  useEffect(() => {
    accomplish
      .getSandboxConfig()
      .then((c) => {
        if (c) {
          setConfig(c);
        }
      })
      .catch((err) => {
        console.error('Failed to load sandbox config:', err);
      });
  }, [accomplish]);

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

  const handleAllowedHostsBlur = useCallback(() => {
    const hosts = hostsRef.current?.value ?? '';
    const hostList = hosts
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean);
    const newHosts = hostList.length > 0 ? hostList : undefined;
    const currentHosts = config.networkPolicy.allowedHosts;
    if (JSON.stringify(newHosts) !== JSON.stringify(currentHosts)) {
      saveConfig({
        ...config,
        networkPolicy: {
          ...config.networkPolicy,
          allowedHosts: newHosts,
        },
      });
    }
  }, [config, saveConfig]);

  const handleAllowedPathsBlur = useCallback(() => {
    const paths = pathsRef.current?.value ?? '';
    const pathList = paths
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    const newPaths = pathList.length > 0 ? pathList : undefined;
    if (JSON.stringify(newPaths) !== JSON.stringify(config.allowedPaths)) {
      saveConfig({
        ...config,
        allowedPaths: newPaths,
      });
    }
  }, [config, saveConfig]);

  const handleDockerImageBlur = useCallback(() => {
    const value = dockerImageRef.current?.value ?? '';
    const trimmed = value.trim() || undefined;
    if (trimmed) {
      const DOCKER_IMAGE_REGEX = /^[\w.-]+(\/[\w.-]+)*(:[\w.-]+)?$/;
      if (!DOCKER_IMAGE_REGEX.test(trimmed)) {
        setConfigError('Invalid Docker image name. Use format: name[:tag] or org/name[:tag]');
        return;
      }
    }
    setConfigError(null);
    if (trimmed !== config.dockerImage) {
      saveConfig({ ...config, dockerImage: trimmed });
    }
  }, [config, saveConfig]);

  return (
    <div className="space-y-4">
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
              <span className="text-sm font-medium text-foreground">Docker Sandbox</span>
              <p className="text-sm text-muted-foreground">
                Agent runs inside a Docker container with isolated filesystem and configurable
                network access. Requires Docker to be installed and running.
              </p>
            </div>
          </label>
        </div>
      </div>

      {config.mode === 'docker' && (
        <>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Docker Image</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Custom Docker image to use for the sandbox. Leave empty to use the default image.
            </p>
            <input
              ref={dockerImageRef}
              type="text"
              placeholder="node:20-slim (default)"
              defaultValue={config.dockerImage ?? ''}
              onBlur={handleDockerImageBlur}
              className={`mt-3 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                configError ? 'border-destructive' : 'border-border'
              }`}
            />
            {configError && <p className="mt-1.5 text-sm text-destructive">{configError}</p>}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-foreground">Network Access</div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  Control whether the sandboxed agent can make outbound network requests.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.networkPolicy.allowOutbound}
                aria-label="Toggle network access"
                onClick={handleNetworkToggle}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed ${
                  config.networkPolicy.allowOutbound ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
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
                  ref={hostsRef}
                  placeholder={'api.openai.com\napi.anthropic.com\ngithub.com'}
                  defaultValue={config.networkPolicy.allowedHosts?.join('\n') ?? ''}
                  onBlur={handleAllowedHostsBlur}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-mono"
                />
              </div>
            )}

            {!config.networkPolicy.allowOutbound && (
              <div className="mt-3 rounded-lg bg-warning/10 p-3" role="alert">
                <p className="text-sm text-warning">
                  Network access is disabled. The agent will not be able to reach external APIs,
                  which may prevent it from completing tasks that require network access.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="font-medium text-foreground">Filesystem Access</div>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Specify which host directories the sandboxed agent can access. These paths will be
              mounted as volumes in the Docker container.
            </p>
            <textarea
              ref={pathsRef}
              placeholder={'/Users/you/projects\n/tmp/accomplish-workspace'}
              defaultValue={config.allowedPaths?.join('\n') ?? ''}
              onBlur={handleAllowedPathsBlur}
              rows={3}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 font-mono"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              One path per line. The agent&apos;s working directory is always mounted.
            </p>
          </div>
        </>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
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
