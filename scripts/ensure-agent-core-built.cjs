const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const agentCoreDir = path.join(rootDir, 'packages', 'agent-core');
const agentCorePackageJsonPath = path.join(agentCoreDir, 'package.json');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const mcpDistOutputs = [
  'mcp-tools/file-permission/dist/index.mjs',
  'mcp-tools/ask-user-question/dist/index.mjs',
  'mcp-tools/complete-task/dist/index.mjs',
  'mcp-tools/start-task/dist/index.mjs',
  'mcp-tools/dev-browser-mcp/dist/index.mjs',
  'mcp-tools/dev-browser/dist/start-server.mjs',
  'mcp-tools/dev-browser/dist/start-relay.mjs',
];

function addOutputPath(outputs, value) {
  if (typeof value !== 'string' || !value.startsWith('./')) {
    return;
  }
  outputs.add(value.slice(2));
}

function collectOutputPaths(entry, outputs) {
  if (typeof entry === 'string') {
    addOutputPath(outputs, entry);
    return;
  }

  if (!entry || typeof entry !== 'object') {
    return;
  }

  for (const value of Object.values(entry)) {
    collectOutputPaths(value, outputs);
  }
}

function runPnpm(args, description) {
  console.log(description);
  const result = spawnSync(pnpmCommand, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Failed to run pnpm for "${description}":`, result.error.message);
    process.exit(1);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

const pkg = JSON.parse(fs.readFileSync(agentCorePackageJsonPath, 'utf8'));
const outputPaths = new Set();

addOutputPath(outputPaths, pkg.main);
addOutputPath(outputPaths, pkg.module);
addOutputPath(outputPaths, pkg.types);
collectOutputPaths(pkg.exports, outputPaths);

let missingOutputs = [...outputPaths].filter(
  (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
);

if (missingOutputs.length > 0) {
  console.log('Missing @accomplish_ai/agent-core build outputs:');
  for (const missingOutput of missingOutputs) {
    console.log(`  - ${missingOutput}`);
  }
  runPnpm(['-F', '@accomplish_ai/agent-core', 'build'], 'Building @accomplish_ai/agent-core...');

  missingOutputs = [...outputPaths].filter(
    (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
  );
  if (missingOutputs.length > 0) {
    console.error('Failed to produce required @accomplish_ai/agent-core outputs:');
    for (const missingOutput of missingOutputs) {
      console.error(`  - ${missingOutput}`);
    }
    process.exit(1);
  }
}

let missingMcpDistOutputs = mcpDistOutputs.filter(
  (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
);
if (missingMcpDistOutputs.length > 0) {
  console.log('Missing MCP dist outputs:');
  for (const missingOutput of missingMcpDistOutputs) {
    console.log(`  - ${missingOutput}`);
  }
  runPnpm(
    ['-F', '@accomplish/desktop', 'build:mcp-tools:dev'],
    'Building MCP dist artifacts for dev...',
  );

  missingMcpDistOutputs = mcpDistOutputs.filter(
    (relativeOutputPath) => !fs.existsSync(path.join(agentCoreDir, relativeOutputPath)),
  );
  if (missingMcpDistOutputs.length > 0) {
    console.error('Failed to produce required MCP dist outputs:');
    for (const missingOutput of missingMcpDistOutputs) {
      console.error(`  - ${missingOutput}`);
    }
    process.exit(1);
  }
}

console.log('✓ @accomplish_ai/agent-core and MCP dist outputs found');
process.exit(0);
