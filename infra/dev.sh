#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_PKG="$REPO_ROOT/apps/web/package.json"
DIST_DIR="$REPO_ROOT/apps/web/dist"
PERSIST_DIR="$SCRIPT_DIR/.wrangler/state"

get_version() {
  node -p "JSON.parse(require('fs').readFileSync('$WEB_PKG','utf8')).version"
}

get_content_type() {
  local file="$1"
  case "$file" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.gif)  echo "image/gif" ;;
    *.ico)  echo "image/x-icon" ;;
    *.webp) echo "image/webp" ;;
    *.woff) echo "font/woff" ;;
    *.woff2) echo "font/woff2" ;;
    *.ttf)  echo "font/ttf" ;;
    *.map)  echo "application/json" ;;
    *.txt)  echo "text/plain; charset=utf-8" ;;
    *.xml)  echo "application/xml; charset=utf-8" ;;
    *.webmanifest) echo "application/manifest+json" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

seed_local_r2() {
  local tier="$1"
  local version
  version="$(get_version)"
  local prefix="builds/v${version}-${tier}"
  echo "Seeding local R2: $prefix/"

  find "$DIST_DIR" -type f | while read -r file; do
    local relative="${file#$DIST_DIR/}"
    local key="${prefix}/${relative}"
    local ct
    ct="$(get_content_type "$file")"

    npx wrangler r2 object put "accomplish-assets/$key" \
      --file "$file" \
      --content-type "$ct" \
      --local \
      --persist-to "$PERSIST_DIR" 2>/dev/null || {
        # Fallback: if --local flag not supported, try without it
        npx wrangler r2 object put "accomplish-assets/$key" \
          --file "$file" \
          --content-type "$ct" \
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
    echo "R2_PREFIX = \"builds/v${version}-${tier}/\""
  } > "$output"
}

start_local_workers() {
  local lite_config="$SCRIPT_DIR/app/.wrangler.dev-lite.toml"
  local ent_config="$SCRIPT_DIR/app/.wrangler.dev-enterprise.toml"

  gen_app_dev_config "accomplish-app-lite" "lite" "$lite_config"
  gen_app_dev_config "accomplish-app-enterprise" "enterprise" "$ent_config"

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
    # Full: build + seed + start
    VERSION="$(get_version)"
    echo "=== Local Workers Dev (${TIER}) ==="
    echo "Version: $VERSION"

    echo ""
    echo "Building web app..."
    (cd "$REPO_ROOT" && pnpm build:web)

    if [ ! -d "$DIST_DIR" ]; then
      echo "ERROR: $DIST_DIR does not exist after build"
      exit 1
    fi

    echo ""
    seed_local_r2 "$TIER"

    echo ""
    start_local_workers
    ;;
  start)
    # Just start workers (assumes R2 already seeded)
    start_local_workers
    ;;
  *)
    echo "Usage: dev.sh <lite|enterprise> | dev.sh start"
    exit 1
    ;;
esac
