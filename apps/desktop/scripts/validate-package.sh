#!/bin/bash
set -e

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
  echo "Usage: $0 <path-to-app>"
  echo "  macOS: $0 /path/to/Openwork.app"
  echo "  Linux: $0 /path/to/openwork-linux-unpacked"
  exit 1
fi

echo "=== Package Validation ==="
echo "App path: $APP_PATH"
echo "Platform: $(uname -s)"
echo "Architecture: $(uname -m)"
echo ""

# Strip system Node from PATH to simulate clean environment
export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
echo "Stripped PATH to: $PATH"
echo ""

# Determine paths based on platform
if [ "$(uname -s)" = "Darwin" ]; then
  RESOURCES_DIR="$APP_PATH/Contents/Resources"
else
  RESOURCES_DIR="$APP_PATH/resources"
fi

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  NODE_ARCH="arm64"
else
  NODE_ARCH="x64"
fi

NODE_DIR="$RESOURCES_DIR/nodejs/$NODE_ARCH"
NODE_BIN="$NODE_DIR/bin/node"
SKILLS_DIR="$RESOURCES_DIR/skills"

# === Check 1: Bundled Node exists ===
echo "=== Check 1: Bundled Node exists ==="
if [ ! -f "$NODE_BIN" ]; then
  echo "ERROR: Bundled Node not found"
  echo "  Expected: $NODE_BIN"
  echo "  Platform: $(uname -s)-$ARCH"
  echo "  Contents of nodejs dir:"
  ls -la "$RESOURCES_DIR/nodejs/" 2>/dev/null || echo "  (nodejs dir not found)"
  exit 1
fi
echo "OK: Found $NODE_BIN"
echo ""

# === Check 2: Bundled Node runs ===
echo "=== Check 2: Bundled Node runs ==="
export PATH="$NODE_DIR/bin:$PATH"
NODE_VERSION=$("$NODE_BIN" --version 2>&1) || {
  echo "ERROR: Bundled Node failed to run"
  echo "  Path: $NODE_BIN"
  echo "  Exit code: $?"
  echo "  Output: $NODE_VERSION"
  exit 1
}
echo "OK: Node $NODE_VERSION"
echo ""

# === Check 3: Node path structure correct ===
echo "=== Check 3: Node path structure correct ==="
for BINARY in "$NODE_DIR/bin/node" "$NODE_DIR/bin/npm" "$NODE_DIR/bin/npx"; do
  if [ ! -f "$BINARY" ]; then
    echo "ERROR: Expected binary missing"
    echo "  Expected: $BINARY"
    echo "  Contents of bin dir:"
    ls -la "$NODE_DIR/bin/" 2>/dev/null || echo "  (bin dir not found)"
    exit 1
  fi
done
echo "OK: All expected binaries present (node, npm, npx)"
echo ""

# === Check 4: Skills directory exists ===
echo "=== Check 4: Skills directory exists ==="
if [ ! -d "$SKILLS_DIR" ]; then
  echo "ERROR: Skills directory not found"
  echo "  Expected: $SKILLS_DIR"
  exit 1
fi

# Count skill directories (exclude hidden files)
SKILL_COUNT=$(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d ! -name ".*" | wc -l | tr -d ' ')
if [ "$SKILL_COUNT" -eq 0 ]; then
  echo "ERROR: No skills found in $SKILLS_DIR"
  ls -la "$SKILLS_DIR" 2>/dev/null || echo "  (empty)"
  exit 1
fi
echo "OK: Found $SKILL_COUNT skills in $SKILLS_DIR"

# Note: Skills are run via 'npx tsx src/index.ts' at runtime, not pre-compiled
# The app uses bundled Node.js + npx to execute TypeScript directly

echo ""
echo "=== All validations passed ==="
