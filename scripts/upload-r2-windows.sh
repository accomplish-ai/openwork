#!/usr/bin/env bash
set -e

BASE_VERSION="${BASE_VERSION:-}"
RELEASE_SUFFIX="${RELEASE_SUFFIX:-}"
TIER="${TIER:-lite}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
R2_BUCKET_NAME="${R2_BUCKET_NAME:-}"
UPDATE_MANIFEST="${UPDATE_MANIFEST:-true}"

if [[ -z "$BASE_VERSION" ]]; then
  echo "Error: BASE_VERSION is required"
  exit 1
fi

if [[ -z "$CLOUDFLARE_ACCOUNT_ID" || -z "$R2_BUCKET_NAME" ]]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID and R2_BUCKET_NAME are required"
  exit 1
fi

VERSION="${BASE_VERSION}${RELEASE_SUFFIX}"
BASE_URL="https://downloads.openwork.me/downloads/${VERSION}/windows"
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
BUCKET="${R2_BUCKET_NAME}"

if [[ "$TIER" == "enterprise" ]]; then
  MANIFEST_NAME="latest-win-enterprise.yml"
else
  MANIFEST_NAME="latest-win.yml"
fi

if [[ -n "$RELEASE_SUFFIX" ]]; then
  MANIFEST_FOLDER="${RELEASE_SUFFIX#-}"
  MANIFEST_PATH="${MANIFEST_FOLDER}/${MANIFEST_NAME}"
else
  MANIFEST_PATH="${MANIFEST_NAME}"
fi

# Find Windows EXE installer
shopt -s nullglob
EXE_FILES=(./release/win/*.exe)
shopt -u nullglob

if [[ ${#EXE_FILES[@]} -eq 0 ]]; then
  echo "Error: Missing Windows EXE installer"
  ls -la ./release/win/ || true
  exit 1
fi

if [[ ${#EXE_FILES[@]} -gt 1 ]]; then
  echo "Error: Multiple Windows EXE installers found:"
  printf ' - %s\n' "${EXE_FILES[@]}"
  exit 1
fi

EXE_FILE="${EXE_FILES[0]}"

echo "Uploading Windows installer..."
aws s3 cp "$EXE_FILE" "s3://${BUCKET}/downloads/${VERSION}/windows/$(basename "$EXE_FILE")" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/octet-stream \
  --cache-control "public, max-age=31536000, immutable"

# Calculate SHA512 and size for manifest
EXE_SIZE=$(stat -c%s "$EXE_FILE" 2>/dev/null || stat -f%z "$EXE_FILE")
EXE_SHA512=$(sha512sum "$EXE_FILE" 2>/dev/null | cut -d' ' -f1 || shasum -a 512 "$EXE_FILE" | cut -d' ' -f1)
EXE_FILENAME=$(basename "$EXE_FILE")

# Generate manifest
cat > ./release/win/${MANIFEST_NAME} << EOF_MANIFEST
version: ${VERSION}
files:
  - url: ${BASE_URL}/${EXE_FILENAME}
    sha512: ${EXE_SHA512}
    size: ${EXE_SIZE}
path: ${BASE_URL}/${EXE_FILENAME}
sha512: ${EXE_SHA512}
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF_MANIFEST

echo "Generated ${MANIFEST_NAME}:"
cat ./release/win/${MANIFEST_NAME}

# Upload manifest with short cache (if enabled)
if [[ "$UPDATE_MANIFEST" == "true" ]]; then
  echo "Uploading manifest to ${MANIFEST_PATH}..."
  aws s3 cp ./release/win/${MANIFEST_NAME} "s3://${BUCKET}/${MANIFEST_PATH}" \
    --endpoint-url "$R2_ENDPOINT" \
    --content-type text/yaml \
    --cache-control "public, max-age=300"
else
  echo "Skipping manifest upload (UPDATE_MANIFEST=$UPDATE_MANIFEST)"
fi
