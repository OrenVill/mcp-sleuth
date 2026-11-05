import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerAuth } from '../../types';
import type { McpConnectOptions } from '../host/types';
import { transportUrlForServer } from '../host/browser/mcpBrowser';
import { createDetectiveOAuthProvider } from './provider';
import { createMcpOAuthFetch } from './fetchBridge';
import { writeOAuthSession } from './sessionRegistry';

export async function finishOAuthAuthorization(p: {
  serverId: string;
  url: string;
  auth: ServerAuth;
  proxyThroughLocal: boolean;
  options: McpConnectOptions;
  authorizationCode: string;
}): Promise<void> {
  let cur = p.auth;
  const pr = createDetectiveOAuthProvider(window.location.origin, {
    getAuth: () => cur,
    onSessionChange: (s) => {
      cur = { ...cur, oauth: s };
      writeOAuthSession(p.serverId, cur);
    },
    onRedirect: () => {},
  });
  const tr = new StreamableHTTPClientTransport(
    transportUrlForServer(p.url, p.proxyThroughLocal, undefined, p.options),
    { authProvider: pr, fetch: createMcpOAuthFetch() },
  );
  await tr.finishAuth(p.authorizationCode);
  await tr.close();
}
