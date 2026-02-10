#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_PKG="$REPO_ROOT/apps/web/package.json"
DIST_DIR="$REPO_ROOT/apps/web/dist"

# Read version — use fs.readFileSync to avoid require() issues with "type": "module"
get_version() {
  node -p "JSON.parse(require('fs').readFileSync('$WEB_PKG','utf8')).version"
}

upload_to_r2() {
  local tier="$1"
  local version
  version="$(get_version)"
  local prefix="builds/v${version}-${tier}"
  echo "Uploading to R2 prefix: $prefix/"

  find "$DIST_DIR" -type f | while read -r file; do
    local relative="${file#$DIST_DIR/}"
    local key="${prefix}/${relative}"

    local ct="application/octet-stream"
    case "$file" in
      *.html) ct="text/html; charset=utf-8" ;;
      *.js)   ct="application/javascript; charset=utf-8" ;;
      *.css)  ct="text/css; charset=utf-8" ;;
      *.json) ct="application/json; charset=utf-8" ;;
      *.svg)  ct="image/svg+xml" ;;
      *.png)  ct="image/png" ;;
      *.jpg|*.jpeg) ct="image/jpeg" ;;
      *.gif)  ct="image/gif" ;;
      *.ico)  ct="image/x-icon" ;;
      *.webp) ct="image/webp" ;;
      *.woff) ct="font/woff" ;;
      *.woff2) ct="font/woff2" ;;
      *.ttf)  ct="font/ttf" ;;
      *.map)  ct="application/json" ;;
      *.txt)  ct="text/plain; charset=utf-8" ;;
      *.xml)  ct="application/xml; charset=utf-8" ;;
      *.webmanifest) ct="application/manifest+json" ;;
    esac

    echo "  $key ($ct)"
    npx wrangler r2 object put "accomplish-assets/$key" \
      --file "$file" \
      --content-type "$ct"
  done
}

deploy_workers() {
  echo "Deploying app-lite worker..."
  (cd "$SCRIPT_DIR/app" && npx wrangler deploy --config wrangler.lite.toml)

  echo "Deploying app-enterprise worker..."
  (cd "$SCRIPT_DIR/app" && npx wrangler deploy --config wrangler.enterprise.toml)

  echo "Deploying router worker..."
  (cd "$SCRIPT_DIR/router" && npx wrangler deploy)
}

# --- Subcommand interface for CI ---
# Usage:
#   bash deploy.sh              — full deploy (build + upload + deploy workers)
#   bash deploy.sh upload lite  — upload dist to R2 for a tier
#   bash deploy.sh deploy-workers — deploy all workers
case "${1:-}" in
  upload)
    tier="${2:?Usage: deploy.sh upload <tier>}"
    upload_to_r2 "$tier"
    ;;
  deploy-workers)
    deploy_workers
    ;;
  "")
    # Full deploy
    VERSION="$(get_version)"
    echo "Deploying version: $VERSION"

    echo "Building web app..."
    (cd "$REPO_ROOT" && pnpm build:web)

    if [ ! -d "$DIST_DIR" ]; then
      echo "ERROR: $DIST_DIR does not exist after build"
      exit 1
    fi

    upload_to_r2 "lite"
    upload_to_r2 "enterprise"
    deploy_workers

    echo "Deploy complete! Version: $VERSION"
    echo ""
    echo "Verify:"
    echo "  curl https://accomplish-app-lite.accomplish.workers.dev/health"
    echo "  curl https://accomplish-app-enterprise.accomplish.workers.dev/health"
    ;;
  *)
    echo "Unknown command: $1"
    echo "Usage: deploy.sh [upload <tier> | deploy-workers]"
    exit 1
    ;;
esac
