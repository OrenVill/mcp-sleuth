import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { getHost } from '../host';
import { MCP_OAUTH_PROXY_PATH } from './constants';

export function createMcpOAuthFetch(): FetchLike {
  return getHost().kind === 'electron'
    ? async (input, init) => {
        const target = typeof input === 'string' ? input : input.href;
        const headers: Record<string, string> = {};
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => {
            headers[key] = value;
          });
        }
        let body: string | undefined;
        if (init?.body != null) {
          body =
            typeof init.body === 'string' ? init.body : await new Response(init.body).text();
        }
        const oauth = getHost().oauth;
        if (!oauth) throw new Error('OAuth host is not available');
        const result = await oauth.fetch(target, {
          method: init?.method ?? 'GET',
          headers,
          body,
        });
        return new Response(result.body, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers,
        });
      }
    : async (input, init) =>
        fetch(
          `${window.location.origin}${MCP_OAUTH_PROXY_PATH}?target=${encodeURIComponent(typeof input === 'string' ? input : input.href)}`,
          init,
        );
}
