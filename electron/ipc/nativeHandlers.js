import { dialog, ipcMain } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHANNELS, fail, ok } from './channels.js';

function handle(channel, code, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

export function registerNativeHandlers({ secrets, appData, getWindow }) {
  handle(CHANNELS.loadEnvelope, 'E_VAULT_READ', () => secrets.loadEnvelope());
  handle(CHANNELS.saveEnvelope, 'E_VAULT_WRITE', (envelope) => secrets.saveEnvelope(envelope));
  handle(CHANNELS.deleteEnvelope, 'E_VAULT_DELETE', () => secrets.deleteEnvelope());
  handle(CHANNELS.autoUnlockPassphrase, 'E_KEYCHAIN', () => secrets.getAutoUnlockPassphrase());

  handle(CHANNELS.readAppData, 'E_APPDATA_READ', () => appData.read());
  handle(CHANNELS.writeAppData, 'E_APPDATA_WRITE', (data) => appData.write(data));

  handle(CHANNELS.saveFile, 'E_SAVE_FILE', async (filename, content) => {
    // Playwright cannot drive a native dialog, so E2E writes to a fixed directory.
    const e2eDir = process.env.MCP_SLEUTH_E2E_SAVE_DIR;
    if (e2eDir) {
      const target = join(e2eDir, filename);
      await writeFile(target, content, 'utf8');
      return target;
    }

    const win = getWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: filename,
    });
    if (canceled || !filePath) return null;
    await writeFile(filePath, content, 'utf8');
    return filePath;
  });
}
