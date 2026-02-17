# Plan: Optimize E2E Docker Tests with Image Caching

## Context

The E2E tests are slow because `docker compose up --build` rebuilds the entire Docker image on every run — including system dependencies (apt-get), pnpm installation, dependency install, and app build. Since the Dockerfile rarely changes (it's mostly system deps), this work is wasted. The goal is to cache the Docker image keyed by the Dockerfile hash, and replace docker-compose with plain `docker` commands.

## Approach

Split the current monolithic Dockerfile into a **cached base image** (system deps + installed dependencies) + **runtime source mounting**:

1. **Base image** (`Dockerfile`): System deps, pnpm, package file COPYs, `pnpm install`, WORKDIR, ENV — rebuilt only when Dockerfile or lockfile changes
2. **Entrypoint script** (`entrypoint.sh`): Copies mounted source into the container, runs `pnpm build`, starts Xvfb, runs tests (no `pnpm install` — already in image)
3. **Runner script** (`run-e2e.sh`): Computes cache key from Dockerfile + lockfile, builds image only if needed, runs container with proper `docker run` flags (env vars, volumes, shm, seccomp — replacing docker-compose.yml)
4. **CI caching**: Uses `actions/cache` with `hashFiles()` to persist the Docker image tarball between CI runs, keyed by all files that affect the image (Dockerfile, lockfile, package.json files, workspace config, postinstall scripts/tools)

## Files to Modify

### 1. `apps/desktop/e2e/docker/Dockerfile` — Keep deps installed, remove source + build

Strip out source code copying and build steps. Keep system deps, pnpm setup, package file COPYs, and `pnpm install` (at build time). Remove full source COPY and `pnpm build` (those move to entrypoint at runtime).

```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# do this at build time
RUN apt-get update && apt-get install -y \
    xvfb \
    build-essential \
    python3 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# do this at build time
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# do this at build time
WORKDIR /app

# Copy package files needed for pnpm install (at build time, so deps are cached in image)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent-core/package.json ./packages/agent-core/
COPY apps/desktop/package.json ./apps/desktop/
COPY scripts/ ./scripts/
COPY packages/agent-core/mcp-tools ./packages/agent-core/mcp-tools
COPY apps/desktop/scripts ./apps/desktop/scripts

# do this at docker build
RUN pnpm install --frozen-lockfile

# do this at build time
ENV DISPLAY=:99

# REMOVED (moved to entrypoint at e2e run time):
# - COPY . .              (source mounted via docker run -v)
# - RUN pnpm build        (runs in entrypoint)
# - CMD [...]             (entrypoint handles test execution)
```

### 2. `apps/desktop/e2e/docker/entrypoint.sh` — New file

Runs inside the container. Copies source from the mounted `/workspace` volume, builds, and runs tests. Note: `pnpm install` is NOT here — dependencies are already installed in the Docker image at build time.

```bash
#!/bin/bash
set -e

# Copy source from mounted workspace into /app (where node_modules already exists from image build)
echo "Copying source into container..."
cp -a /workspace/. /app/

# Symlink output dirs to host bind mounts (mounted at /output to avoid overlap with /workspace)
ln -sfn /output/test-results /app/apps/desktop/e2e/test-results
ln -sfn /output/html-report /app/apps/desktop/e2e/html-report

cd /app

# Build all packages (deps already installed in image)
echo "Building..."
pnpm build

# Start Xvfb
Xvfb :99 -screen 0 1920x1080x24 &
sleep 1

# Run E2E tests
echo "Running E2E tests..."
pnpm -F @accomplish/desktop test:e2e:native
```

### 3. `apps/desktop/e2e/docker/run-e2e.sh` — New file

Orchestrator script that handles building/caching the image and running the container. Works both locally and in CI. Replaces docker-compose.yml — all env vars, volumes, shm, and seccomp settings are passed via `docker run` flags.

```bash
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

# Run the container (env vars, volumes, shm, seccomp from docker-compose.yml now here)
docker run --rm \
  -e E2E_SKIP_AUTH=1 \
  -e E2E_MOCK_TASK_EVENTS=1 \
  -e NODE_ENV=test \
  -e DISPLAY=:99 \
  -e DOCKER_ENV=1 \
  --shm-size=2gb \
  --security-opt seccomp=unconfined \
  -v "$REPO_ROOT:/workspace:ro" \
  -v "$REPO_ROOT/apps/desktop/e2e/test-results:/output/test-results" \
  -v "$REPO_ROOT/apps/desktop/e2e/html-report:/output/html-report" \
  "$IMAGE_NAME" \
  bash /workspace/apps/desktop/e2e/docker/entrypoint.sh
```

Note: The build context is `$REPO_ROOT` (not `$SCRIPT_DIR`) because the Dockerfile COPYs package files from the repo root for `pnpm install`.

### 4. `apps/desktop/package.json` — Update scripts

Replace docker-compose scripts with the new shell script:

```json
"test:e2e": "bash e2e/docker/run-e2e.sh",
"test:e2e:build": "bash e2e/docker/run-e2e.sh --build-only",
"test:e2e:clean": "docker rmi $(docker images 'accomplish-e2e' -q) 2>/dev/null || true",
```

### 5. `.github/workflows/ci.yml` — Update E2E job with Docker image caching

Cache key uses `hashFiles()` over all files COPYed into the image at build time: Dockerfile, lockfile, package.json files, workspace config, and postinstall scripts/tools. Any change to these invalidates the cache and triggers a rebuild.

```yaml
e2e-tests:
  name: E2E Tests (Docker)
  runs-on: ubuntu-latest
  timeout-minutes: 30

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup pnpm
      uses: pnpm/action-setup@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'

    - name: Cache E2E Docker image
      id: docker-cache
      uses: actions/cache@v4
      with:
        path: /tmp/e2e-image.tar
        key: e2e-docker-${{ hashFiles('apps/desktop/e2e/docker/Dockerfile') }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('**/package.json', 'pnpm-workspace.yaml') }}-${{ hashFiles('scripts/**', 'apps/desktop/scripts/**', 'packages/agent-core/mcp-tools/**') }}

    - name: Load cached Docker image
      if: steps.docker-cache.outputs.cache-hit == 'true'
      run: docker load -i /tmp/e2e-image.tar

    - name: Build E2E Docker image
      if: steps.docker-cache.outputs.cache-hit != 'true'
      run: bash apps/desktop/e2e/docker/run-e2e.sh --build-only

    - name: Save Docker image to cache
      if: steps.docker-cache.outputs.cache-hit != 'true'
      run: docker save $(docker images 'accomplish-e2e' --format '{{.Repository}}:{{.Tag}}' | head -1) -o /tmp/e2e-image.tar

    - name: Run E2E tests
      run: bash apps/desktop/e2e/docker/run-e2e.sh

    - name: Upload test results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: e2e-test-results
        path: |
          apps/desktop/e2e/test-results/
          apps/desktop/e2e/html-report/
        retention-days: 7
```

### 6. `apps/desktop/e2e/docker/docker-compose.yml` — Delete

No longer needed; replaced by `run-e2e.sh`.

## Verification

1. Run `pnpm typecheck` to ensure no type errors
2. Run `pnpm -F @accomplish/desktop test:e2e` locally to verify the new Docker flow works end-to-end
3. Run it a second time to verify the cache is hit and image is not rebuilt
4. Verify test results appear in `apps/desktop/e2e/test-results/` and `apps/desktop/e2e/html-report/`
