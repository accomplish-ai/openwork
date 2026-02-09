import path from 'path';
import fs from 'fs';
import type { ProviderId } from '../common/types/providerSettings.js';
import type { Skill } from '../common/types/skills.js';

export const ACCOMPLISH_AGENT_NAME = 'accomplish';

export interface ConfigGeneratorOptions {
  platform: NodeJS.Platform;
  mcpToolsPath: string;
  provider?: {
    id: ProviderId;
    model: string;
    baseUrl?: string;
  };
  apiKey?: string;
  skills?: Skill[];
  bundledNodeBinPath?: string;
  bundledTsxPath?: string;
  isPackaged: boolean;
  providerConfigs?: ProviderConfig[];
  azureFoundryToken?: string;
  permissionApiPort?: number;
  questionApiPort?: number;
  userDataPath: string;
  model?: string;
  smallModel?: string;
  enabledProviders?: string[];
}

export interface ProviderConfig {
  id: string;
  npm?: string;
  name?: string;
  options: Record<string, unknown>;
  models?: Record<string, ProviderModelConfig>;
}

export interface ProviderModelConfig {
  name: string;
  tools?: boolean;
  limit?: {
    context?: number;
    output?: number;
  };
  options?: Record<string, unknown>;
}

export interface GeneratedConfig {
  systemPrompt: string;
  mcpServers: Record<string, McpServerConfig>;
  environment: Record<string, string>;
  config: OpenCodeConfigFile;
  configPath: string;
}

interface McpServerConfig {
  type?: 'local' | 'remote';
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  timeout?: number;
}

interface AgentConfig {
  description?: string;
  prompt?: string;
  mode?: 'primary' | 'subagent' | 'all';
}

interface OpenCodeConfigFile {
  $schema?: string;
  model?: string;
  small_model?: string;
  default_agent?: string;
  enabled_providers?: string[];
  permission?: string | Record<string, string | Record<string, string>>;
  agent?: Record<string, AgentConfig>;
  mcp?: Record<string, McpServerConfig>;
  provider?: Record<string, Omit<ProviderConfig, 'id'>>;
  plugin?: string[];
}

function getPlatformEnvironmentInstructions(platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `<environment>
**You are running on Windows.** Use Windows-compatible commands:
- Use PowerShell syntax, not bash/Unix syntax
- Use \`$env:TEMP\` for temp directory (not /tmp)
- Use semicolon (;) for PATH separator (not colon)
- Use \`$env:VAR\` for environment variables (not $VAR)
</environment>`;
  } else {
    return `<environment>
You are running on ${platform === 'darwin' ? 'macOS' : 'Linux'}.
</environment>`;
  }
}

const ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE = `<role>
You are Accomplish, a desktop automation assistant. You help users with web research, browser automation, file management, and general tasks.
</role>

{{ENVIRONMENT_INSTRUCTIONS}}

<capabilities>
When users ask what you can do, mention:
- **Web Research**: Look up information, read articles, check prices, weather, scores, and more
- **Browser Automation**: Control a web browser to fill forms, click buttons, navigate sites, and handle multi-step workflows
- **File Management**: Sort, rename, move, and organize files based on content or rules
</capabilities>

<tool-selection>
Before calling ANY browser_* tool, you MUST confirm that WebFetch cannot handle the task. WebFetch is your default tool for anything involving web content.

**Decision gate - follow this every time:**
1. Do you have a URL, or can you construct one from your knowledge? -> Use WebFetch.
2. Is the task purely reading/extracting content from a web page? -> Use WebFetch.
3. Do you need to interact with a page (click, type, login, fill forms)? -> Use browser_* tools.
4. Do you need to search the web and you truly don't know which site has the answer? -> Use browser_* tools.
5. Not sure? -> Try WebFetch first. Fall back to browser only if WebFetch returns empty or useless content.

Even when the user does not provide a URL, you often know one. For stock prices, weather, sports scores, wiki lookups, documentation, news sites, and similar factual queries, construct the URL from your knowledge and use WebFetch directly.

**Simple (WebFetch):**
- "Check the Tesla stock price" -> WebFetch google.com/finance/quote/TSLA:NASDAQ. No browser needed.
- "What's the weather in Tokyo?" -> WebFetch wttr.in/Tokyo. No browser needed.
- "What does this article say? [url]" -> WebFetch the URL, summarize the content.
- "Get the headlines from nytimes.com" -> WebFetch nytimes.com, extract from the markdown.

**Complex (Browser):**
- "Log into my email and check for messages from Bob" -> Browser. Requires login and interaction.
- "Search for the best restaurants in Austin" -> Browser. Subjective query, need to browse and compare.
- "Fill out this application form at [url]" -> Browser. Form interaction, typing, file uploads.

**Hybrid (WebFetch + Browser):**
- "Find a banana bread recipe and save it to a file" -> Browser to search Google, find a recipe URL, then WebFetch that URL to grab clean content, save to file.
- "Compare pricing on two product pages" -> WebFetch both URLs first. Only open browser if a page is JS-rendered and WebFetch returns empty content.
</tool-selection>

<task-planning>
You MUST call \`start_task\` before any other tool. Other tools will fail until it is called.

start_task requires:
- original_request: Echo the user's request exactly as stated
- goal: What you aim to accomplish
- steps: Array of planned actions to achieve the goal
- verification: Array of how you will verify the task is complete
- skills: Array of relevant skill names from available skills (or empty [] if none apply)

As you work, call \`todowrite\` to update progress - mark completed steps as "completed" and the current step as "in_progress". All todos must be "completed" or "cancelled" before calling \`complete_task\`.
</task-planning>

<file-permissions>
Before ANY file operation (create, delete, rename, move, modify), call \`request_file_permission\` first and wait for the response. Only proceed if the response is "allowed". This applies to Write, Edit, Bash with file ops, and any tool that touches files.

request_file_permission takes:
- operation: "create" | "delete" | "rename" | "move" | "modify" | "overwrite"
- filePath: absolute path to the file
- targetPath: required for rename/move
- contentPreview: optional preview for create/modify/overwrite
</file-permissions>

<user-communication>
The user CANNOT see your text output or CLI prompts. To ask any question or get user input, you MUST use the \`AskUserQuestion\` MCP tool. Use it for genuine clarifications, not progress check-ins.
</user-communication>

<browser-guidelines>
When you do use the browser:
- NEVER use shell commands (open, xdg-open, start) to open URLs. These open the default browser, not the automation-controlled one. All browser operations must use browser_* MCP tools.
- Use \`browser_script\` for multi-step workflows - it runs multiple actions in one call and auto-returns page state.
- Use \`browser_batch_actions\` to extract data from multiple URLs in one call.
- Be descriptive about what you're doing: explain what you're clicking, what loaded, what you see.
- After each action, evaluate the result before deciding next steps.
</browser-guidelines>

<task-completion>
You MUST call \`complete_task\` to finish any task. Never stop without calling it.

- "success": You verified every part of the request is done. Re-read the original request as a checklist.
- "blocked": You hit a real technical blocker (login wall, CAPTCHA, rate limit, site error). Not for "the task is big." If the task is big but doable, keep working.
- "partial": Avoid this. Only use if forced to stop (context limit). You MUST fill in remaining_work with specific next steps.

If the user gave you a task with specific criteria, keep working until you meet them. Do not pause to ask "Should I keep going?"
</task-completion>
`;

function resolveBundledTsxCommand(mcpToolsPath: string, platform: NodeJS.Platform): string[] {
  const tsxBin = platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.join(mcpToolsPath, 'file-permission', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'ask-user-question', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'dev-browser-mcp', 'node_modules', '.bin', tsxBin),
    path.join(mcpToolsPath, 'complete-task', 'node_modules', '.bin', tsxBin),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log('[OpenCode Config] Using bundled tsx:', candidate);
      return [candidate];
    }
  }

  console.log('[OpenCode Config] Bundled tsx not found; falling back to npx tsx');
  return ['npx', 'tsx'];
}

function resolveMcpCommand(
  tsxCommand: string[],
  mcpToolsPath: string,
  mcpName: string,
  sourceRelPath: string,
  distRelPath: string,
  isPackaged: boolean,
  nodePath?: string
): string[] {
  const mcpDir = path.join(mcpToolsPath, mcpName);
  const distPath = path.join(mcpDir, distRelPath);

  if ((isPackaged || process.env.ACCOMPLISH_BUNDLED_MCP === '1') && fs.existsSync(distPath)) {
    const nodeExe = nodePath || 'node';
    console.log('[OpenCode Config] Using bundled MCP entry:', distPath);
    return [nodeExe, distPath];
  }

  const sourcePath = path.join(mcpDir, sourceRelPath);
  console.log('[OpenCode Config] Using tsx MCP entry:', sourcePath);
  return [...tsxCommand, sourcePath];
}

export function generateConfig(options: ConfigGeneratorOptions): GeneratedConfig {
  const {
    platform,
    mcpToolsPath,
    skills = [],
    isPackaged,
    bundledNodeBinPath,
    providerConfigs = [],
    permissionApiPort = 9226,
    questionApiPort = 9227,
    userDataPath,
    model,
    smallModel,
    enabledProviders: customEnabledProviders,
  } = options;

  const environmentInstructions = getPlatformEnvironmentInstructions(platform);
  let systemPrompt = ACCOMPLISH_SYSTEM_PROMPT_TEMPLATE
    .replace(/\{\{ENVIRONMENT_INSTRUCTIONS\}\}/g, environmentInstructions);

  if (skills.length > 0) {
    const skillsSection = `

<available-skills>
##############################################################################
# SKILLS - Include relevant ones in your start_task call
##############################################################################

Review these skills and include any relevant ones in your start_task call's \`skills\` array.
After calling start_task, you MUST read the SKILL.md file for each skill you listed.

**Available Skills:**

${skills.map(s => `- **${s.name}** (${s.command}): ${s.description}
  File: ${s.filePath}`).join('\n\n')}

Use empty array [] if no skills apply to your task.

##############################################################################
</available-skills>
`;
    systemPrompt += skillsSection;
  }

  const tsxCommand = resolveBundledTsxCommand(mcpToolsPath, platform);

  const nodePath = bundledNodeBinPath
    ? path.join(bundledNodeBinPath, platform === 'win32' ? 'node.exe' : 'node')
    : undefined;

  const mcpServers: Record<string, McpServerConfig> = {
    'file-permission': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'file-permission',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      environment: {
        PERMISSION_API_PORT: String(permissionApiPort),
      },
      timeout: 30000,
    },
    'ask-user-question': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'ask-user-question',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      environment: {
        QUESTION_API_PORT: String(questionApiPort),
      },
      timeout: 30000,
    },
    'dev-browser-mcp': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'dev-browser-mcp',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
    'complete-task': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'complete-task',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
    'start-task': {
      type: 'local',
      command: resolveMcpCommand(
        tsxCommand,
        mcpToolsPath,
        'start-task',
        'src/index.ts',
        'dist/index.mjs',
        isPackaged,
        nodePath
      ),
      enabled: true,
      timeout: 30000,
    },
  };

  const providerConfig: Record<string, Omit<ProviderConfig, 'id'>> = {};
  for (const provider of providerConfigs) {
    const { id, ...rest } = provider;
    providerConfig[id] = rest;
  }

  let enabledProviders: string[];
  if (customEnabledProviders) {
    enabledProviders = [...new Set([...customEnabledProviders, ...Object.keys(providerConfig)])];
  } else {
    const baseProviders = [
      'anthropic', 'openai', 'openrouter', 'google', 'xai',
      'deepseek', 'moonshot', 'zai-coding-plan', 'amazon-bedrock', 'minimax'
    ];
    enabledProviders = [...new Set([...baseProviders, ...Object.keys(providerConfig)])];
  }

  const config: OpenCodeConfigFile = {
    $schema: 'https://opencode.ai/config.json',
    ...(model && { model }),
    ...(smallModel && { small_model: smallModel }),
    default_agent: ACCOMPLISH_AGENT_NAME,
    enabled_providers: enabledProviders,
    permission: {
      '*': 'allow',
      todowrite: 'allow',
    },
    provider: Object.keys(providerConfig).length > 0 ? providerConfig : undefined,
    plugin: ['@tarquinen/opencode-dcp@^1.2.7'],
    agent: {
      [ACCOMPLISH_AGENT_NAME]: {
        description: 'Browser automation assistant using dev-browser',
        prompt: systemPrompt,
        mode: 'primary',
      },
    },
    mcp: mcpServers,
  };

  const configDir = path.join(userDataPath, 'opencode');
  const configPath = path.join(configDir, 'opencode.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configJson = JSON.stringify(config, null, 2);
  fs.writeFileSync(configPath, configJson);

  console.log('[OpenCode Config] Generated config at:', configPath);

  const environment: Record<string, string> = {
    OPENCODE_CONFIG: configPath,
    OPENCODE_CONFIG_DIR: configDir,
  };

  if (bundledNodeBinPath) {
    environment.NODE_BIN_PATH = bundledNodeBinPath;
  }

  return {
    systemPrompt,
    mcpServers,
    environment,
    config,
    configPath,
  };
}

export function getOpenCodeConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'opencode', 'opencode.json');
}

export interface BuildCliArgsOptions {
  prompt: string;
  sessionId?: string;
  selectedModel?: {
    provider: string;
    model: string;
  } | null;
}

export function buildCliArgs(options: BuildCliArgsOptions): string[] {
  const { prompt, sessionId, selectedModel } = options;

  const args: string[] = ['run'];

  // CRITICAL: JSON format required for StreamParser to parse messages
  args.push('--format', 'json');

  if (selectedModel?.model) {
    if (selectedModel.provider === 'zai') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `zai-coding-plan/${modelId}`);
    } else if (selectedModel.provider === 'deepseek') {
      const modelId = selectedModel.model.split('/').pop();
      args.push('--model', `deepseek/${modelId}`);
    } else if (selectedModel.provider === 'openrouter') {
      args.push('--model', selectedModel.model);
    } else if (selectedModel.provider === 'ollama') {
      const modelId = selectedModel.model.replace(/^ollama\//, '');
      args.push('--model', `ollama/${modelId}`);
    } else if (selectedModel.provider === 'litellm') {
      const modelId = selectedModel.model.replace(/^litellm\//, '');
      args.push('--model', `litellm/${modelId}`);
    } else if (selectedModel.provider === 'lmstudio') {
      const modelId = selectedModel.model.replace(/^lmstudio\//, '');
      args.push('--model', `lmstudio/${modelId}`);
    } else {
      args.push('--model', selectedModel.model);
    }
  }

  if (sessionId) {
    args.push('--session', sessionId);
  }

  args.push('--agent', ACCOMPLISH_AGENT_NAME);

  args.push(prompt);

  return args;
}
