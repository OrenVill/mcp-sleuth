import type { UpdateHost } from '../types';

/**
 * The browser build has no update channel.
 *
 * It is served either by the Vite dev server or by the CLI's static server, and
 * both update through npm (`npm i -g @orenvill/mcp-sleuth@latest`) rather than
 * through a downloaded installer. So every read resolves null, which is what
 * makes the banner and the version pill vanish from this build without a single
 * `isDesktop` branch in the components.
 */
export const browserUpdateHost: UpdateHost = {
  async getStatus() {
    return null;
  },
  async check() {
    return null;
  },
  async setAutoCheck() {
    return null;
  },
  async skip() {
    return null;
  },
  async dismiss() {
    return null;
  },
  async openRelease() {
    /* nothing to open: no release was ever announced here */
  },
  onUpdateAvailable() {
    return () => {};
  },
};
