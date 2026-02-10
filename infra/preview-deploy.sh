#!/usr/bin/env bash
set -euo pipefail

# Usage: ./preview-deploy.sh <pr-number>
PR_NUMBER="${1:?Usage: preview-deploy.sh <pr-number>}"
[[ "$PR_NUMBER" =~ ^[0-9]+$ ]] || { echo "ERROR: PR number must be numeric"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/apps/web/dist"
PREVIEW_CONFIG="$SCRIPT_DIR/app/wrangler.preview-pr-${PR_NUMBER}.toml"

echo "Deploying PR preview: #${PR_NUMBER}"

# 1. Build the web app
echo "Building web app..."
(cd "$REPO_ROOT" && pnpm build:web)

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR does not exist after build"
  exit 1
fi

# 2. Upload to R2 under pr-{number}/ prefix
PREFIX="builds/pr-${PR_NUMBER}"
echo "Uploading to R2 prefix: $PREFIX/"

find "$DIST_DIR" -type f | while read -r file; do
  relative="${file#$DIST_DIR/}"
  key="${PREFIX}/${relative}"

  ct="application/octet-stream"
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

# 3. Generate wrangler config from template
sed "s/PLACEHOLDER/${PR_NUMBER}/g" "$SCRIPT_DIR/app/wrangler.preview.toml" > "$PREVIEW_CONFIG"

# 4. Deploy preview worker
echo "Deploying preview worker: accomplish-pr-${PR_NUMBER}..."
(cd "$SCRIPT_DIR/app" && npx wrangler deploy --config "wrangler.preview-pr-${PR_NUMBER}.toml")

# 5. Clean up generated config
rm -f "$PREVIEW_CONFIG"

echo "Preview deployed!"
echo "URL: https://accomplish-pr-${PR_NUMBER}.accomplish.workers.dev"
