#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

cleanup_preview() {
  local pr="$1"
  echo "Cleaning up PR preview: #${pr}"

  for suffix in router lite enterprise; do
    local name="$(preview_worker_name "$pr" "$suffix")"
    echo "Deleting worker: ${name}..."
    npx wrangler delete --name "$name" --force 2>/dev/null || echo "Worker not found (may already be deleted)"
  done

  for tier in "${TIERS[@]}"; do
    rclone_delete_r2_prefix "$(r2_preview_prefix "$pr" "$tier")/"
  done

  echo "Preview cleanup complete for PR #${pr}"
}

# --- CLI ---
PR_NUMBER="${1:?Usage: cleanup.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }
cleanup_preview "$PR_NUMBER"
