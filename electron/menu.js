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

/**
 * True for the browser DevTools chords: F12 and Ctrl/Cmd+Shift+I.
 *
 * These are swallowed in the packaged app — it is an application, not a browser,
 * and DevTools is not part of its surface. They stay live under
 * `npm run electron:dev`, where MCP_EXPLORER_DEV_URL is set.
 */
export function isDevToolsShortcut(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.type === 'keyUp') return false;
  const key = typeof input.key === 'string' ? input.key.toUpperCase() : '';
  if (key === 'F12') return true;
  return key === 'I' && input.shift === true && (input.control === true || input.meta === true);
}

export function buildMenuTemplate(platform = process.platform, { devMode = false } = {}) {
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
        // DevTools is a browser affordance; it ships only in dev mode.
        ...(devMode ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
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

export function applyApplicationMenu(platform = process.platform, options = {}) {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(platform, options));
  Menu.setApplicationMenu(menu);
  return menu;
}
