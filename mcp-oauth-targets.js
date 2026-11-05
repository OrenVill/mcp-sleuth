const WELL_KNOWN_PREFIXES = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
];
const TOKEN_SUFFIXES = ['/token', '/access_token', '/register', '/revoke', '/introspect'];

function ok(pathname) {
  const l = (pathname || '/').toLowerCase();
  if (WELL_KNOWN_PREFIXES.some((p) => l === p || l.startsWith(`${p}/`))) {
    return true;
  }
  return TOKEN_SUFFIXES.some((s) => l.endsWith(s));
}

export function isAllowedOAuthTarget(u) {
  return u instanceof URL && (u.protocol === 'http:' || u.protocol === 'https:') && ok(u.pathname);
}

export function requireAllowedOAuthTarget(s) {
  const u = new URL(s);
  if (!isAllowedOAuthTarget(u)) throw new Error('OAuth target path is not permitted');
  return u;
}
