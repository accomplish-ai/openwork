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
  local version
  version="$(get_version)"
  local prefix="$(r2_prod_prefix "$version" "$tier")"
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
  local version
  version="$(get_version)"

  {
    echo "name = \"$name\""
    echo ""
    cat "$SCRIPT_DIR/app/wrangler.toml"
    echo ""
    echo "[vars]"
    echo "TIER = \"$tier\""
    echo "VERSION = \"$version\""
    echo "R2_PREFIX = \"$(r2_prod_prefix "$version" "$tier")/\""
  } > "$output"
}

start_local_workers() {
  local lite_config="$SCRIPT_DIR/app/.wrangler.dev-lite.toml"
  local ent_config="$SCRIPT_DIR/app/.wrangler.dev-enterprise.toml"

  gen_app_dev_config "$(worker_name lite)" "lite" "$lite_config"
  gen_app_dev_config "$(worker_name enterprise)" "enterprise" "$ent_config"

  trap 'rm -f "$lite_config" "$ent_config"' EXIT

  echo "Starting local workers on http://localhost:8787..."
  (cd "$SCRIPT_DIR" && npx wrangler dev \
    -c router/wrangler.toml \
    -c "app/.wrangler.dev-lite.toml" \
    -c "app/.wrangler.dev-enterprise.toml" \
    --persist-to "$PERSIST_DIR")
}

# --- Main ---
TIER="${1:-}"
case "$TIER" in
  lite|enterprise)
    version="$(get_version)"
    echo "=== Local Workers Dev (${TIER}) ==="
    echo "Version: $version"

    echo ""
    build_web "$REPO_ROOT" "$DIST_DIR"

    echo ""
    seed_local_r2 "$TIER"

    echo ""
    start_local_workers
    ;;
  start)
    start_local_workers
    ;;
  *)
    echo "Usage: dev.sh <lite|enterprise> | dev.sh start"
    exit 1
    ;;
esac
