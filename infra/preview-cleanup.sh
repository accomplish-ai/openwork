#!/usr/bin/env bash
set -euo pipefail

# Usage: ./preview-cleanup.sh <pr-number>
PR_NUMBER="${1:?Usage: preview-cleanup.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Cleaning up PR preview: #${PR_NUMBER}"

# 1. Delete the preview worker
echo "Deleting worker: accomplish-pr-${PR_NUMBER}..."
npx wrangler delete --name "accomplish-pr-${PR_NUMBER}" --force 2>/dev/null || echo "Worker not found (may already be deleted)"

# 2. Delete R2 objects under pr-{number}/ prefix
PREFIX="builds/pr-${PR_NUMBER}/"
echo "Deleting R2 objects under: $PREFIX"

# Use node to parse JSON portably (grep -oP is not available on macOS)
npx wrangler r2 object list accomplish-assets --prefix "$PREFIX" 2>/dev/null | \
  node -e "
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      const parsed = JSON.parse(data);
      const objects = parsed.objects || parsed || [];
      for (const obj of objects) {
        if (obj.key) console.log(obj.key);
      }
    });
  " | \
  while read -r key; do
    echo "  Deleting: $key"
    npx wrangler r2 object delete "accomplish-assets/$key"
  done

echo "Preview cleanup complete for PR #${PR_NUMBER}"
