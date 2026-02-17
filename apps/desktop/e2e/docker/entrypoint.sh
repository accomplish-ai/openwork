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
