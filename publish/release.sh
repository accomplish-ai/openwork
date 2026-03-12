#!/bin/bash
set -e

VERSION="0.3.8"
APPIMAGE_PATH="$(dirname "$0")/../apps/desktop/release/Accomplish-${VERSION}-linux-x86_64.AppImage"
REPO="varshithm7x/accomplish"

echo "=== Publishing Accomplish ${VERSION} for Linux ==="

# Check prerequisites
if ! command -v gh &>/dev/null; then
  echo "Error: GitHub CLI (gh) not installed. Run: sudo pacman -S github-cli"
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: Not authenticated. Run: gh auth login"
  exit 1
fi

if [ ! -f "$APPIMAGE_PATH" ]; then
  echo "Error: AppImage not found at $APPIMAGE_PATH"
  exit 1
fi

echo ""
echo "AppImage: $APPIMAGE_PATH"
echo "Size: $(du -h "$APPIMAGE_PATH" | cut -f1)"
echo ""

# Generate SHA256
SHA256=$(sha256sum "$APPIMAGE_PATH" | cut -d' ' -f1)
echo "SHA256: $SHA256"

# Create release notes
RELEASE_NOTES=$(cat << EOF
## Accomplish ${VERSION} - Linux Port

Linux port of [Accomplish](https://github.com/accomplish-ai/accomplish), the open source AI desktop agent.

### Downloads
| Format | File |
|--------|------|
| AppImage (all distros) | \`Accomplish-${VERSION}-linux-x86_64.AppImage\` |

### Installation

**AppImage (Universal)**
\`\`\`bash
chmod +x Accomplish-${VERSION}-linux-x86_64.AppImage
./Accomplish-${VERSION}-linux-x86_64.AppImage
\`\`\`

**Arch Linux (AUR)**
\`\`\`bash
yay -S accomplish-ai-bin
# or
paru -S accomplish-ai-bin
\`\`\`

### Features
- Full feature parity with macOS/Windows builds
- AI task execution (OpenAI, Anthropic, Google, Ollama, etc.)
- File management and document creation
- Browser automation via Playwright
- MCP tools and custom skills
- Deep-link protocol support (\`accomplish://\`)

### System Requirements
- Linux x86_64 (tested on Arch Linux)
- GLIBC 2.17+ (virtually all modern distros)

### SHA256
\`\`\`
${SHA256}  Accomplish-${VERSION}-linux-x86_64.AppImage
\`\`\`

### Changes from upstream
Based on [accomplish-ai/accomplish](https://github.com/accomplish-ai/accomplish) with Linux platform support added across 8 files.
See [feat/linux-support](https://github.com/varshithm7x/accomplish/tree/feat/linux-support) branch for details.
EOF
)

echo ""
echo "Creating GitHub release v${VERSION}-linux..."
gh release create "v${VERSION}-linux" \
  "$APPIMAGE_PATH" \
  --repo "$REPO" \
  --title "Accomplish ${VERSION} - Linux" \
  --notes "$RELEASE_NOTES" \
  --latest

echo ""
echo "=== Release published! ==="
echo "https://github.com/${REPO}/releases/tag/v${VERSION}-linux"
echo ""
echo "Next steps:"
echo "  1. Update PKGBUILD sha256sums with: $SHA256"
echo "  2. Submit PKGBUILD to AUR: https://aur.archlinux.org"
echo "  3. Open PR to upstream: https://github.com/accomplish-ai/accomplish/compare/main...varshithm7x:accomplish:feat/linux-support"
