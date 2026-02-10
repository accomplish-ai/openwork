#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/web/dist"
source "$SCRIPT_DIR/lib.sh"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID must be set}"
R2_BUCKET="${R2_BUCKET:-accomplish-assets}"

upload_to_r2() {
  local prefix="$1"
  echo "Uploading to R2 prefix: $prefix/"

  while read -r file; do
    local relative="${file#$DIST_DIR/}"
    local key="${prefix}/${relative}"

    local ct
    ct="$(get_content_type "$file")"

    echo "  $key ($ct)"
    npx wrangler r2 object put "${R2_BUCKET}/$key" \
      --file "$file" \
      --content-type "$ct"
  done < <(find "$DIST_DIR" -type f)
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

gen_preview_router_config() {
  local pr="$1"
  local config="wrangler.preview-pr-${pr}.toml"
  sed "s/PLACEHOLDER/${pr}/g" "$SCRIPT_DIR/router/wrangler.preview.toml" > "$SCRIPT_DIR/router/$config"
  echo "$config"
}

deploy_workers() {
  local mode="$1"
  local pr="${2:-}"

  local version
  version="$(get_version)"

  local router_config="wrangler.toml"

  if [ "$mode" = "preview" ]; then
    router_config="$(gen_preview_router_config "$pr")"
    version="pr-${pr}"
  fi

  for tier in "${TIERS[@]}"; do
    local name r2_prefix
    if [ "$mode" = "preview" ]; then
      name="$(preview_worker_name "$pr" "$tier")"
      r2_prefix="$(r2_preview_prefix "$pr" "$tier")/"
    else
      name="$(worker_name "$tier")"
      r2_prefix="$(r2_prod_prefix "$version" "$tier")/"
    fi
    deploy_app_worker "$name" "$tier" "$version" "$r2_prefix"
  done

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
    version="$(get_version)"
    echo "Deploying version: $version"

    build_web "$REPO_ROOT" "$DIST_DIR"

    for tier in "${TIERS[@]}"; do
      upload_to_r2 "$(r2_prod_prefix "$version" "$tier")"
    done
    deploy_workers production

    echo "Deploy complete! Version: $version"
    echo ""
    echo "Verify:"
    for tier in "${TIERS[@]}"; do
      echo "  curl https://$(worker_name "$tier").${WORKERS_SUBDOMAIN}.workers.dev/health"
    done
    ;;

  preview)
    PR_NUMBER="${2:?Usage: deploy.sh preview <pr-number>}"
    [[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }

    echo "Deploying PR preview: #${PR_NUMBER}"

    build_web "$REPO_ROOT" "$DIST_DIR"

    for tier in "${TIERS[@]}"; do
      upload_to_r2 "$(r2_preview_prefix "$PR_NUMBER" "$tier")"
    done
    deploy_workers preview "$PR_NUMBER"

    echo "Preview deployed!"
    echo "Router:     https://$(preview_worker_name "$PR_NUMBER" router).${WORKERS_SUBDOMAIN}.workers.dev"
    echo "App Lite:   https://$(preview_worker_name "$PR_NUMBER" lite).${WORKERS_SUBDOMAIN}.workers.dev"
    echo "App Enterprise: https://$(preview_worker_name "$PR_NUMBER" enterprise).${WORKERS_SUBDOMAIN}.workers.dev"
    ;;

  upload)
    tier="${2:?Usage: deploy.sh upload <tier>}"
    version="$(get_version)"
    upload_to_r2 "$(r2_prod_prefix "$version" "$tier")"
    ;;

  deploy-workers)
    deploy_workers production
    ;;

  *)
    usage
    ;;
esac
