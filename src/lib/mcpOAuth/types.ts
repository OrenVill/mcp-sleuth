import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { ServerOAuthSession } from '../../types';

export interface PendingOAuthFlow {
  serverId: string;
  mcpServerUrl: string;
  proxyThroughLocal: boolean;
  allowSelfSigned: boolean;
  state: string;
  returnPath: string;
}

export function tokensFromOAuthSession(s?: ServerOAuthSession) {
  if (!s?.accessToken) return undefined;
  return {
    access_token: s.accessToken,
    refresh_token: s.refreshToken,
    token_type: s.tokenType ?? 'Bearer',
    scope: s.scope,
  };
}

export function clientInformationFromSession(s?: ServerOAuthSession) {
  if (!s?.clientId) return undefined;
  return { client_id: s.clientId, client_secret: s.clientSecret };
}

export function discoveryStateFromSession(s?: ServerOAuthSession): OAuthDiscoveryState | undefined {
  if (!s?.discovery) return undefined;
  return s.discovery as unknown as OAuthDiscoveryState;
}

export function mergeTokensIntoSession(
  s: ServerOAuthSession | undefined,
  t: OAuthTokens,
): ServerOAuthSession {
  return {
    ...s,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? s?.refreshToken,
    tokenType: t.token_type,
    scope: t.scope ?? s?.scope,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : s?.expiresAt,
  };
}

export function mergeClientIntoSession(
  s: ServerOAuthSession | undefined,
  c: OAuthClientInformationMixed,
): ServerOAuthSession {
  return {
    ...s,
    clientId: c.client_id,
    clientSecret: 'client_secret' in c ? c.client_secret : s?.clientSecret,
  };
}

export function mergeDiscoveryIntoSession(
  s: ServerOAuthSession | undefined,
  d: OAuthDiscoveryState,
): ServerOAuthSession {
  return { ...s, discovery: { ...d } as Record<string, unknown> };
}
