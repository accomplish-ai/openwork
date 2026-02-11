import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { logForDebugging } from './utils/debug.js'

// Cache for path lookups (key: explicit path or empty string, value: resolved path or null)
const bpfPathCache = new Map<string, string | null>()
const applySeccompPathCache = new Map<string, string | null>()

// Cache for global npm paths (computed once per process)
let cachedGlobalNpmPaths: string[] | null = null

/**
 * Get paths to check for globally installed @anthropic-ai/sandbox-runtime package.
 * This is used as a fallback when the binaries aren't bundled (e.g., native builds).
 */
function getGlobalNpmPaths(): string[] {
  if (cachedGlobalNpmPaths) return cachedGlobalNpmPaths

  const paths: string[] = []

  // Try to get the actual global npm root
  try {
    const npmRoot = execSync('npm root -g', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim()
    if (npmRoot) {
      paths.push(join(npmRoot, '@anthropic-ai', 'sandbox-runtime'))
    }
  } catch {
    // npm not available or failed
  }

  // Common global npm locations as fallbacks
  const home = homedir()
  paths.push(
    // npm global (Linux/macOS)
    join('/usr', 'lib', 'node_modules', '@anthropic-ai', 'sandbox-runtime'),
    join(
      '/usr',
      'local',
      'lib',
      'node_modules',
      '@anthropic-ai',
      'sandbox-runtime',
    ),
    // npm global with prefix (common on macOS with homebrew)
    join(
      '/opt',
      'homebrew',
      'lib',
      'node_modules',
      '@anthropic-ai',
      'sandbox-runtime',
    ),
    // User-local npm global
    join(
      home,
      '.npm',
      'lib',
      'node_modules',
      '@anthropic-ai',
      'sandbox-runtime',
    ),
    join(
      home,
      '.npm-global',
      'lib',
      'node_modules',
      '@anthropic-ai',
      'sandbox-runtime',
    ),
  )

  cachedGlobalNpmPaths = paths
  return paths
}

/**
 * Map Node.js process.arch to our vendor directory architecture names
 * Returns null for unsupported architectures
 */
function getVendorArchitecture(): string | null {
  const arch = process.arch as string
  switch (arch) {
    case 'x64':
    case 'x86_64':
      return 'x64'
    case 'arm64':
    case 'aarch64':
      return 'arm64'
    case 'ia32':
    case 'x86':
      // TODO: Add support for 32-bit x86 (ia32)
      // Currently blocked because the seccomp filter does not block the socketcall() syscall,
      // which is used on 32-bit x86 for all socket operations (socket, socketpair, bind, connect, etc.).
      // On 32-bit x86, the direct socket() syscall doesn't exist - instead, all socket operations
      // are multiplexed through socketcall(SYS_SOCKET, ...), socketcall(SYS_SOCKETPAIR, ...), etc.
      //
      // To properly support 32-bit x86, we need to:
      // 1. Build a separate i386 BPF filter (BPF bytecode is architecture-specific)
      // 2. Modify vendor/seccomp-src/seccomp-unix-block.c to conditionally add rules that block:
      //    - socketcall(SYS_SOCKET, [AF_UNIX, ...])
      //    - socketcall(SYS_SOCKETPAIR, [AF_UNIX, ...])
      // 3. This requires complex BPF logic to inspect socketcall's sub-function argument
      //
      // Until then, 32-bit x86 is not supported to avoid a security bypass.
      logForDebugging(
        `[SeccompFilter] 32-bit x86 (ia32) is not currently supported due to missing socketcall() syscall blocking. ` +
          `The current seccomp filter only blocks socket(AF_UNIX, ...), but on 32-bit x86, socketcall() can be used to bypass this.`,
        { level: 'error' },
      )
      return null
    default:
      logForDebugging(
        `[SeccompFilter] Unsupported architecture: ${arch}. Only x64 and arm64 are supported.`,
      )
      return null
  }
}

/**
 * Get local paths to check for seccomp files (bundled or package installs).
 */
function getLocalSeccompPaths(filename: string): string[] {
  const arch = getVendorArchitecture()
  if (!arch) return []

  const baseDir = dirname(fileURLToPath(import.meta.url))

  return [
    join(baseDir, '..', '..', 'vendor', 'seccomp', arch, filename), // development: src/sandbox/../../vendor/seccomp/{arch}/
    join(baseDir, '..', '..', 'vendor', 'seccomp', arch, filename), // built: dist/sandbox/../../vendor/seccomp/{arch}/
  ]
}

/**
 * Get the path to a pre-generated BPF filter file from the vendor directory
 * Returns the path if it exists, null otherwise
 *
 * Pre-generated BPF files are organized by architecture:
 * - vendor/seccomp/{x64,arm64}/unix-block.bpf
 *
 * Tries multiple paths for resilience:
 * 0. Explicit path provided via parameter (checked first if provided)
 * 1. ../../vendor/seccomp/{arch}/unix-block.bpf (development: from src/sandbox/)
 * 2. ../../vendor/seccomp/{arch}/unix-block.bpf (built: from dist/sandbox/)
 * 3. Global npm install (if seccompBinaryPath not provided) - for native builds
 *
 * @param seccompBinaryPath - Optional explicit path to the BPF filter file. If provided and
 *   exists, it will be used. If not provided, falls back to searching local paths and then
 *   global npm install (for native builds where vendor directory isn't bundled).
 */
export function getPreGeneratedBpfPath(
  seccompBinaryPath?: string,
): string | null {
  const cacheKey = seccompBinaryPath ?? ''
  if (bpfPathCache.has(cacheKey)) {
    return bpfPathCache.get(cacheKey)!
  }

  const result = findBpfPath(seccompBinaryPath)
  bpfPathCache.set(cacheKey, result)
  return result
}

// NOTE: This is a slow operation (synchronous fs lookups + execSync). Ensure calls
// are memoized at the top level rather than invoked repeatedly.
function findBpfPath(seccompBinaryPath?: string): string | null {
  // Check explicit path first (highest priority)
  if (seccompBinaryPath) {
    if (fs.existsSync(seccompBinaryPath)) {
      logForDebugging(
        `[SeccompFilter] Using BPF filter from explicit path: ${seccompBinaryPath}`,
      )
      return seccompBinaryPath
    }
    logForDebugging(
      `[SeccompFilter] Explicit path provided but file not found: ${seccompBinaryPath}`,
    )
  }

  const arch = getVendorArchitecture()
  if (!arch) {
    logForDebugging(
      `[SeccompFilter] Cannot find pre-generated BPF filter: unsupported architecture ${process.arch}`,
    )
    return null
  }

  logForDebugging(`[SeccompFilter] Detected architecture: ${arch}`)

  // Check local paths first (bundled or package install)
  for (const bpfPath of getLocalSeccompPaths('unix-block.bpf')) {
    if (fs.existsSync(bpfPath)) {
      logForDebugging(
        `[SeccompFilter] Found pre-generated BPF filter: ${bpfPath} (${arch})`,
      )
      return bpfPath
    }
  }

  // Fallback: check global npm install (for native builds without bundled vendor)
  for (const globalBase of getGlobalNpmPaths()) {
    const bpfPath = join(
      globalBase,
      'vendor',
      'seccomp',
      arch,
      'unix-block.bpf',
    )
    if (fs.existsSync(bpfPath)) {
      logForDebugging(
        `[SeccompFilter] Found pre-generated BPF filter in global install: ${bpfPath} (${arch})`,
      )
      return bpfPath
    }
  }

  logForDebugging(
    `[SeccompFilter] Pre-generated BPF filter not found in any expected location (${arch})`,
  )
  return null
}

/**
 * Get the path to the apply-seccomp binary from the vendor directory
 * Returns the path if it exists, null otherwise
 *
 * Pre-built apply-seccomp binaries are organized by architecture:
 * - vendor/seccomp/{x64,arm64}/apply-seccomp
 *
 * Tries multiple paths for resilience:
 * 0. Explicit path provided via parameter (checked first if provided)
 * 1. ../../vendor/seccomp/{arch}/apply-seccomp (development: from src/sandbox/)
 * 2. ../../vendor/seccomp/{arch}/apply-seccomp (built: from dist/sandbox/)
 * 3. Global npm install (if seccompBinaryPath not provided) - for native builds
 *
 * @param seccompBinaryPath - Optional explicit path to the apply-seccomp binary. If provided
 *   and exists, it will be used. If not provided, falls back to searching local paths and
 *   then global npm install (for native builds where vendor directory isn't bundled).
 */
export function getApplySeccompBinaryPath(
  seccompBinaryPath?: string,
): string | null {
  const cacheKey = seccompBinaryPath ?? ''
  if (applySeccompPathCache.has(cacheKey)) {
    return applySeccompPathCache.get(cacheKey)!
  }

  const result = findApplySeccompPath(seccompBinaryPath)
  applySeccompPathCache.set(cacheKey, result)
  return result
}

function findApplySeccompPath(seccompBinaryPath?: string): string | null {
  // Check explicit path first (highest priority)
  if (seccompBinaryPath) {
    if (fs.existsSync(seccompBinaryPath)) {
      logForDebugging(
        `[SeccompFilter] Using apply-seccomp binary from explicit path: ${seccompBinaryPath}`,
      )
      return seccompBinaryPath
    }
    logForDebugging(
      `[SeccompFilter] Explicit path provided but file not found: ${seccompBinaryPath}`,
    )
  }

  const arch = getVendorArchitecture()
  if (!arch) {
    logForDebugging(
      `[SeccompFilter] Cannot find apply-seccomp binary: unsupported architecture ${process.arch}`,
    )
    return null
  }

  logForDebugging(
    `[SeccompFilter] Looking for apply-seccomp binary for architecture: ${arch}`,
  )

  // Check local paths first (bundled or package install)
  for (const binaryPath of getLocalSeccompPaths('apply-seccomp')) {
    if (fs.existsSync(binaryPath)) {
      logForDebugging(
        `[SeccompFilter] Found apply-seccomp binary: ${binaryPath} (${arch})`,
      )
      return binaryPath
    }
  }

  // Fallback: check global npm install (for native builds without bundled vendor)
  for (const globalBase of getGlobalNpmPaths()) {
    const binaryPath = join(
      globalBase,
      'vendor',
      'seccomp',
      arch,
      'apply-seccomp',
    )
    if (fs.existsSync(binaryPath)) {
      logForDebugging(
        `[SeccompFilter] Found apply-seccomp binary in global install: ${binaryPath} (${arch})`,
      )
      return binaryPath
    }
  }

  logForDebugging(
    `[SeccompFilter] apply-seccomp binary not found in any expected location (${arch})`,
  )
  return null
}

/**
 * Get the path to a pre-generated seccomp BPF filter that blocks Unix domain socket creation
 * Returns the path to the BPF filter file, or null if not available
 *
 * The filter blocks socket(AF_UNIX, ...) syscalls while allowing all other syscalls.
 * This prevents creation of new Unix domain socket file descriptors.
 *
 * Security scope:
 * - Blocks: socket(AF_UNIX, ...) syscall (creating new Unix socket FDs)
 * - Does NOT block: Operations on inherited Unix socket FDs (bind, connect, sendto, etc.)
 * - Does NOT block: Unix socket FDs passed via SCM_RIGHTS
 * - For most sandboxing scenarios, blocking socket creation is sufficient
 *
 * Note: This blocks ALL Unix socket creation, regardless of path. The allowUnixSockets
 * configuration is not supported on Linux due to seccomp-bpf limitations (it cannot
 * read user-space memory to inspect socket paths).
 *
 * Requirements:
 * - Pre-generated BPF filters included for x64 and ARM64 only
 * - Other architectures are not supported
 *
 * @param seccompBinaryPath - Optional explicit path to the BPF filter file
 * @returns Path to the pre-generated BPF filter file, or null if not available
 */
export function generateSeccompFilter(
  seccompBinaryPath?: string,
): string | null {
  const preGeneratedBpf = getPreGeneratedBpfPath(seccompBinaryPath)
  if (preGeneratedBpf) {
    logForDebugging('[SeccompFilter] Using pre-generated BPF filter')
    return preGeneratedBpf
  }

  logForDebugging(
    '[SeccompFilter] Pre-generated BPF filter not available for this architecture. ' +
      'Only x64 and arm64 are supported.',
    { level: 'error' },
  )
  return null
}

/**
 * Clean up a seccomp filter file
 * Since we only use pre-generated BPF files from vendor/, this is a no-op.
 * Pre-generated files are never deleted.
 * Kept for backward compatibility with existing code that calls it.
 */
export function cleanupSeccompFilter(_filterPath: string): void {
  // No-op: pre-generated BPF files are never cleaned up
}
