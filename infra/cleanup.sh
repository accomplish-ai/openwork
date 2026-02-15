#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

cleanup_preview() {
  local pr="$1"
  ensure_kv_namespace
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
  : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
  echo "Cleaning up PR preview: #${pr}"

  local kv_key="config-pr-${pr}"

  # Try to read KV config to discover versioned workers
  local kv_config build_id dns_slug
  kv_config=$(kv_read_key "$kv_key" 2>/dev/null) || kv_config=""

  if [ -n "$kv_config" ] && [ "$kv_config" != '{"default":"","overrides":[],"activeVersions":[]}' ]; then
    # KV-aware path: delete versioned workers
    build_id=$(echo "$kv_config" | jq -r '.default')
    if [ -n "$build_id" ] && [ "$build_id" != "" ]; then
      dns_slug="$(slugify "$build_id")"
      for tier in "${TIERS[@]}"; do
        local name="${WORKER_PREFIX}-pr-${pr}-v${dns_slug}-${tier}"
        echo "Deleting versioned worker: ${name}..."
        npx wrangler delete --name "$name" --force 2>/dev/null || echo "Worker ${name} not found, skipping"
      done
    fi
  else
    # Fallback: delete old-style non-versioned workers
    for tier in "${TIERS[@]}"; do
      local name="$(preview_worker_name "$pr" "$tier")"
      echo "Deleting worker (fallback): ${name}..."
      npx wrangler delete --name "$name" --force 2>/dev/null || echo "Worker ${name} not found, skipping"
    done
  fi

  # Always delete router
  local router_name="$(preview_worker_name "$pr" router)"
  echo "Deleting router: ${router_name}..."
  npx wrangler delete --name "$router_name" --force 2>/dev/null || echo "Router ${router_name} not found, skipping"

  # Delete KV key
  kv_delete_key "$kv_key"

  echo "Preview cleanup complete for PR #${pr}"
}

# --- CLI ---
PR_NUMBER="${1:?Usage: cleanup.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }
cleanup_preview "$PR_NUMBER"
