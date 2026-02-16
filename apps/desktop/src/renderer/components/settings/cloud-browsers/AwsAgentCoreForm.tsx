import { useState } from 'react';
import { AwsAgentCoreConfig } from '@accomplish_ai/agent-core/common';

/**
 * Props for the AwsAgentCoreForm component.
 */
interface AwsAgentCoreFormProps {
  config?: AwsAgentCoreConfig;
  onChange: (config: AwsAgentCoreConfig) => void;
  onTestConnection: (config: AwsAgentCoreConfig) => Promise<boolean>;
}

/**
 * Render a form for editing an AwsAgentCoreConfig and testing AWS credentials.
 *
 * @param config - Optional initial AWS agent core configuration values to populate the form
 * @param onChange - Called with the updated configuration whenever a form field changes
 * @param onTestConnection - Called with the current configuration to verify credentials; should resolve to `true` on successful connection and `false` otherwise
 * @returns The rendered form UI for configuring AWS AgentCore credentials and initiating a connection test
 */
export function AwsAgentCoreForm({ config, onChange, onTestConnection }: AwsAgentCoreFormProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleChange = (field: keyof AwsAgentCoreConfig, value: string) => {
    onChange({
      ...config,
      region: config?.region || '',
      [field]: value,
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!config) {
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const success = await onTestConnection(config);
      setTestResult(success ? 'success' : 'error');
    } catch (e) {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium">AWS Region</label>
        <input
          type="text"
          value={config?.region || ''}
          onChange={(e) => handleChange('region', e.target.value)}
          placeholder="us-west-2"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Profile Name (Optional)</label>
        <input
          type="text"
          value={config?.profile || ''}
          onChange={(e) => handleChange('profile', e.target.value)}
          placeholder="default"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Use a named profile from your ~/.aws/credentials file.
        </p>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Access Key ID (Optional)</label>
        <input
          type="password"
          value={config?.accessKeyId || ''}
          onChange={(e) => handleChange('accessKeyId', e.target.value)}
          placeholder="AKIA..."
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">Secret Access Key (Optional)</label>
        <input
          type="password"
          value={config?.secretAccessKey || ''}
          onChange={(e) => handleChange('secretAccessKey', e.target.value)}
          placeholder="wJalr..."
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleTest}
          disabled={testing || !config?.region}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        {testResult === 'success' && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Connected
          </span>
        )}
        {testResult === 'error' && (
          <span className="text-sm text-red-600 flex items-center gap-1">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Failed
          </span>
        )}
      </div>
    </div>
  );
}