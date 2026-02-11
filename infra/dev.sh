#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/web/dist"
PERSIST_DIR="$SCRIPT_DIR/.wrangler/state"
source "$SCRIPT_DIR/lib.sh"
R2_BUCKET="${R2_BUCKET:-accomplish-assets}"

seed_local_r2() {
  local tier="$1"
  local build_id="$2"
  local prefix="$(r2_prod_prefix "$build_id" "$tier")"
  echo "Seeding local R2: $prefix/"

  find "$DIST_DIR" -type f | while read -r file; do
    local relative="${file#$DIST_DIR/}"
    local key="${prefix}/${relative}"
    local ct
    ct="$(get_content_type "$file")"

    npx wrangler r2 object put "${R2_BUCKET}/$key" \
      --file "$file" \
      --content-type "$ct" \
      --local \
      --persist-to "$PERSIST_DIR" 2>/dev/null || {
        npx wrangler r2 object put "${R2_BUCKET}/$key" \
          --file "$file" \
          --content-type "$ct" \
          --local \
          --persist-to "$PERSIST_DIR" 2>/dev/null || true
      }
  done
}

gen_app_dev_config() {
  local name="$1"
  local tier="$2"
  local output="$3"
  local build_id="$4"

  {
    echo "name = \"$name\""
    echo ""
    cat "$SCRIPT_DIR/app/wrangler.toml"
    echo ""
    echo "[vars]"
    echo "TIER = \"$tier\""
    echo "VERSION = \"$build_id\""
    echo "R2_PREFIX = \"$(r2_prod_prefix "$build_id" "$tier")/\""
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

  local lite_config="$SCRIPT_DIR/app/.generated-dev-lite.toml"
  local ent_config="$SCRIPT_DIR/app/.generated-dev-enterprise.toml"
  local router_config="$SCRIPT_DIR/router/.generated-dev.toml"

  gen_app_dev_config "$(versioned_worker_name "$build_id" lite)" "lite" "$lite_config" "$build_id"
  gen_app_dev_config "$(versioned_worker_name "$build_id" enterprise)" "enterprise" "$ent_config" "$build_id"
  gen_router_config "$router_config" "local-dev-placeholder" "$build_id"

  echo "Starting local workers on http://localhost:8787..."
  (cd "$SCRIPT_DIR" && npx wrangler dev \
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
    seed_local_r2 "$TIER" "$build_id"

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
