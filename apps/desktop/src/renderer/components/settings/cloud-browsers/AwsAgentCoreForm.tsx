import { useState } from 'react';
import { AwsAgentCoreConfig } from '@accomplish_ai/agent-core/common';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Props for the AwsAgentCoreForm component.
 */
interface AwsAgentCoreFormProps {
  config?: Omit<AwsAgentCoreConfig, 'accessKeyId' | 'secretAccessKey'>;
  onChange: (config: Omit<AwsAgentCoreConfig, 'accessKeyId' | 'secretAccessKey'>) => void;
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
  // Local state for secrets to prevent persistence
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');

  const handleChange = (field: keyof Omit<AwsAgentCoreConfig, 'accessKeyId' | 'secretAccessKey'>, value: string) => {
    onChange({
      ...config,
      region: config?.region || '',
      [field]: value,
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!config?.region) {
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Merge persisted config with local secrets for testing
      const testConfig: AwsAgentCoreConfig = {
        ...config,
        accessKeyId: accessKeyId || undefined,
        secretAccessKey: secretAccessKey || undefined,
      };
      const success = await onTestConnection(testConfig);
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
        <Label>AWS Region</Label>
        <Input
          type="text"
          value={config?.region || ''}
          onChange={(e) => handleChange('region', e.target.value)}
          placeholder="us-west-2"
        />
      </div>

      <div className="grid gap-2">
        <Label>Profile Name (Optional)</Label>
        <Input
          type="text"
          value={config?.profile || ''}
          onChange={(e) => handleChange('profile', e.target.value)}
          placeholder="default"
        />
        <p className="text-xs text-muted-foreground">
          Use a named profile from your ~/.aws/credentials file.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Access Key ID (Optional)</Label>
        <Input
          type="password"
            value={accessKeyId}
            onChange={(e) => {
            setAccessKeyId(e.target.value);
            setTestResult(null);
            }}
          placeholder="AKIA..."
        />
        <p className="text-xs text-muted-foreground">
            Keys are used for testing connection only and are not saved.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Secret Access Key (Optional)</Label>
        <Input
          type="password"
            value={secretAccessKey}
            onChange={(e) => {
            setSecretAccessKey(e.target.value);
            setTestResult(null);
            }}
          placeholder="wJalr..."
        />
      </div>

      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !config?.region}
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
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
