import { useCallback, useEffect, useState } from 'react';
import type { CloudBrowserConfig, CloudBrowserCredentials } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';

// Constants
const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
const DEFAULT_REGION = 'us-east-1';

const DEFAULT_CONFIG: CloudBrowserConfig = {
  provider: 'aws-agentcore',
  enabled: false,
  region: DEFAULT_REGION,
  authMode: 'accessKeys',
  headless: true,
  connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
};

const DEFAULT_CREDS: CloudBrowserCredentials = {
  authMode: 'accessKeys',
};

export function CloudBrowsersPanel() {
  const accomplish = getAccomplish();
  const [config, setConfig] = useState<CloudBrowserConfig>(DEFAULT_CONFIG);
  const [credentials, setCredentials] = useState<CloudBrowserCredentials>(DEFAULT_CREDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await accomplish.getCloudBrowserSettings();
        if (!mounted) return;
        if (result.config) {
          setConfig({ ...DEFAULT_CONFIG, ...result.config });
        }
        if (result.credentials) {
          setCredentials({ ...DEFAULT_CREDS, ...result.credentials });
        }
      } catch (error) {
        if (mounted) {
          setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load cloud browser settings' });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [accomplish]);

  const onTest = useCallback(async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await accomplish.testCloudBrowserConnection(config, credentials);
      if (result.success) {
        setStatus({ type: 'success', message: 'Cloud browser connection succeeded.' });
      } else {
        setStatus({ type: 'error', message: result.error || 'Cloud browser connection failed' });
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Cloud browser connection failed' });
    } finally {
      setTesting(false);
    }
  }, [accomplish, config, credentials]);

  const onSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);
    try {
      await accomplish.setCloudBrowserSettings(config, credentials);
      setStatus({ type: 'success', message: 'Cloud browser settings saved.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save cloud browser settings' });
    } finally {
      setSaving(false);
    }
  }, [accomplish, config, credentials]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-sm text-muted-foreground">Loading cloud browser settings...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <div className="font-medium text-foreground">AWS AgentCore Browser Tool</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Accomplish browser automation to an AWS-hosted browser via CDP.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Cloud Browser</p>
          <p className="text-xs text-muted-foreground">When enabled, tasks use AWS AgentCore remote browser mode.</p>
        </div>
        <button
          onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${config.enabled ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Region</span>
          <input
            value={config.region}
            onChange={(e) => setConfig(prev => ({ ...prev, region: e.target.value }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="us-east-1"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Auth Mode</span>
          <select
            value={config.authMode}
            onChange={(e) => {
              const authMode = e.target.value as CloudBrowserConfig['authMode'];
              setConfig(prev => ({ ...prev, authMode }));
              setCredentials(prev => ({ ...prev, authMode }));
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="accessKeys">Access Keys</option>
            <option value="profile">AWS Profile</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">AgentCore API URL (optional)</span>
          <input
            value={config.agentCoreApiUrl || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, agentCoreApiUrl: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="https://agentcore.example.com"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Direct CDP Endpoint (optional)</span>
          <input
            value={config.cdpEndpoint || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, cdpEndpoint: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="wss://... or https://..."
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Workspace ID (optional)</span>
          <input
            value={config.workspaceId || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, workspaceId: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Browser Pool ID (optional)</span>
          <input
            value={config.browserPoolId || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, browserPoolId: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">CDP Secret (optional)</span>
          <input
            type="password"
            value={config.cdpSecret || ''}
            onChange={(e) => setConfig(prev => ({ ...prev, cdpSecret: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {config.authMode === 'accessKeys' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Access Key ID</span>
            <input
              value={credentials.accessKeyId || ''}
              onChange={(e) => setCredentials(prev => ({ ...prev, accessKeyId: e.target.value || undefined }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Secret Access Key</span>
            <input
              type="password"
              value={credentials.secretAccessKey || ''}
              onChange={(e) => setCredentials(prev => ({ ...prev, secretAccessKey: e.target.value || undefined }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Session Token (optional)</span>
            <input
              type="password"
              value={credentials.sessionToken || ''}
              onChange={(e) => setCredentials(prev => ({ ...prev, sessionToken: e.target.value || undefined }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
      ) : (
        <label className="text-sm block">
          <span className="mb-1 block text-muted-foreground">AWS Profile</span>
          <input
            value={credentials.profileName || ''}
            onChange={(e) => setCredentials(prev => ({ ...prev, profileName: e.target.value || undefined }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="default"
          />
        </label>
      )}

      {status && (
        <div className={`rounded-md border p-3 text-sm ${
          status.type === 'success'
            ? 'border-green-500/40 bg-green-500/10 text-green-400'
            : 'border-destructive/40 bg-destructive/10 text-destructive'
        }`}>
          {status.message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onTest}
          disabled={testing}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

