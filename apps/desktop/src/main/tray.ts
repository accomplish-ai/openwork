import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'path';

let tray: Tray | null = null;
let getActiveTaskCount: (() => number) | null = null;
let getWindow: (() => BrowserWindow | null) | null = null;

function getTrayIcon(): Electron.NativeImage {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, iconFile)
    : path.join(app.getAppPath(), 'resources', iconFile);

  const icon = nativeImage.createFromPath(iconPath);

  if (process.platform === 'darwin' && !icon.isEmpty()) {
    // Resize to template icon size (22x22) for macOS menu bar
    return icon.resize({ width: 22, height: 22 });
  }

  return icon;
}

function buildContextMenu(): Electron.Menu {
  const win = getWindow?.();
  const taskCount = getActiveTaskCount?.() ?? 0;
  const isVisible = win && !win.isMinimized() && win.isVisible();

  const menuItems: Electron.MenuItemConstructorOptions[] = [];

  if (taskCount > 0) {
    menuItems.push({
      label: `${taskCount} task${taskCount === 1 ? '' : 's'} running`,
      enabled: false,
    });
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({
    label: isVisible ? 'Hide Accomplish' : 'Show Accomplish',
    click: () => {
      const w = getWindow?.();
      if (!w) {
        return;
      }
      if (isVisible) {
        w.hide();
      } else {
        w.show();
        w.focus();
      }
    },
  });

  menuItems.push({ type: 'separator' });

  menuItems.push({
    label: 'Quit Accomplish',
    click: () => {
      app.quit();
    },
  });

  return Menu.buildFromTemplate(menuItems);
}

export function initTray(opts: {
  getWindow: () => BrowserWindow | null;
  getActiveTaskCount: () => number;
}): void {
  if (tray) {
    return;
  }

  getWindow = opts.getWindow;
  getActiveTaskCount = opts.getActiveTaskCount;

  const icon = getTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Accomplish');
  tray.setContextMenu(buildContextMenu());

  // Left-click on macOS shows the context menu; on Windows show/hide window
  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      const win = getWindow?.();
      if (!win) {
        return;
      }
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    }
  });

  // Rebuild menu when tray is right-clicked (refreshes task count)
  tray.on('right-click', () => {
    tray?.setContextMenu(buildContextMenu());
  });
}

export function updateTray(): void {
  if (!tray) {
    return;
  }
  tray.setContextMenu(buildContextMenu());
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function isTrayInitialized(): boolean {
  return tray !== null;
}
