#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/web/dist/client"
PERSIST_DIR="$SCRIPT_DIR/.wrangler/state"
source "$SCRIPT_DIR/lib.sh"

gen_app_dev_config() {
  local name="$1"
  local tier="$2"
  local output="$3"
  local build_id="$4"

  {
    echo "name = \"$name\""
    echo 'main = "src/server/index.ts"'
    echo 'compatibility_date = "2024-12-01"'
    echo ""
    echo "[assets]"
    echo 'directory = "dist/client"'
    echo 'binding = "ASSETS"'
    echo ""
    echo "[observability]"
    echo "enabled = true"
    echo ""
    echo "[vars]"
    echo "TIER = \"$tier\""
    echo "VERSION = \"$build_id\""
  } > "$output"
}

seed_local_kv() {
  local build_id="$1"
  local config_json
  config_json=$(jq -n --arg v "$build_id" '{default: $v, overrides: [], activeVersions: [$v]}')

  echo "Seeding local KV with config: $config_json"
  echo "$config_json" | npx wrangler kv key put "config" --stdin \
    --namespace-id "local-dev-placeholder" \
    --local \
    --persist-to "$PERSIST_DIR"
}

start_local_workers() {
  local build_id="$1"

  local lite_config="$REPO_ROOT/apps/web/.generated-dev-lite.toml"
  local ent_config="$REPO_ROOT/apps/web/.generated-dev-enterprise.toml"
  local router_config="$SCRIPT_DIR/router/.generated-dev.toml"

  gen_app_dev_config "$(versioned_worker_name "$build_id" lite)" "lite" "$lite_config" "$build_id"
  gen_app_dev_config "$(versioned_worker_name "$build_id" enterprise)" "enterprise" "$ent_config" "$build_id"
  gen_router_config "$router_config" "local-dev-placeholder" "$build_id"

  echo "Starting local workers on http://localhost:8787..."
  (cd "$REPO_ROOT/apps/web" && npx wrangler dev \
    -c "$router_config" \
    -c "$lite_config" \
    -c "$ent_config" \
    --persist-to "$PERSIST_DIR")
}

# --- Main ---
TIER="${1:-}"
case "$TIER" in
  lite|enterprise)
    build_id="$(get_build_id)"
    echo "=== Local Workers Dev (${TIER}) ==="
    echo "Build ID: $build_id"

    echo ""
    build_web_tier "$REPO_ROOT" "$DIST_DIR" "$TIER"

    echo ""
    seed_local_kv "$build_id"

    echo ""
    start_local_workers "$build_id"
    ;;
  start)
    build_id="$(get_build_id)"
    start_local_workers "$build_id"
    ;;
  *)
    echo "Usage: dev.sh <lite|enterprise> | dev.sh start"
    exit 1
    ;;
esac
