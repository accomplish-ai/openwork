#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"
R2_BUCKET="${R2_BUCKET:-accomplish-assets}"

delete_r2_prefix() {
  local prefix="$1"
  echo "Deleting R2 objects under: $prefix"

  local cursor=""
  while true; do
    local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects?prefix=${prefix}"
    [[ -n "$cursor" ]] && url="${url}&cursor=${cursor}"

    local response
    response=$(curl -s "$url" -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")

    local keys
    keys=$(echo "$response" | parse_json '(p.result&&p.result.objects||[]).map(o=>o.key).filter(Boolean)')

    while read -r key; do
      [[ -z "$key" ]] && continue
      echo "  Deleting: $key"
      npx wrangler r2 object delete "${R2_BUCKET}/$key"
    done <<< "$keys"

    cursor=$(echo "$response" | parse_json 'p.result_info&&p.result_info.truncated?p.result_info.cursor:""')

    [[ -z "$cursor" ]] && break
  done
}

cleanup_preview() {
  local pr="$1"
  echo "Cleaning up PR preview: #${pr}"

  for suffix in router lite enterprise; do
    local name="$(preview_worker_name "$pr" "$suffix")"
    echo "Deleting worker: ${name}..."
    npx wrangler delete --name "$name" --force 2>/dev/null || echo "Worker not found (may already be deleted)"
  done

  for tier in "${TIERS[@]}"; do
    delete_r2_prefix "$(r2_preview_prefix "$pr" "$tier")/"
  done

  echo "Preview cleanup complete for PR #${pr}"
}

# --- CLI ---
PR_NUMBER="${1:?Usage: cleanup.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }
cleanup_preview "$PR_NUMBER"
