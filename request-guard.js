/**
 * Provenance checks shared by every endpoint the local server exposes.
 *
 * The local endpoints used to trust the socket address: a request arriving from
 * 127.0.0.1 was assumed to come from the app's own page. It is not. A request
 * the victim's own browser makes on behalf of any web page arrives from 127.0.0.1
 * too, so `evil.example` could drive the stdio bridge, the MCP proxy, the vault
 * file endpoint and app data. What actually distinguishes the app's page from a
 * hostile one is the browser-set provenance headers, plus the `Host` the request
 * was addressed to.
 *
 * Two independent checks, because neither is sufficient alone:
 *
 * - `isSameOriginRequest` reads `Sec-Fetch-Site` and `Origin`, which page script
 *   cannot forge. It fails closed when both are absent, so a browser without
 *   Fetch Metadata is not a bypass.
 * - `isAllowedHost` pins the `Host` header. DNS rebinding defeats the origin
 *   check by making the attacker's own name resolve to 127.0.0.1, at which point
 *   the browser genuinely labels the request same-origin. Rebinding always
 *   arrives under a domain name, so requiring an IP literal, `localhost`, or the
 *   name the server was bound to is what stops it.
 *
 * Zero dependencies, and no Node built-ins: this file is imported by the CLI
 * static server, the Vite dev middleware, and every endpoint handler.
 */

/** Set by an operator who fronts the app under a hostname, comma-separated. */
export function allowedHostsFromEnv(env = process.env) {
  return (env.MCP_SLEUTH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Splits `host:port`, tolerating a bracketed IPv6 literal. */
function splitHostHeader(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) return null;
    const hostname = trimmed.slice(1, end);
    const rest = trimmed.slice(end + 1);
    if (rest && !rest.startsWith(':')) return null;
    return { hostname, port: rest ? rest.slice(1) : '' };
  }
  const colon = trimmed.indexOf(':');
  if (colon === -1) return { hostname: trimmed, port: '' };
  if (trimmed.indexOf(':', colon + 1) !== -1) return null; // bare IPv6, no brackets
  return { hostname: trimmed.slice(0, colon), port: trimmed.slice(colon + 1) };
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** True for an address a DNS rebind cannot produce. */
function isIpLiteral(hostname) {
  if (IPV4.test(hostname)) return hostname.split('.').every((o) => Number(o) <= 255);
  // Anything containing a colon is an IPv6 literal; hex-and-colons only.
  return hostname.includes(':') && /^[0-9a-f:.]+$/.test(hostname);
}

/**
 * True when the request was addressed to this server rather than routed here by
 * a name the attacker controls.
 */
export function isAllowedHost(req, { host, port, allowedHosts = [] } = {}) {
  const parsed = splitHostHeader(req?.headers?.host);
  if (!parsed) return false;

  if (port !== undefined && port !== null && String(port).length > 0) {
    if (parsed.port !== String(port)) return false;
  }

  const { hostname } = parsed;
  if (hostname === 'localhost') return true;
  if (isIpLiteral(hostname)) return true;
  if (typeof host === 'string' && hostname === host.trim().toLowerCase()) return true;
  return allowedHosts.some((allowed) => hostname === allowed);
}

/**
 * True when the browser says the request came from this server's own page.
 *
 * `Sec-Fetch-Site` is set by the browser and page script cannot override it, so
 * an explicit `same-origin` is conclusive. When it is absent we require an
 * `Origin` matching `Host` instead; when both are absent the request is refused.
 */
export function isSameOriginRequest(req) {
  const headers = req?.headers ?? {};
  const site = headers['sec-fetch-site'];
  if (typeof site === 'string' && site.length > 0) {
    if (site !== 'same-origin') return false;
    return true;
  }

  const origin = headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) return false;
  const host = headers.host;
  if (typeof host !== 'string' || host.length === 0) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

function isJsonContentType(value) {
  if (typeof value !== 'string') return false;
  const type = value.split(';')[0].trim().toLowerCase();
  return type === 'application/json';
}

/**
 * The whole gate, in the order that produces the most useful rejection reason.
 *
 * `requireJson` is for endpoints that must never be reachable as a CORS simple
 * request: a `text/plain` POST is dispatched with no preflight, so demanding
 * `application/json` forces the browser to ask permission first.
 */
export function guardLocalRequest(req, options = {}) {
  if (!isAllowedHost(req, options)) return { ok: false, reason: 'host' };
  if (!isSameOriginRequest(req)) return { ok: false, reason: 'origin' };
  if (options.requireJson && !isJsonContentType(req?.headers?.['content-type'])) {
    return { ok: false, reason: 'content-type' };
  }
  return { ok: true };
}

/** The message sent to a refused caller. Deliberately says nothing specific. */
export const REFUSED_MESSAGE = 'Request refused: this endpoint is only for the Sleuth page itself';

/** Refuse a request that failed {@link guardLocalRequest}. */
export function refuseLocalRequest(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(REFUSED_MESSAGE);
}
