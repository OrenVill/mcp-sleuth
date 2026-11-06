export const MCP_OAUTH_PROXY_PATH = '/__mcp_oauth';
export const OAUTH_CALLBACK_PATH = '/oauth/callback';
export const OAUTH_FLOW_STORAGE_KEY = 'mcp-detective:oauth-flow';

import type { OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

export function oauthRedirectUrl(origin: string): string {
  return new URL(OAUTH_CALLBACK_PATH, origin).href;
}

export function clientMetadataForOrigin(origin: string): OAuthClientMetadata {
  return {
    client_name: 'MCP Detective',
    redirect_uris: [oauthRedirectUrl(origin)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}
