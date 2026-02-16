import { AwsAgentCoreForm } from './AwsAgentCoreForm';
import { AwsAgentCoreConfig } from '@accomplish_ai/agent-core/common';
import { getAccomplish } from '@/lib/accomplish';

  import { useSettingsStore } from '@/stores/settingsStore';

  /**
 * Render the Cloud Browsers settings panel for selecting and configuring cloud browser providers.
 *
 * Displays a provider switcher between AWS AgentCore and Browserbase; when AWS is selected,
 * shows the AWS AgentCore configuration form and a control to test the AWS connection.
 *
 * @returns The rendered settings panel as a JSX element
 */
  export function CloudBrowsersSettings() {
    const { selectedProvider, awsConfig } = useSettingsStore((state) => state.cloudBrowsers);
    const setCloudBrowserProvider = useSettingsStore((state) => state.setCloudBrowserProvider);
    const setAwsConfig = useSettingsStore((state) => state.setAwsConfig);

  const handleTestAws = async (config: AwsAgentCoreConfig) => {
    console.log('Testing AWS connection:', {
      region: config.region,
      profile: config.profile,
    });
    return getAccomplish().testCloudBrowserConnection(config);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-medium mb-4">Cloud Browsers</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure remote browser environments for tasks that require cloud infrastructure.
        </p>

        <div className="flex gap-4 mb-6 border-b border-border pb-4">
           <button
            onClick={() => setCloudBrowserProvider('aws')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedProvider === 'aws'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            AWS AgentCore
          </button>
           <button
            onClick={() => setCloudBrowserProvider('browserbase')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedProvider === 'browserbase'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Browserbase
          </button>
        </div>

        {selectedProvider === 'aws' && (
          <div className="space-y-4">
             <div className="bg-muted/50 p-4 rounded-md mb-4">
              <h3 className="font-medium text-sm mb-2">AWS AgentCore Configuration</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Run browser tasks using AWS Bedrock Agents. Requires an AWS account.
              </p>
              <AwsAgentCoreForm 
                config={awsConfig} 
                onChange={setAwsConfig}
                onTestConnection={handleTestAws}
              />
            </div>
          </div>
        )}

        {selectedProvider === 'browserbase' && (
          <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
            Browserbase integration coming soon (See Issue #396).
          </div>
        )}
      </div>
    </div>
  );
}