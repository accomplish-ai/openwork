# Maintainer: varshithm7x <m7xvoltx@gmail.com>
pkgname=accomplish-ai-bin
pkgver=0.3.8
pkgrel=2
pkgdesc="Open source AI desktop agent that automates file management, document creation, and browser tasks"
arch=('x86_64')
url="https://github.com/varshithm7x/accomplish"
license=('MIT')
depends=('gtk3' 'nss' 'libxss' 'libxtst' 'xdg-utils' 'libsecret' 'libnotify' 'at-spi2-core')
optdepends=(
  'libappindicator-gtk3: system tray support'
  'google-chrome: browser automation with Chrome'
  'chromium: browser automation with Chromium'
  'ollama: local AI model support'
)
provides=('accomplish-ai')
conflicts=('accomplish-ai')
options=('!strip')
source=("${pkgname}-${pkgver}.AppImage::https://github.com/varshithm7x/accomplish/releases/download/v${pkgver}-linux/Accomplish-${pkgver}-linux-x86_64.AppImage")
sha256sums=('SKIP')

prepare() {
  chmod +x "${srcdir}/${pkgname}-${pkgver}.AppImage"
  "${srcdir}/${pkgname}-${pkgver}.AppImage" --appimage-extract
}

package() {
  # Install the extracted AppImage contents
  install -dm755 "${pkgdir}/opt/${pkgname}"
  cp -r "${srcdir}/squashfs-root/"* "${pkgdir}/opt/${pkgname}/"

  # Fix permissions - squashfs extraction creates owner-only dirs
  find "${pkgdir}/opt/${pkgname}" -type d -exec chmod 755 {} +
  find "${pkgdir}/opt/${pkgname}" -type f -exec chmod 644 {} +
  find "${pkgdir}/opt/${pkgname}" -type f -name "*.so*" -exec chmod 755 {} +
  chmod 755 "${pkgdir}/opt/${pkgname}/@accomplishdesktop"
  chmod 755 "${pkgdir}/opt/${pkgname}/chrome_crashpad_handler"
  chmod 755 "${pkgdir}/opt/${pkgname}/chrome-sandbox"

  # Create launcher script (bypass AppRun which fails outside AppImage)
  install -dm755 "${pkgdir}/usr/bin"
  cat > "${pkgdir}/usr/bin/accomplish" << 'EOF'
#!/bin/bash
export APPDIR=/opt/accomplish-ai-bin
exec "$APPDIR/@accomplishdesktop" --no-sandbox "$@"
EOF
  chmod +x "${pkgdir}/usr/bin/accomplish"

  # Desktop file
  install -Dm644 /dev/stdin "${pkgdir}/usr/share/applications/accomplish.desktop" << EOF
[Desktop Entry]
Name=Accomplish
Comment=Open source AI desktop agent
Exec=/usr/bin/accomplish %U
Icon=accomplish
Terminal=false
Type=Application
Categories=Utility;Office;Productivity;
MimeType=x-scheme-handler/accomplish;
StartupWMClass=Accomplish
EOF

  # Icon
  install -Dm644 "${srcdir}/squashfs-root/resources/app.asar.unpacked/node_modules/opencode-linux-x64/bin/../../../dist-electron/main/../../resources/icon.png" \
    "${pkgdir}/usr/share/icons/hicolor/512x512/apps/accomplish.png" 2>/dev/null || \
  install -Dm644 "${srcdir}/squashfs-root/usr/share/icons/hicolor/1024x1024/apps/@accomplishdesktop.png" \
    "${pkgdir}/usr/share/icons/hicolor/512x512/apps/accomplish.png" 2>/dev/null || true

  # License
  install -Dm644 "${srcdir}/squashfs-root/LICENSE"* "${pkgdir}/usr/share/licenses/${pkgname}/LICENSE" 2>/dev/null || true
}
