/**
 * Multi-agent configuration utilities
 *
 * AGENT_ID environment variable enables running multiple app instances locally.
 * Each agent gets isolated ports and storage directories.
 *
 * Port formula: base_port + (AGENT_ID - 1) * 10
 *   Agent 1: 5173, 9224, 9225, 9226 (default)
 *   Agent 2: 5183, 9234, 9235, 9236
 *   Agent 3: 5193, 9244, 9245, 9246
 */

function parseAgentId(): number {
  const envValue = process.env.AGENT_ID;
  if (!envValue) return 1;
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

const agentId = parseAgentId();

/**
 * Get the current agent ID (1-based)
 */
export function getAgentId(): number {
  return agentId;
}

/**
 * Get the port offset for this agent
 * Formula: (agentId - 1) * 10
 */
export function getPortOffset(): number {
  return (agentId - 1) * 10;
}

/**
 * Get suffix for store names and directories
 * Returns empty string for agent 1 (backward compatible)
 */
export function getAgentSuffix(): string {
  return agentId > 1 ? `-agent-${agentId}` : '';
}

/**
 * Check if running in multi-agent mode (AGENT_ID > 1)
 */
export function isMultiAgentMode(): boolean {
  return agentId > 1;
}
