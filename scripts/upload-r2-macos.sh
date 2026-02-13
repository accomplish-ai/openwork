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
BASE_URL="https://downloads.openwork.me/downloads/${VERSION}/macos"
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
BUCKET="${R2_BUCKET_NAME}"

if [[ "$TIER" == "enterprise" ]]; then
  MANIFEST_NAME="latest-mac-enterprise.yml"
else
  MANIFEST_NAME="latest-mac.yml"
fi

if [[ -n "$RELEASE_SUFFIX" ]]; then
  MANIFEST_FOLDER="${RELEASE_SUFFIX#-}"
  MANIFEST_PATH="${MANIFEST_FOLDER}/${MANIFEST_NAME}"
else
  MANIFEST_PATH="${MANIFEST_NAME}"
fi

shopt -s nullglob
ARM64_ZIP_FILES=(./release/mac/*-arm64.zip)
X64_ZIP_FILES=(./release/mac/*-x64.zip)
ARM64_DMG_FILES=(./release/mac/*-arm64.dmg)
X64_DMG_FILES=(./release/mac/*-x64.dmg)
shopt -u nullglob

if [[ ${#ARM64_ZIP_FILES[@]} -eq 0 || ${#X64_ZIP_FILES[@]} -eq 0 || ${#ARM64_DMG_FILES[@]} -eq 0 || ${#X64_DMG_FILES[@]} -eq 0 ]]; then
  echo "Error: Missing required build artifacts"
  echo "ARM64_ZIP: found ${#ARM64_ZIP_FILES[@]} files"
  echo "X64_ZIP: found ${#X64_ZIP_FILES[@]} files"
  echo "ARM64_DMG: found ${#ARM64_DMG_FILES[@]} files"
  echo "X64_DMG: found ${#X64_DMG_FILES[@]} files"
  ls -la ./release/mac/ || true
  exit 1
fi

ARM64_ZIP="${ARM64_ZIP_FILES[0]}"
X64_ZIP="${X64_ZIP_FILES[0]}"
ARM64_DMG="${ARM64_DMG_FILES[0]}"
X64_DMG="${X64_DMG_FILES[0]}"

aws s3 cp "$ARM64_ZIP" "s3://${BUCKET}/downloads/${VERSION}/macos/$(basename "$ARM64_ZIP")" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/zip \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp "$X64_ZIP" "s3://${BUCKET}/downloads/${VERSION}/macos/$(basename "$X64_ZIP")" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/zip \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp "$ARM64_DMG" "s3://${BUCKET}/downloads/${VERSION}/macos/$(basename "$ARM64_DMG")" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/octet-stream \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp "$X64_DMG" "s3://${BUCKET}/downloads/${VERSION}/macos/$(basename "$X64_DMG")" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type application/octet-stream \
  --cache-control "public, max-age=31536000, immutable"

ARM64_SIZE=$(stat -c%s "$ARM64_ZIP" 2>/dev/null || stat -f%z "$ARM64_ZIP")
ARM64_SHA512=$(sha512sum "$ARM64_ZIP" | cut -d' ' -f1)
ARM64_FILENAME=$(basename "$ARM64_ZIP")

X64_SIZE=$(stat -c%s "$X64_ZIP" 2>/dev/null || stat -f%z "$X64_ZIP")
X64_SHA512=$(sha512sum "$X64_ZIP" | cut -d' ' -f1)
X64_FILENAME=$(basename "$X64_ZIP")

cat > ./release/mac/${MANIFEST_NAME} << EOF_MANIFEST
version: ${VERSION}
files:
  - url: ${BASE_URL}/${ARM64_FILENAME}
    sha512: ${ARM64_SHA512}
    size: ${ARM64_SIZE}
    arch: arm64
  - url: ${BASE_URL}/${X64_FILENAME}
    sha512: ${X64_SHA512}
    size: ${X64_SIZE}
    arch: x64
path: ${BASE_URL}/${ARM64_FILENAME}
sha512: ${ARM64_SHA512}
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF_MANIFEST

echo "Generated ${MANIFEST_NAME}:"
cat ./release/mac/${MANIFEST_NAME}

if [[ "$UPDATE_MANIFEST" == "true" ]]; then
  echo "Uploading manifest to ${MANIFEST_PATH}..."
  aws s3 cp ./release/mac/${MANIFEST_NAME} "s3://${BUCKET}/${MANIFEST_PATH}" \
    --endpoint-url "$R2_ENDPOINT" \
    --content-type text/yaml \
    --cache-control "public, max-age=300"
else
  echo "Skipping manifest upload (UPDATE_MANIFEST=$UPDATE_MANIFEST)"
fi
