import { app, Menu, shell } from 'electron';
import { checkForUpdates, getUpdateState, quitAndInstall, setOnUpdateDownloaded } from './updater';

export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const { updateAvailable, downloadedVersion } = getUpdateState();

  const updateMenuItem: Electron.MenuItemConstructorOptions = updateAvailable && downloadedVersion
    ? { label: `Restart to Update (v${downloadedVersion})...`, click: () => quitAndInstall() }
    : { label: 'Check for Updates...', click: () => checkForUpdates(false) };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        updateMenuItem,
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [{ role: 'close' as const }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        ...(!isMac ? [updateMenuItem, { type: 'separator' as const }] : []),
        { label: 'Learn More', click: () => shell.openExternal('https://accomplish.ai') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function refreshAppMenu(): void { buildAppMenu(); }

export function initMenu(): void {
  buildAppMenu();
  setOnUpdateDownloaded(() => refreshAppMenu());
}
