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

# --- Constants ---
WORKER_PREFIX="accomplish"
TIERS=("lite" "enterprise")
WORKERS_SUBDOMAIN="${CF_SUBDOMAIN:-}"

# --- Naming helpers ---
worker_name() { echo "${WORKER_PREFIX}-app-$1"; }
preview_worker_name() { echo "${WORKER_PREFIX}-pr-$1-$2"; }
slugify() { echo "$1" | tr '.+' '--'; }
slugify_binding() { echo "$1" | sed 's/[.\-]/_/g'; }
versioned_worker_name() { echo "${WORKER_PREFIX}-v$(slugify "$1")-$2"; }
binding_name() { echo "APP_V$(slugify_binding "$1")_$(echo "$2" | tr '[:lower:]' '[:upper:]')"; }

# --- R2 path helpers ---
r2_prod_prefix() { echo "builds/v$1-$2"; }
r2_preview_prefix() { echo "builds/pr-$1-$2"; }

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

# --- R2 operations (rclone) ---
rclone_upload_to_r2() {
  local source_dir="$1"
  local prefix="$2"
  local bucket="${R2_BUCKET:-accomplish-assets}"

  echo "Uploading to R2 via rclone: ${bucket}/${prefix}/"
  rclone copy "$source_dir" "R2:${bucket}/${prefix}/" \
    --s3-no-check-bucket \
    --transfers 8 \
    --checkers 16 \
    --fast-list \
    --verbose
  echo "Upload complete: ${prefix}/"
}

rclone_delete_r2_prefix() {
  local prefix="$1"
  local bucket="${R2_BUCKET:-accomplish-assets}"

  echo "Deleting R2 prefix via rclone: ${bucket}/${prefix}"
  local output
  if output=$(rclone purge "R2:${bucket}/${prefix}" 2>&1); then
    echo "Delete complete: ${prefix}"
  else
    if echo "$output" | grep -qiE "directory not found|not found|404"; then
      echo "Prefix ${prefix} does not exist, nothing to delete"
    else
      echo "WARNING: rclone purge failed for ${bucket}/${prefix}:"
      echo "$output"
    fi
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
