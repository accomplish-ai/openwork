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
    local output
    if output=$(npx wrangler delete --name "$name" --force 2>&1); then
      echo "Deleted worker: ${name}"
    else
      if echo "$output" | grep -qiE "not found|does not exist|10007|10090"; then
        echo "Worker ${name} not found (already deleted)"
      else
        echo "ERROR: Failed to delete worker ${name}:"
        echo "$output"
        exit 1
      fi
    fi
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
