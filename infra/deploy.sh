#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_PKG="$REPO_ROOT/apps/web/package.json"
DIST_DIR="$REPO_ROOT/apps/web/dist"
export CLOUDFLARE_ACCOUNT_ID="ab43a89c284963fce47460305a945611"

get_version() {
  node -p "JSON.parse(require('fs').readFileSync('$WEB_PKG','utf8')).version"
}

upload_to_r2() {
  local prefix="$1"
  echo "Uploading to R2 prefix: $prefix/"

  while read -r file; do
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
  done < <(find "$DIST_DIR" -type f)
}

build_web() {
  echo "Building web app..."
  (cd "$REPO_ROOT" && pnpm build:web)

  if [ ! -d "$DIST_DIR" ]; then
    echo "ERROR: $DIST_DIR does not exist after build"
    exit 1
  fi
}

deploy_app_worker() {
  local name="$1"
  local tier="$2"
  local version="$3"
  local r2_prefix="$4"

  echo "Deploying ${name}..."
  (cd "$SCRIPT_DIR/app" && npx wrangler deploy \
    --name "$name" \
    --var "TIER:$tier" \
    --var "VERSION:$version" \
    --var "R2_PREFIX:$r2_prefix")
}

deploy_workers() {
  local mode="$1"
  local pr="${2:-}"

  local version
  version="$(get_version)"

  local lite_name="accomplish-app-lite"
  local enterprise_name="accomplish-app-enterprise"
  local lite_r2="builds/v${version}-lite/"
  local enterprise_r2="builds/v${version}-enterprise/"
  local router_config="wrangler.toml"

  if [ "$mode" = "preview" ]; then
    lite_name="accomplish-pr-${pr}-lite"
    enterprise_name="accomplish-pr-${pr}-enterprise"
    version="pr-${pr}"
    lite_r2="builds/pr-${pr}-lite/"
    enterprise_r2="builds/pr-${pr}-enterprise/"

    router_config="wrangler.preview-pr-${pr}.toml"
    sed "s/PLACEHOLDER/${pr}/g" "$SCRIPT_DIR/router/wrangler.preview.toml" > "$SCRIPT_DIR/router/$router_config"
  fi

  deploy_app_worker "$lite_name" "lite" "$version" "$lite_r2"
  deploy_app_worker "$enterprise_name" "enterprise" "$version" "$enterprise_r2"

  echo "Deploying router worker..."
  (cd "$SCRIPT_DIR/router" && npx wrangler deploy --config "$router_config")

  if [ "$mode" = "preview" ]; then
    rm -f "$SCRIPT_DIR/router/$router_config"
  fi
}

# --- CLI ---
usage() {
  echo "Usage: deploy.sh <command>"
  echo ""
  echo "Commands:"
  echo "  production           Build + upload + deploy (full production)"
  echo "  preview <pr-number>  Build + upload + deploy (PR preview)"
  echo "  upload <tier>        Upload dist to R2 for a tier"
  echo "  deploy-workers       Deploy production workers"
  exit 1
}

case "${1:-}" in
  production)
    VERSION="$(get_version)"
    echo "Deploying version: $VERSION"

    build_web

    upload_to_r2 "builds/v${VERSION}-lite"
    upload_to_r2 "builds/v${VERSION}-enterprise"
    deploy_workers production

    echo "Deploy complete! Version: $VERSION"
    echo ""
    echo "Verify:"
    echo "  curl https://accomplish-app-lite.accomplish.workers.dev/health"
    echo "  curl https://accomplish-app-enterprise.accomplish.workers.dev/health"
    ;;

  preview)
    PR_NUMBER="${2:?Usage: deploy.sh preview <pr-number>}"
    [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }

    echo "Deploying PR preview: #${PR_NUMBER}"

    build_web

    upload_to_r2 "builds/pr-${PR_NUMBER}-lite"
    upload_to_r2 "builds/pr-${PR_NUMBER}-enterprise"
    deploy_workers preview "$PR_NUMBER"

    echo "Preview deployed!"
    echo "Router:     https://accomplish-pr-${PR_NUMBER}-router.accomplish.workers.dev"
    echo "App Lite:   https://accomplish-pr-${PR_NUMBER}-lite.accomplish.workers.dev"
    echo "App Enterprise: https://accomplish-pr-${PR_NUMBER}-enterprise.accomplish.workers.dev"
    ;;

  upload)
    tier="${2:?Usage: deploy.sh upload <tier>}"
    version="$(get_version)"
    upload_to_r2 "builds/v${version}-${tier}"
    ;;

  deploy-workers)
    deploy_workers production
    ;;

  *)
    usage
    ;;
esac
