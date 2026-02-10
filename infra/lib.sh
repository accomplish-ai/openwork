#!/usr/bin/env bash

LIB_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_WEB_PKG="$LIB_REPO_ROOT/apps/web/package.json"

get_version() {
  node -p "JSON.parse(require('fs').readFileSync('$LIB_WEB_PKG','utf8')).version"
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

