import { spawn } from 'node:child_process';
import { shell } from 'electron';

/**
 * Only http(s) may be handed to the OS.
 *
 * Link targets can originate from an untrusted MCP server's tool descriptions,
 * markdown, or resources. Passing an arbitrary scheme to the shell would let a
 * server ask the OS to open `file://`, `smb://`, or a registered custom handler.
 */
export function isSafeExternalUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** WSL's xdg-open resolves to a Linux browser, not the user's Windows default. */
export function isWsl(env = process.env) {
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
}

/**
 * Open a link in the user's real browser.
 *
 * Mirrors the CLI's `openBrowser` in bin/mcp-sleuth.js, which already handles
 * the WSL case the same way.
 */
export function openExternalUrl(url, { env = process.env } = {}) {
  if (!isSafeExternalUrl(url)) return false;

  if (isWsl(env)) {
    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`],
        { stdio: 'ignore', detached: true },
      );
      child.on('error', () => {});
      child.unref();
      return true;
    } catch {
      /* fall through to Electron's own handling */
    }
  }

  void shell.openExternal(url);
  return true;
}
