/**
 * Which frames may reach the main process.
 *
 * The IPC surface lets its caller name a command to spawn and a URL to fetch.
 * That is fine for Sleuth's own renderer, which is where the user's server
 * configuration lives, and not fine for anything else. A sandboxed preview frame
 * gets no preload and so cannot reach IPC at all today; this exists so that
 * stays true if the sandbox is ever relaxed, a second window is added, or a
 * webview appears.
 */
import { APP_ORIGIN } from '../protocol.js';
import { isTrustedSenderUrl } from './channels.js';

export const UNTRUSTED_SENDER_CODE = 'E_UNTRUSTED_SENDER';

export function isTrustedSender(event) {
  let url;
  try {
    // senderFrame throws once the frame is gone, which is itself untrusted.
    url = event?.senderFrame?.url;
  } catch {
    return false;
  }
  return isTrustedSenderUrl(url, {
    appOrigin: APP_ORIGIN,
    devUrl: process.env.MCP_SLEUTH_DEV_URL,
  });
}
