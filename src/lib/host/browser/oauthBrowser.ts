import type { OAuthHost } from '../types';
import { MCP_OAUTH_PROXY_PATH } from '../../mcpOAuth/constants';

export const oauthBrowserHost: OAuthHost = {
  async fetch(target, init = {}) {
    const url = `${window.location.origin}${MCP_OAUTH_PROXY_PATH}?target=${encodeURIComponent(target)}`;
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers,
      body,
    };
  },
};
