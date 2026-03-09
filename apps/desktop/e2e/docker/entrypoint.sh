#!/bin/bash
set -e

# Copy source from mounted workspace into /app (where node_modules already exists from image build)
echo "Copying source into container..."
cp -a /workspace/. /app/

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
