#!/bin/bash
# Post-installation script for Linux (Debian/Ubuntu)
# Sets chrome-sandbox permissions and creates symlink

CHROME_SANDBOX="/opt/Accomplish/chrome-sandbox"
ACCOMPLISH_BIN="/opt/Accomplish/accomplish"
SYMLINK="/usr/bin/accomplish"

# Set chrome-sandbox permissions
if [ -f "$CHROME_SANDBOX" ]; then
    chmod 4755 "$CHROME_SANDBOX"
    echo "Set chrome-sandbox permissions to 4755"
fi

# Create symlink in /usr/bin
if [ -f "$ACCOMPLISH_BIN" ]; then
    ln -sf "$ACCOMPLISH_BIN" "$SYMLINK"
    echo "Created symlink: $SYMLINK -> $ACCOMPLISH_BIN"
fi
