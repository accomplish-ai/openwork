import React, { useState, useEffect } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Check, Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BrowserbaseConfig } from '@accomplish_ai/agent-core/common';

interface BrowserbaseFormProps {
  initialConfig?: Partial<BrowserbaseConfig>;
  onSave: () => void;
}

export function BrowserbaseForm({ initialConfig, onSave }: BrowserbaseFormProps) {
  const [projectId, setProjectId] = useState(initialConfig?.projectId || '');
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [region, setRegion] = useState(initialConfig?.region || 'us-west-2');
  const [showApiKey, setShowApiKey] = useState(false);

  const [status, setStatus] = useState<'idle' | 'validating' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setProjectId(initialConfig?.projectId || '');
    setApiKey(initialConfig?.apiKey || '');
    setRegion(initialConfig?.region || 'us-west-2');
  }, [initialConfig]);

  const handleChange = (field: 'apiKey' | 'projectId' | 'region', value: string) => {
    if (field === 'apiKey') setApiKey(value);
    if (field === 'projectId') setProjectId(value);
    if (field === 'region') setRegion(value);
    setIsDirty(true);
    if (status !== 'idle') {
      setStatus('idle');
      setMessage(null);
    }
  };

  const handleValidate = async () => {
    setStatus('validating');
    setMessage(null);
    try {
      if (!apiKey || !projectId) {
        throw new Error('API Key and Project ID are required');
      }

      const config: BrowserbaseConfig = { apiKey, projectId, region };
      await getAccomplish().validateCloudProvider('browserbase', config);

      setStatus('idle'); // Or a distinct 'validated' state if we want persistent green check
      setMessage('Connection validated successfully!');
      // Maybe auto-save on success? The user might prefer explicit save.
      // Let's just show success message.
    } catch (error) {
      console.error('Validation failed:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Validation failed');
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    setMessage(null);
    try {
      const config: BrowserbaseConfig = { apiKey, projectId, region };
      await getAccomplish().saveCloudProviderConfig('browserbase', config);
      onSave();
      setStatus('saved');
      setIsDirty(false);
      setTimeout(() => {
        if (status === 'saved') setStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Failed to save config:', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="projectId">Project ID</Label>
          <Input
            id="projectId"
            placeholder="bb-..."
            value={projectId}
            onChange={(e) => handleChange('projectId', e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Found in your Browserbase Project Settings.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <div className="relative">
            <Input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              placeholder="bb_..."
              value={apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="region">Region</Label>
          <Input
            id="region"
            placeholder="us-west-2"
            value={region}
            onChange={(e) => handleChange('region', e.target.value)}
          />
        </div>
      </div>

      {(message || status === 'error') && (
        <Alert
          variant={status === 'error' ? 'destructive' : 'default'}
          className={status !== 'error' ? 'border-green-500 text-green-600' : ''}
        >
          {status === 'error' ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <AlertTitle>{status === 'error' ? 'Error' : 'Success'}</AlertTitle>
          <AlertDescription>
            {message || (status === 'saved' ? 'Configuration saved successfully.' : '')}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleValidate}
          disabled={status === 'validating' || status === 'saving' || !apiKey || !projectId}
        >
          {status === 'validating' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            'Validate Connection'
          )}
        </Button>
        <Button
          onClick={handleSave}
          disabled={status === 'saving' || status === 'validating' || !isDirty}
        >
          {status === 'saving' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : status === 'saved' ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
