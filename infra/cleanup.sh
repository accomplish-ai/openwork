#!/usr/bin/env bash
set -euo pipefail

export CLOUDFLARE_ACCOUNT_ID="ab43a89c284963fce47460305a945611"

delete_r2_prefix() {
  local prefix="$1"
  echo "Deleting R2 objects under: $prefix"

  while read -r key; do
    echo "  Deleting: $key"
    npx wrangler r2 object delete "accomplish-assets/$key"
  done < <(
    curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/accomplish-assets/objects?prefix=${prefix}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | \
      node -e "
        let data = '';
        process.stdin.on('data', chunk => data += chunk);
        process.stdin.on('end', () => {
          const parsed = JSON.parse(data);
          const objects = (parsed.result && parsed.result.objects) || [];
          for (const obj of objects) {
            if (obj.key) console.log(obj.key);
          }
        });
      "
  )
}

cleanup_preview() {
  local pr="$1"
  echo "Cleaning up PR preview: #${pr}"

  for suffix in router lite enterprise; do
    echo "Deleting worker: accomplish-pr-${pr}-${suffix}..."
    npx wrangler delete --name "accomplish-pr-${pr}-${suffix}" --force 2>/dev/null || echo "Worker not found (may already be deleted)"
  done

  delete_r2_prefix "builds/pr-${pr}-lite/"
  delete_r2_prefix "builds/pr-${pr}-enterprise/"

  echo "Preview cleanup complete for PR #${pr}"
}

# --- CLI ---
PR_NUMBER="${1:?Usage: cleanup.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }
cleanup_preview "$PR_NUMBER"
