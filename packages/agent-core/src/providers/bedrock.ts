import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import { fromIni } from '@aws-sdk/credential-providers';
import type { BedrockCredentials } from '../common/types/auth.js';
import { safeParseJson } from '../utils/json.js';
import type { ValidationResult } from './validation.js';

/**
 * Validates AWS Bedrock credentials by making a test API call.
 * Supports three authentication types:
 * - API Key (bearer token)
 * - Access Keys (accessKeyId + secretAccessKey)
 * - IAM Profile (uses fromIni)
 *
 * @param credentialsJson - JSON string containing BedrockCredentials
 * @returns ValidationResult indicating if credentials are valid
 */
export async function validateBedrockCredentials(
  credentialsJson: string,
): Promise<ValidationResult> {
  const parseResult = safeParseJson<BedrockCredentials>(credentialsJson);
  if (!parseResult.success) {
    return { valid: false, error: 'Failed to parse credentials' };
  }

  const parsed = parseResult.data;
  const region = parsed.region?.trim();
  if (!region) {
    return { valid: false, error: 'AWS region is required' };
  }
  let client: BedrockClient;
  let cleanupEnv: (() => void) | null = null;

  if (parsed.authType === 'apiKey') {
    const originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    process.env.AWS_BEARER_TOKEN_BEDROCK = parsed.apiKey;
    cleanupEnv = () => {
      if (originalToken !== undefined) {
        process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
      } else {
        delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      }
    };
    client = new BedrockClient({
      region,
    });
  } else if (parsed.authType === 'accessKeys') {
    if (!parsed.accessKeyId || !parsed.secretAccessKey) {
      return { valid: false, error: 'Access Key ID and Secret Access Key are required' };
    }
    const awsCredentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } =
      {
        accessKeyId: parsed.accessKeyId,
        secretAccessKey: parsed.secretAccessKey,
      };
    if (parsed.sessionToken) {
      awsCredentials.sessionToken = parsed.sessionToken;
    }
    client = new BedrockClient({
      region,
      credentials: awsCredentials,
    });
  } else if (parsed.authType === 'profile') {
    const profileName = parsed.profileName?.trim();
    if (!profileName) {
      return { valid: false, error: 'AWS profile name is required for profile authentication' };
    }
    client = new BedrockClient({
      region,
      credentials: fromIni({ profile: profileName }),
    });
  } else {
    return { valid: false, error: 'Invalid authentication type' };
  }

  try {
    const command = new ListFoundationModelsCommand({});
    await client.send(command);

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Validation failed';

    if (
      message.includes('UnrecognizedClientException') ||
      message.includes('InvalidSignatureException')
    ) {
      return {
        valid: false,
        error: 'Invalid AWS credentials. Please check your Access Key ID and Secret Access Key.',
      };
    }
    if (message.includes('AccessDeniedException')) {
      return {
        valid: false,
        error: 'Access denied. Ensure your AWS credentials have Bedrock permissions.',
      };
    }
    if (message.includes('could not be found')) {
      return { valid: false, error: 'AWS profile not found. Check your ~/.aws/credentials file.' };
    }
    if (message.includes('InvalidBearerTokenException') || message.includes('bearer token')) {
      return {
        valid: false,
        error: 'Invalid Bedrock API key. Please check your API key and try again.',
      };
    }

    return { valid: false, error: message };
  } finally {
    cleanupEnv?.();
  }
}

export interface BedrockModel {
  id: string;
  name: string;
  provider: string;
}

export interface FetchBedrockModelsResult {
  success: boolean;
  models: BedrockModel[];
  error?: string;
}

/**
 * Fetches available foundation models from AWS Bedrock.
 *
 * Creates a BedrockClient based on the authentication type (apiKey, accessKeys, or profile),
 * fetches models, filters for TEXT output modality, and returns a formatted list.
 *
 * @param credentials - The Bedrock credentials (apiKey, accessKeys, or profile based)
 * @returns Object with success status, models array, and optional error message
 */
export async function fetchBedrockModels(
  credentials: BedrockCredentials,
): Promise<FetchBedrockModelsResult> {
  let bedrockClient: BedrockClient;
  let originalToken: string | undefined;
  const region = credentials.region?.trim();

  if (!region) {
    return { success: false, error: 'AWS region is required', models: [] };
  }

  try {
    if (credentials.authType === 'apiKey') {
      originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
      process.env.AWS_BEARER_TOKEN_BEDROCK = credentials.apiKey;
      bedrockClient = new BedrockClient({
        region,
      });
    } else if (credentials.authType === 'accessKeys') {
      bedrockClient = new BedrockClient({
        region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });
    } else {
      const profileName = credentials.profileName?.trim();
      if (!profileName) {
        return {
          success: false,
          error: 'AWS profile name is required for profile authentication',
          models: [],
        };
      }
      bedrockClient = new BedrockClient({
        region,
        credentials: fromIni({ profile: profileName }),
      });
    }

    try {
      const command = new ListFoundationModelsCommand({});
      const response = await bedrockClient.send(command);

      const models = (response.modelSummaries || [])
        .filter((m) => m.outputModalities?.includes('TEXT'))
        .map((m) => ({
          id: `amazon-bedrock/${m.modelId}`,
          name: m.modelId || 'Unknown',
          provider: m.providerName || 'Unknown',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, models };
    } finally {
      if (credentials.authType === 'apiKey') {
        if (originalToken !== undefined) {
          process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
        } else {
          delete process.env.AWS_BEARER_TOKEN_BEDROCK;
        }
      }
    }
  } catch (error) {
    console.error('[Bedrock] Failed to fetch models:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage, models: [] };
  }
}
