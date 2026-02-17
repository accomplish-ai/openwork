#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"
LOCKFILE="$REPO_ROOT/pnpm-lock.yaml"

# Compute cache key from all files COPYed into the image at build time
# Must match the inputs used for hashFiles() in CI (ci.yml)
CACHE_INPUT=$(cat \
  "$DOCKERFILE" \
  "$LOCKFILE" \
  "$REPO_ROOT/pnpm-workspace.yaml" \
  "$REPO_ROOT"/package.json \
  "$REPO_ROOT"/packages/agent-core/package.json \
  "$REPO_ROOT"/apps/desktop/package.json \
  "$REPO_ROOT"/scripts/*.* \
  "$REPO_ROOT"/apps/desktop/scripts/*.* \
  "$REPO_ROOT"/packages/agent-core/mcp-tools/**/* \
  2>/dev/null | sha256sum | cut -c1-12)
IMAGE_NAME="accomplish-e2e:${CACHE_INPUT}"

# Build image only if it doesn't exist locally
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "Building E2E base image (tag: $IMAGE_NAME)..."
  docker build -t "$IMAGE_NAME" -f "$DOCKERFILE" "$REPO_ROOT"
else
  echo "Using cached E2E base image (tag: $IMAGE_NAME)"
fi

# Support --build-only flag
if [ "$1" = "--build-only" ]; then
  echo "Image built successfully. Exiting (--build-only)."
  exit 0
fi

# Ensure output directories exist on host
mkdir -p "$REPO_ROOT/apps/desktop/e2e/test-results"
mkdir -p "$REPO_ROOT/apps/desktop/e2e/html-report"

# Run the container
docker run --rm \
  -e E2E_SKIP_AUTH=1 \
  -e E2E_MOCK_TASK_EVENTS=1 \
  -e NODE_ENV=test \
  -e DISPLAY=:99 \
  -e DOCKER_ENV=1 \
  --shm-size=2gb \
  --security-opt seccomp=unconfined \
  -v "$REPO_ROOT:/workspace:ro" \
  -v "$REPO_ROOT/apps/desktop/e2e/test-results:/app/apps/desktop/e2e/test-results" \
  -v "$REPO_ROOT/apps/desktop/e2e/html-report:/app/apps/desktop/e2e/html-report" \
  "$IMAGE_NAME" \
  bash /workspace/apps/desktop/e2e/docker/entrypoint.sh
