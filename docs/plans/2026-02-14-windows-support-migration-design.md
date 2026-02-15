# Windows Support Migration: Lite → Enterprise

## Goal

Achieve full parity with `accomplish-lite` Windows support. The only architectural difference: `@accomplish_ai/agent-core` is an npm package (not workspace member).

## What Already Exists in Enterprise

- `index.ts`: `setAppUserModelId`, icon.ico, titlebar, protocol handling, window-all-closed
- `updater.ts`: Stub Windows dialog (points to GitHub — needs replacement)
- `electron-builder`: NSIS config, win target, icon.ico, asar unpack for Windows opencode binaries
- `electron-options.ts`: Windows PATH delimiter, `Path` env var, `opencode-windows-x64` package
- `auth-browser.ts`: Windows PTY cancel handling (Y\n)
- `menu.ts`: Windows Help menu with Check for Updates
- `after-pack.cjs`: node-pty prebuild copying + arm64 pruning for Windows
- `package.cjs`: npmRebuild=false on Windows, junction instead of symlink
- `download-nodejs.cjs`: Downloads win32-x64 Node.js zip
- `postinstall.cjs`: Skips electron-rebuild on Windows, installs better-sqlite3 prebuild
- `ci.yml`: Windows CI job (unit tests + typecheck)
- `package.json` scripts: `package:win`, `release:win`

## What Needs Migration

### 1. Squirrel.Windows Event Handling

**Source**: `lite/apps/desktop/src/main/index.ts` lines 8-29

Add to top of enterprise `index.ts` before any other code. Handles `--squirrel-install`, `--squirrel-updated`, `--squirrel-uninstall`, `--squirrel-obsolete` args — creates/removes shortcuts via `Update.exe`.

### 2. Windows Updater Flow

**Source**: `lite/apps/desktop/src/main/updater.ts`

Replace the stub `showWindowsUpdateDialog()` with lite's full implementation:
- `fetchWindowsUpdateInfo()`: Fetches `latest-win.yml` from R2 (`https://downloads.openwork.me`)
- `compareVersions()`: Semver comparison
- `showWindowsUpdateDialog()`: Dialog with Download / Copy URL / Later buttons
- `checkForUpdatesWindows()`: Full Windows-specific update check
- `autoCheckForUpdates()`: Windows path (shows dialog, not silent auto-download)

Adapt for enterprise: tier-based manifest names (`latest-win.yml` / `latest-win-enterprise.yml`), use enterprise download URLs.

### 3. Windows Code Signing Scripts

**Source**: `lite/apps/desktop/scripts/sign-win.cjs` and `after-all-artifact-build.cjs`

- `sign-win.cjs`: DigiCert KeyLocker signing via `smctl.exe`. Two auth modes (local DigiCert Trust Assistant, CI env vars). SHA256 signing.
- `after-all-artifact-build.cjs`: Post-build hook that signs NSIS `.exe` installers.
- electron-builder config addition: `"win.sign": "./scripts/sign-win.cjs"`

CI secrets needed: `SM_HOST`, `SM_API_KEY`, `SM_CLIENT_CERT_FILE`, `SM_CLIENT_CERT_PASSWORD`, `SM_KEYPAIR_ALIAS`

### 4. Release Workflow: Windows Build Job

**Source**: `lite/.github/workflows/release.yml` (adapt from mac jobs)

Add `build-win-x64` job to both `release.yml` and `build.yml`:
- Runner: `windows-latest`
- Steps: checkout, setup Node, pnpm install, rebuild native modules, build, package (NSIS), sign, upload artifacts
- Signing: install DigiCert tools, configure KeyLocker env vars
- Upload: R2 upload of `.exe` installer + manifest generation
- GitHub Release: include Windows artifacts alongside Mac

### 5. R2 Upload Script for Windows

**Source**: `lite/scripts/upload-r2-macos.sh` (adapt for Windows)

Create `scripts/upload-r2-windows.sh`:
- Upload NSIS `.exe` to R2 (`downloads/{version}/windows/`)
- Generate `latest-win.yml` / `latest-win-enterprise.yml` manifests
- Manifest format: version, files (sha512, size, url), releaseDate

### 6. Windows Manifest Generation

**Source**: `lite/scripts/generate-windows-manifest.sh`

Migrate or inline into `upload-r2-windows.sh`. Generates `latest-win.yml` with SHA512, file size, download URL.

### 7. CI Windows Test Improvements

**Source**: `lite/.github/workflows/ci.yml`

- Add `node-pty` to the rebuild step (currently only `better-sqlite3`)
- Evaluate enabling integration tests on Windows

### 8. Enterprise-Specific Adaptations

All migrated code must account for:
- Tier-based naming: `Accomplish-Enterprise-*` vs `Accomplish-*` artifacts
- Tier-based manifests: `latest-win-enterprise.yml` vs `latest-win.yml`
- R2 paths match existing macOS convention
- `APP_TIER` env var in build jobs
- Repo name: `accomplish-enterprise` (not `openwork-releases`) for GitHub Releases
- Download URL: `https://downloads.openwork.me` (same as macOS)

## Out of Scope

- Agent-core Windows logic (already in npm package)
- Linux support
- Auto-update silent install (lite uses manual download dialog on Windows)
- Analytics module (not in enterprise)
