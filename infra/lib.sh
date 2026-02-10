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
WORKERS_SUBDOMAIN="${CF_SUBDOMAIN:-accomplish}"

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

# --- JSON parsing (for Cloudflare API responses) ---
parse_json() {
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const p=JSON.parse(d);
      const expr=(${1});
      if(Array.isArray(expr)) expr.forEach(x=>console.log(x));
      else if(expr) console.log(expr);
    });
  "
}
