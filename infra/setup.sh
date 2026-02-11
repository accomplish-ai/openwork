#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

BUCKET="${R2_BUCKET:-accomplish-assets}"

echo "Checking if R2 bucket '${BUCKET}' exists..."
output=$(npx wrangler r2 bucket list 2>&1) || {
  echo "ERROR: Failed to list R2 buckets:"
  echo "$output"
  exit 1
}

if echo "$output" | grep -q "\"${BUCKET}\""; then
  echo "Bucket '${BUCKET}' already exists — nothing to do."
else
  echo "Creating R2 bucket '${BUCKET}'..."
  npx wrangler r2 bucket create "$BUCKET"
  echo "Bucket '${BUCKET}' created."
fi
