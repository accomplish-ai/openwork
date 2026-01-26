#!/usr/bin/env node
/**
 * Bundle MCP skills for production using esbuild.
 *
 * This script compiles TypeScript skills to standalone JavaScript bundles,
 * eliminating the need for tsx at runtime and avoiding pnpm symlink issues
 * in the packaged Electron app.
 *
 * Run: node scripts/bundle-skills.cjs
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

/**
 * Skills to bundle with their entry points and any external dependencies
 * that should NOT be bundled (native modules, etc.)
 */
const SKILLS = [
  {
    name: 'dev-browser',
    entry: 'src/index.ts',
    // Note: start-server.ts is NOT bundled - we create server-launcher.cjs manually
    // because start-server.ts uses top-level await which requires ESM but express needs CJS
    // Playwright must be external - it has dynamic requires that can't be bundled
    // node_modules/playwright is included via extraResources in package.json
    external: ['playwright', 'rebrowser-playwright', 'playwright-core', 'rebrowser-playwright-core'],
  },
  {
    name: 'dev-browser-mcp',
    entry: 'src/index.ts',
    // Playwright must be external - included via extraResources
    external: ['playwright', 'rebrowser-playwright', 'playwright-core', 'rebrowser-playwright-core'],
  },
  {
    name: 'file-permission',
    entry: 'src/index.ts',
    external: [],
  },
  {
    name: 'ask-user-question',
    entry: 'src/index.ts',
    external: [],
  },
  {
    name: 'complete-task',
    entry: 'src/index.ts',
    external: [],
  },
];

/**
 * Create esbuild alias plugin to resolve path aliases like @/* -> ./src/*
 */
function createAliasPlugin(skillDir) {
  return {
    name: 'alias',
    setup(build) {
      // Resolve @/* to ./src/*
      build.onResolve({ filter: /^@\// }, (args) => {
        const relativePath = args.path.replace(/^@\//, '');
        // Remove .js extension if present (TypeScript uses .js in imports but files are .ts)
        const cleanPath = relativePath.replace(/\.js$/, '');
        const resolved = path.join(skillDir, 'src', cleanPath);
        // Try .ts first, then .js, then as-is
        const extensions = ['.ts', '.js', ''];
        for (const ext of extensions) {
          const fullPath = resolved + ext;
          if (fs.existsSync(fullPath)) {
            return { path: fullPath };
          }
        }
        // Check if it's a directory with index.ts
        const indexPath = path.join(resolved, 'index.ts');
        if (fs.existsSync(indexPath)) {
          return { path: indexPath };
        }
        return { path: resolved + '.ts' };
      });
    },
  };
}

/**
 * Bundle a single skill
 */
async function bundleSkill(skill) {
  const skillDir = path.join(SKILLS_DIR, skill.name);
  const distDir = path.join(skillDir, 'dist');

  // Check if skill exists
  if (!fs.existsSync(skillDir)) {
    console.log(`  ⚠️  Skill directory not found: ${skill.name}, skipping`);
    return false;
  }

  const entryPath = path.join(skillDir, skill.entry);
  if (!fs.existsSync(entryPath)) {
    console.log(`  ⚠️  Entry point not found: ${entryPath}, skipping`);
    return false;
  }

  // Create dist directory
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  console.log(`  📦 Bundling ${skill.name}...`);

  try {
    // Bundle main entry point
    // Use CommonJS format because express and its dependencies use dynamic require()
    // which is not supported in ESM bundles
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: path.join(distDir, 'index.cjs'),
      plugins: [createAliasPlugin(skillDir)],
      external: [
        // Skill-specific externals only - Node built-ins are handled by esbuild for CommonJS
        'electron',
        ...skill.external,
      ],
      // CommonJS has __dirname and __filename built-in, no banner needed
      // Source maps for debugging
      sourcemap: true,
      // Minify for smaller size
      minify: true,
      // Keep names for better stack traces
      keepNames: true,
    });

    // Bundle additional entry points if specified
    if (skill.additionalEntries) {
      for (const additionalEntry of skill.additionalEntries) {
        const additionalPath = path.join(skillDir, additionalEntry);
        if (!fs.existsSync(additionalPath)) {
          console.log(`    ⚠️  Additional entry not found: ${additionalEntry}, skipping`);
          continue;
        }

        const outName = path.basename(additionalEntry, '.ts') + '.cjs';
        await esbuild.build({
          entryPoints: [additionalPath],
          bundle: true,
          platform: 'node',
          target: 'node20',
          format: 'cjs',
          outfile: path.join(distDir, outName),
          plugins: [createAliasPlugin(skillDir)],
          external: [
            // Skill-specific externals only - Node built-ins are handled by esbuild
            'electron',
            ...skill.external,
          ],
          sourcemap: true,
          minify: true,
          keepNames: true,
        });
        console.log(`    ✓ Bundled ${additionalEntry}`);
      }
    }

    // Get bundle size
    const bundlePath = path.join(distDir, 'index.cjs');
    const stats = fs.statSync(bundlePath);
    const sizeKB = Math.round(stats.size / 1024);

    console.log(`    ✓ ${skill.name}/dist/index.cjs (${sizeKB} KB)`);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to bundle ${skill.name}:`, error.message);
    return false;
  }
}

/**
 * Create a bundled server launcher for dev-browser.
 *
 * The original start-server.ts uses top-level await which is not supported in CommonJS.
 * Instead, we create a CJS launcher that requires the bundled index.cjs and calls serve().
 * This avoids the ESM/CJS conflict while keeping all the express code in CommonJS.
 */
async function createBundledServerLauncher() {
  const distDir = path.join(SKILLS_DIR, 'dev-browser', 'dist');
  const serverLauncherPath = path.join(distDir, 'server-launcher.cjs');

  // This is a self-contained CJS launcher that:
  // 1. Requires the bundled index.cjs which exports serve()
  // 2. Handles all the startup logic from start-server.ts but without top-level await
  const launcherCode = `#!/usr/bin/env node
/**
 * Production server launcher for dev-browser.
 * This is a CommonJS script that loads the bundled index.cjs and starts the server.
 * Replaces start-server.ts which uses top-level await (ESM-only feature).
 */
const { serve } = require('./index.cjs');
const { execSync } = require('child_process');
const { mkdirSync, existsSync, unlinkSync } = require('fs');
const { join } = require('path');

// Use a user-writable location for tmp and profiles (app bundle is read-only when installed)
function getDataDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "Accomplish", "dev-browser");
  } else if (process.platform === "win32") {
    return join(process.env.APPDATA || homeDir, "Accomplish", "dev-browser");
  } else {
    return join(homeDir, ".accomplish", "dev-browser");
  }
}

const dataDir = getDataDir();
const tmpDir = join(dataDir, "tmp");
const profileDir = process.env.DEV_BROWSER_PROFILE || join(dataDir, "profiles");

// Create data directories if they don't exist
console.log(\`Creating data directory: \${dataDir}\`);
mkdirSync(tmpDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });

const ACCOMPLISH_HTTP_PORT = parseInt(process.env.DEV_BROWSER_PORT || '9224', 10);
const ACCOMPLISH_CDP_PORT = parseInt(process.env.DEV_BROWSER_CDP_PORT || '9225', 10);

// Validate port numbers
if (!Number.isFinite(ACCOMPLISH_HTTP_PORT) || ACCOMPLISH_HTTP_PORT < 1 || ACCOMPLISH_HTTP_PORT > 65535) {
  throw new Error(\`Invalid DEV_BROWSER_PORT: \${process.env.DEV_BROWSER_PORT}\`);
}
if (!Number.isFinite(ACCOMPLISH_CDP_PORT) || ACCOMPLISH_CDP_PORT < 1 || ACCOMPLISH_CDP_PORT > 65535) {
  throw new Error(\`Invalid DEV_BROWSER_CDP_PORT: \${process.env.DEV_BROWSER_CDP_PORT}\`);
}

// Clean up stale Chrome profile lock files
const profileDirs = [
  join(profileDir, "chrome-profile"),
  join(profileDir, "playwright-profile"),
];
const staleLockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
for (const dir of profileDirs) {
  for (const lockFile of staleLockFiles) {
    const lockPath = join(dir, lockFile);
    if (existsSync(lockPath)) {
      try {
        unlinkSync(lockPath);
        console.log(\`Cleaned up stale lock file: \${lockFile} in \${dir}\`);
      } catch (err) {
        console.warn(\`Failed to remove \${lockFile}:\`, err);
      }
    }
  }
}

// Helper to install Playwright Chromium
function installPlaywrightChromium() {
  console.log("\\n========================================");
  console.log("Downloading browser (one-time setup)...");
  console.log("This may take 1-2 minutes.");
  console.log("========================================\\n");

  const managers = [
    { name: "bun", command: "bunx playwright install chromium" },
    { name: "pnpm", command: "pnpm exec playwright install chromium" },
    { name: "npm", command: "npx playwright install chromium" },
  ];

  let pm = null;
  for (const manager of managers) {
    try {
      const cmd = process.platform === 'win32' ? \`where \${manager.name}\` : \`which \${manager.name}\`;
      execSync(cmd, { stdio: "ignore" });
      pm = manager;
      break;
    } catch {
      // Package manager not found, try next
    }
  }

  if (!pm) {
    throw new Error("No package manager found (tried bun, pnpm, npm)");
  }

  console.log(\`Using \${pm.name} to install Playwright Chromium...\`);
  execSync(pm.command, { stdio: "inherit" });
  console.log("\\nBrowser installed successfully!\\n");
}

// Start the server
const headless = process.env.HEADLESS === "true";

async function startServer(retry = false) {
  try {
    const server = await serve({
      port: ACCOMPLISH_HTTP_PORT,
      cdpPort: ACCOMPLISH_CDP_PORT,
      headless,
      profileDir,
      useSystemChrome: true,
    });

    console.log(\`Dev browser server started\`);
    console.log(\`  WebSocket: \${server.wsEndpoint}\`);
    console.log(\`  Tmp directory: \${tmpDir}\`);
    console.log(\`  Profile directory: \${profileDir}\`);
    console.log(\`\\nReady\`);
    console.log(\`\\nPress Ctrl+C to stop\`);

    // Keep the process running
    await new Promise(() => {});
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const isBrowserMissing =
      errorMessage.includes("Executable doesn't exist") ||
      errorMessage.includes("browserType.launchPersistentContext") ||
      errorMessage.includes("npx playwright install") ||
      errorMessage.includes("run the install command");

    if (isBrowserMissing && !retry) {
      console.log("\\nSystem Chrome not available, downloading Playwright Chromium...");
      try {
        installPlaywrightChromium();
        await startServer(true);
        return;
      } catch (installError) {
        console.error("Failed to install Playwright browsers:", installError);
        console.log("You may need to run manually: npx playwright install chromium");
        process.exit(1);
      }
    }

    console.error("Failed to start dev browser server:", error);
    process.exit(1);
  }
}

startServer();
`;

  fs.writeFileSync(serverLauncherPath, launcherCode);
  console.log('    ✓ Created server-launcher.cjs');
}

/**
 * Main bundling function
 */
async function main() {
  console.log('\n🔧 Bundling MCP skills for production...\n');

  let successCount = 0;
  let failCount = 0;

  for (const skill of SKILLS) {
    const success = await bundleSkill(skill);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Create the bundled server launcher for dev-browser
  console.log('\n  📦 Creating dev-browser server launcher...');
  await createBundledServerLauncher();

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Bundled ${successCount} skills successfully`);
  if (failCount > 0) {
    console.log(`⚠️  ${failCount} skills failed to bundle`);
  }
  console.log('─'.repeat(50) + '\n');

  // Exit with error if any failed
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Bundle failed:', error);
  process.exit(1);
});
