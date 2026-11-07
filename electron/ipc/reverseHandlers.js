import { ipcMain } from 'electron';
import {
  configureReverseBridgeHandlers,
  rejectReverseApproval,
  resolveReverseApproval,
  setMcpRoots,
} from '../../mcp/reverseBridge.js';
import { CHANNELS, fail, ok } from './channels.js';
import { UNTRUSTED_SENDER_CODE, isTrustedSender } from './senderGuard.js';

function handle(channel, code, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      return fail(new Error('Untrusted sender'), UNTRUSTED_SENDER_CODE);
    }
    try {
      return ok(await fn(...args));
    } catch (err) {
      return fail(err, code);
    }
  });
}

/**
 * @param {() => import('electron').BrowserWindow | null} getWindow
 */
export function registerReverseHandlers(getWindow) {
  function push(channel, payload) {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  configureReverseBridgeHandlers({
    pushPending: (payload) => push(CHANNELS.reversePending, payload),
    pushInbound: (entry) => push(CHANNELS.reverseInbound, entry),
  });

  handle(CHANNELS.reverseResolve, 'E_REVERSE_RESOLVE', (id, result) => {
    resolveReverseApproval(id, result);
    return true;
  });

  handle(CHANNELS.reverseReject, 'E_REVERSE_REJECT', (id, message) => {
    rejectReverseApproval(id, message);
    return true;
  });

  handle(CHANNELS.setMcpRoots, 'E_SET_MCP_ROOTS', (roots) => {
    setMcpRoots(roots);
    return true;
  });
}
