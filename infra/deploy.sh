#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/web/dist/client"
source "$SCRIPT_DIR/lib.sh"

deploy_app_worker() {
  local name="$1"
  local tier="$2"
  local version="$3"

  echo "Deploying ${name}..."
  (cd "$REPO_ROOT/apps/web" && npx wrangler deploy \
    --name "$name" \
    --var "TIER:$tier" \
    --var "VERSION:$version")
}

deploy_admin_worker() {
  : "${KV_NAMESPACE_ID:?KV_NAMESPACE_ID is required}"

  echo "Deploying admin worker..."

  local toml="$SCRIPT_DIR/admin/.generated-admin.toml"
  {
    echo "# AUTO-GENERATED — do not edit manually"
    echo 'name = "accomplish-admin"'
    echo 'main = "src/index.ts"'
    echo 'compatibility_date = "2024-12-01"'
    echo ""
    echo "[observability]"
    echo "enabled = true"
    echo ""
    echo "[[kv_namespaces]]"
    echo 'binding = "ROUTING_CONFIG"'
    echo "id = \"${KV_NAMESPACE_ID}\""
  } > "$toml"

  (cd "$SCRIPT_DIR/admin" && npx wrangler deploy --config "$toml")
  rm -f "$toml"
}

release() {
  : "${KV_NAMESPACE_ID:?KV_NAMESPACE_ID is required}"
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
  : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

  local build_id
  build_id="$(get_build_id)"
  echo "build_id=$build_id" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "Releasing version: $build_id"

  # 1. Build and deploy app workers (per tier)
  for tier in "${TIERS[@]}"; do
    build_web_tier "$REPO_ROOT" "$DIST_DIR" "$tier"
    deploy_app_worker "$(versioned_worker_name "$build_id" "$tier")" "$tier" "$build_id"
  done

  # 3. Health check both workers
  for tier in "${TIERS[@]}"; do
    local url="https://$(versioned_worker_name "$build_id" "$tier").${WORKERS_SUBDOMAIN}.workers.dev/health"
    echo "Health check: $url"
    curl -sf --retry 5 --retry-delay 5 --retry-all-errors "$url" | jq . || { echo "Health check failed: $url"; exit 1; }
  done

  # 4. Read current KV config
  local current_config
  current_config="$(kv_read_config)"

  # 5. Add new build ID to activeVersions
  local active_versions new_active
  active_versions=$(echo "$current_config" | jq -r '.activeVersions')
  new_active=$(echo "$active_versions" | jq --arg v "$build_id" '. + [$v] | unique')

  # 6. Generate router config with ALL active versions
  local all_versions
  all_versions=$(echo "$new_active" | jq -r '.[]')
  for v in $all_versions; do
    [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+$ ]] || { echo "ERROR: Invalid build ID in KV: $v" >&2; exit 1; }
  done
  # shellcheck disable=SC2086
  gen_router_config "$SCRIPT_DIR/router/.generated-release.toml" "$KV_NAMESPACE_ID" $all_versions

  # 7. Deploy router
  echo "Deploying router worker..."
  (cd "$SCRIPT_DIR/router" && npx wrangler deploy --config .generated-release.toml)

  # 8. Update KV config (auto-set default if empty — bootstrap case)
  local current_default
  current_default=$(echo "$current_config" | jq -r '.default')
  local new_config
  if [ "${SET_AS_DEFAULT:-}" = "true" ] || [ -z "$current_default" ]; then
    new_config=$(echo "$current_config" | jq --arg v "$build_id" --argjson av "$new_active" '.activeVersions = $av | .default = $v')
  else
    new_config=$(echo "$current_config" | jq --argjson av "$new_active" '.activeVersions = $av')
  fi
  kv_write_config "$new_config"

  # 9. Write build manifest to KV
  local manifest_json
  manifest_json="$(gen_manifest "$build_id")"
  kv_write_manifest "$build_id" "$manifest_json"
  echo "Manifest written to KV for $build_id"

  # 10. Deploy admin worker
  deploy_admin_worker

  echo "Release complete! Version: $build_id"
}

preview() {
  local pr_number="$1"
  [[ "$pr_number" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }
  : "${KV_NAMESPACE_ID:?KV_NAMESPACE_ID is required}"
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
  : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

  echo "Deploying PR preview: #${pr_number}"

  local build_id
  build_id="$(get_build_id)"
  echo "Build ID: $build_id"

  # 1. Build and deploy versioned app workers (per tier)
  for tier in "${TIERS[@]}"; do
    build_web_tier "$REPO_ROOT" "$DIST_DIR" "$tier"
    local dns_slug
    dns_slug="$(slugify "$build_id")"
    local name="${WORKER_PREFIX}-pr-${pr_number}-v${dns_slug}-${tier}"
    deploy_app_worker "$name" "$tier" "$build_id"
  done

  # 3. Generate router config with KV binding + versioned service bindings
  local router_config="$SCRIPT_DIR/router/.generated-preview.toml"
  gen_preview_router_config_kv "$router_config" "$pr_number" "$KV_NAMESPACE_ID" "$build_id"

  # 4. Deploy router
  echo "Deploying router worker..."
  (cd "$SCRIPT_DIR/router" && npx wrangler deploy --config "$router_config")
  rm -f "$router_config"

  # 5. Write KV config for this PR
  local kv_config
  kv_config=$(jq -n --arg v "$build_id" '{default: $v, overrides: [], activeVersions: [$v]}')
  kv_write_key "config-pr-${pr_number}" "$kv_config"

  # 6. Health check router
  if [[ -n "${WORKERS_SUBDOMAIN:-}" ]]; then
    local router_url="https://accomplish-pr-${pr_number}-router.${WORKERS_SUBDOMAIN}.workers.dev"
    echo "Health check: $router_url"
    curl -sf --retry 3 --retry-delay 5 "$router_url" || echo "WARNING: Health check did not return 200 (may need KV propagation)"
  fi

  echo "Preview deployed!"
  if [[ -n "${WORKERS_SUBDOMAIN:-}" ]]; then
    echo "Router: https://accomplish-pr-${pr_number}-router.${WORKERS_SUBDOMAIN}.workers.dev"
  fi
}

# --- CLI ---
usage() {
  echo "Usage: deploy.sh <command>"
  echo ""
  echo "Commands:"
  echo "  release              Full release: deploy workers + router + KV update"
  echo "  preview <pr-number>  PR preview deploy"
  echo "  admin                Deploy admin dashboard worker"
  exit 1
}

case "${1:-}" in
  release)
    release
    ;;
  preview)
    preview "${2:?Usage: deploy.sh preview <pr-number>}"
    ;;
  admin)
    deploy_admin_worker
    ;;
  *)
    usage
    ;;
esac
