// Filesystem restriction configs (internal structures built from permission rules)

/**
 * Read restriction config using a "deny-only" pattern.
 *
 * Semantics:
 * - `undefined` = no restrictions (allow all reads)
 * - `{denyOnly: []}` = no restrictions (empty deny list = allow all reads)
 * - `{denyOnly: [...paths]}` = deny reads from these paths, allow all others
 *
 * This is maximally permissive by default - only explicitly denied paths are blocked.
 */
export interface FsReadRestrictionConfig {
  denyOnly: string[]
}

/**
 * Write restriction config using an "allow-only" pattern.
 *
 * Semantics:
 * - `undefined` = no restrictions (allow all writes)
 * - `{allowOnly: [], denyWithinAllow: []}` = maximally restrictive (deny ALL writes)
 * - `{allowOnly: [...paths], denyWithinAllow: [...]}` = allow writes only to these paths,
 *   with exceptions for denyWithinAllow
 *
 * This is maximally restrictive by default - only explicitly allowed paths are writable.
 * Note: Empty `allowOnly` means NO paths are writable (unlike read's empty denyOnly).
 */
export interface FsWriteRestrictionConfig {
  allowOnly: string[]
  denyWithinAllow: string[]
}

/**
 * Network restriction config (internal structure built from permission rules).
 *
 * This uses an "allow-only" pattern (like write restrictions):
 * - `allowedHosts` = hosts that are explicitly allowed
 * - `deniedHosts` = hosts that are explicitly denied (checked first, before allowedHosts)
 *
 * Semantics:
 * - `undefined` = maximally restrictive (deny all network)
 * - `{allowedHosts: [], deniedHosts: []}` = maximally restrictive (nothing allowed)
 * - `{allowedHosts: [...], deniedHosts: [...]}` = apply allow/deny rules
 *
 * Note: Empty `allowedHosts` means NO hosts are allowed (unlike read's empty denyOnly).
 */
export interface NetworkRestrictionConfig {
  allowedHosts?: string[]
  deniedHosts?: string[]
}

export type NetworkHostPattern = {
  host: string
  port: number | undefined
}

export type SandboxAskCallback = (
  params: NetworkHostPattern,
) => Promise<boolean>
