/**
 * The application menu.
 *
 * Electron's default menu carries Reload and Force Reload. A reload tears down the
 * renderer, which drops every live MCP session, so this app defines its own menu
 * without them (window.js swallows the matching key chords too).
 *
 * The menu still has to exist: without it the standard Edit roles are unregistered
 * and copy/paste/undo stop working inside the app's inputs. `autoHideMenuBar` in
 * window.js keeps the bar itself invisible.
 *
 * There is deliberately no Preferences item — the app has no settings screen.
 */
import { Menu } from 'electron';

/**
 * True for the browser reload chords: F5, Ctrl/Cmd+R, Ctrl/Cmd+Shift+R.
 *
 * DevTools chords (F12, Ctrl+Shift+I) are intentionally *not* matched — they stay
 * reachable.
 */
export function isReloadShortcut(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.type === 'keyUp') return false;

  const key = typeof input.key === 'string' ? input.key : '';
  if (key.toUpperCase() === 'F5') return true;

  const modifier = input.control === true || input.meta === true;
  return modifier && key.toLowerCase() === 'r';
}

/** True for F12, which Electron does not bind by default. */
export function isDevToolsShortcut(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.type === 'keyUp') return false;
  // Holding the key must not toggle DevTools open and shut repeatedly.
  if (input.isAutoRepeat === true) return false;
  return typeof input.key === 'string' && input.key.toUpperCase() === 'F12';
}

export function buildMenuTemplate(platform = process.platform) {
  const isMac = platform === 'darwin';

  return [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [{ role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }]
          : [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
      ],
    },
    {
      label: 'View',
      // No Reload / Force Reload: see the file header.
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac
          ? [{ role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
  ];
}

export function applyApplicationMenu(platform = process.platform) {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(platform));
  Menu.setApplicationMenu(menu);
  return menu;
}
