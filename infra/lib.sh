#!/usr/bin/env bash

LIB_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_WEB_PKG="$LIB_REPO_ROOT/apps/web/package.json"

command -v jq >/dev/null 2>&1 || { echo "Error: jq is required. Install with: brew install jq" >&2; exit 1; }

get_version() {
  jq -r '.version' "$LIB_WEB_PKG"
}

get_build_number() {
  git rev-list --count HEAD
}

get_build_id() {
  echo "$(get_version)-$(get_build_number)"
}

# --- Constants ---
WORKER_PREFIX="accomplish"
TIERS=("lite" "enterprise")
WORKERS_SUBDOMAIN="${CF_SUBDOMAIN:-}"
KV_NAMESPACE_TITLE="accomplish-routing-config"

# --- KV namespace auto-provisioning ---
ensure_kv_namespace() {
  : "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
  : "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"

  if [ -n "${KV_NAMESPACE_ID:-}" ]; then
    return
  fi

  local api_base="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces"
  local response

  response=$(curl -sf \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "$api_base") || { echo "ERROR: Failed to list KV namespaces" >&2; exit 1; }

  local id
  id=$(echo "$response" | jq -r --arg title "$KV_NAMESPACE_TITLE" '.result[] | select(.title == $title) | .id')

  if [ -n "$id" ]; then
    export KV_NAMESPACE_ID="$id"
    echo "KV namespace found: $KV_NAMESPACE_TITLE ($id)"
    return
  fi

  response=$(curl -sf -X POST \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"$KV_NAMESPACE_TITLE\"}" \
    "$api_base") || { echo "ERROR: Failed to create KV namespace" >&2; exit 1; }

  id=$(echo "$response" | jq -r '.result.id')
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "ERROR: KV namespace creation returned no ID: $response" >&2
    exit 1
  fi

  export KV_NAMESPACE_ID="$id"
  echo "KV namespace created: $KV_NAMESPACE_TITLE ($id)"
}

# --- Naming helpers ---
preview_worker_name() { echo "${WORKER_PREFIX}-pr-$1-$2"; }
slugify() { echo "$1" | tr '.+' '--'; }
slugify_binding() { echo "$1" | sed 's/[.\-]/_/g'; }
versioned_worker_name() { echo "${WORKER_PREFIX}-v$(slugify "$1")-$2"; }
binding_name() { echo "APP_V$(slugify_binding "$1")_$(echo "$2" | tr '[:lower:]' '[:upper:]')"; }

# --- Build ---
build_web() {
  local repo_root="$1"
  local dist_dir="$2"
  echo "Building web app..."
  (cd "$repo_root" && pnpm build:web)
  if [ ! -d "$dist_dir" ]; then
    echo "ERROR: $dist_dir does not exist after build"
    exit 1
  fi
}

build_web_tier() {
  local repo_root="$1"
  local dist_dir="$2"
  local tier="$3"
  echo "Building web app (tier: ${tier})..."
  (cd "$repo_root" && APP_TIER="$tier" pnpm -F @accomplish/web run "build:${tier}")
  if [ ! -d "$dist_dir" ]; then
    echo "ERROR: $dist_dir does not exist after build"
    exit 1
  fi
}

# --- Router config generation ---
gen_router_config() {
  local output_file="$1"
  local kv_namespace_id="$2"
  shift 2
  local versions=("$@")

  {
    echo "# AUTO-GENERATED — do not edit manually"
    echo 'name = "accomplish-router"'
    echo 'main = "src/index.ts"'
    echo 'compatibility_date = "2024-12-01"'
    echo ""
    echo "[observability]"
    echo "enabled = true"
    echo ""
    echo "[[kv_namespaces]]"
    echo 'binding = "ROUTING_CONFIG"'
    echo "id = \"${kv_namespace_id}\""
    echo ""

    for build_id in "${versions[@]}"; do
      for tier in "${TIERS[@]}"; do
        local bind
        bind="$(binding_name "$build_id" "$tier")"
        local dns_slug
        dns_slug="$(slugify "$build_id")"
        echo "[[services]]"
        echo "binding = \"${bind}\""
        echo "service = \"${WORKER_PREFIX}-v${dns_slug}-${tier}\""
        echo ""
      done
    done
  } > "$output_file"
}

# --- KV REST API helpers ---
kv_read_key() {
  local key="$1"
  local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}"
  local response http_code body

  response=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "$url")

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ -z "$http_code" ] || ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
    echo "ERROR: KV read failed — no HTTP response" >&2
    exit 1
  fi

  if [ "$http_code" -eq 404 ]; then
    echo '{"default":"","overrides":[],"activeVersions":[]}'
    return
  fi

  if [ "$http_code" -ne 200 ]; then
    echo "ERROR: KV read returned HTTP ${http_code}: $body" >&2
    exit 1
  fi

  echo "$body"
}

kv_read_config() { kv_read_key "config"; }

kv_write_key() {
  local key="$1"
  local config_json="$2"
  local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}"
  local response

  response=$(curl -sf -X PUT \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$config_json" \
    "$url") || { echo "ERROR: Failed to write KV key '${key}'" >&2; exit 1; }

  local success
  success=$(echo "$response" | jq -r '.success')
  if [ "$success" != "true" ]; then
    echo "ERROR: KV write failed: $response" >&2
    exit 1
  fi
}

kv_write_config() { kv_write_key "config" "$1"; }

kv_write_manifest() {
  local build_id="$1"
  local manifest_json="$2"
  kv_write_key "manifest:${build_id}" "$manifest_json"
}

kv_delete_key() {
  local key="$1"
  local url="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${key}"
  local response
  response=$(curl -sf -X DELETE \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "$url") || { echo "WARNING: Failed to delete KV key '${key}' (may not exist)" >&2; return 0; }
}

# --- Preview router config generation ---
gen_preview_router_config_kv() {
  local output_file="$1"
  local pr_number="$2"
  local kv_namespace_id="$3"
  shift 3
  local versions=("$@")

  {
    echo "# AUTO-GENERATED — do not edit manually"
    echo "name = \"accomplish-pr-${pr_number}-router\""
    echo 'main = "src/index.ts"'
    echo 'compatibility_date = "2024-12-01"'
    echo ""
    echo "[observability]"
    echo "enabled = true"
    echo ""
    echo "[[kv_namespaces]]"
    echo 'binding = "ROUTING_CONFIG"'
    echo "id = \"${kv_namespace_id}\""
    echo ""

    for build_id in "${versions[@]}"; do
      for tier in "${TIERS[@]}"; do
        local bind
        bind="$(binding_name "$build_id" "$tier")"
        local dns_slug
        dns_slug="$(slugify "$build_id")"
        echo "[[services]]"
        echo "binding = \"${bind}\""
        echo "service = \"${WORKER_PREFIX}-pr-${pr_number}-v${dns_slug}-${tier}\""
        echo ""
      done
    done

    echo "[vars]"
    echo "KV_CONFIG_KEY = \"config-pr-${pr_number}\""
  } > "$output_file"
}

# --- Build manifest generation ---
gen_manifest() {
  local build_id="$1"
  local version build_number git_sha timestamp

  build_number="${build_id##*-}"
  version="${build_id%-*}"
  git_sha=$(git rev-parse --short HEAD)
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local commits
  commits=$(git log -20 --format='%H%x1f%s%x1f%an%x1f%aI' | jq -R -s '
    split("\n") | map(select(length > 0) | split("\u001f")) |
    map({sha: .[0][0:7], message: .[1], author: .[2], date: .[3]})
  ')

  jq -n \
    --arg bid "$build_id" \
    --arg ver "$version" \
    --argjson bn "$build_number" \
    --arg sha "$git_sha" \
    --arg ts "$timestamp" \
    --argjson commits "$commits" \
    '{buildId:$bid, version:$ver, buildNumber:$bn, gitSha:$sha, timestamp:$ts, commits:$commits}'
}
