import http from 'node:http';
import https from 'node:https';
import { setDefaultResultOrder } from 'node:dns';
import { allowedHostsFromEnv, guardLocalRequest, refuseLocalRequest } from './request-guard.js';

// Many local MCP servers bind only to 127.0.0.1, but on Linux Node's default
// DNS order can resolve "localhost" to ::1 first, producing ECONNREFUSED.
try {
  setDefaultResultOrder('ipv4first');
} catch {
  /* older Node — ignore */
}

export const PROXY_PATH = '/__mcp_proxy';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/**
 * No CORS headers are emitted, deliberately.
 *
 * This proxy used to reflect the caller's `Origin` into
 * `Access-Control-Allow-Origin` and echo its requested header list, which made
 * it a readable open proxy: any page in the user's browser could read the
 * response from a cloud metadata endpoint, a loopback service, or any host on
 * the daemon's LAN. Its only legitimate caller is Sleuth's own page, and a
 * same-origin request needs no CORS headers at all, so there are none to grant.
 * The provenance gate itself lives in request-guard.js.
 */
const NO_CORS = { Vary: 'Origin' };

function filterRequestHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === 'origin' || key === 'referer') continue;
    // Never forward the user's cookies for this origin to a third-party MCP
    // endpoint. llm-proxy.js has always stripped it; this one had not.
    if (key === 'cookie') continue;
    if (key === 'accept-encoding') continue;
    out[k] = v;
  }
  return out;
}

/**
 * Whether to accept a certificate no public CA signed, for this request.
 *
 * A development or intranet MCP endpoint commonly has a self-signed
 * certificate, and the browser cannot be told to accept one, so the decision
 * has to be made here where the upstream request is built. The page sets the
 * flag per server; nothing else can, because the provenance gate above admits
 * no other caller. Exactly `1`, so a stray truthy query value cannot disable
 * certificate checking by accident.
 */
export function tlsOptionsFor(searchParams) {
  return searchParams.get('insecureTls') === '1' ? { rejectUnauthorized: false } : {};
}

/** A target URL is loggable only without its query string: it can hold a token. */
export function safeTargetLabel(target) {
  try {
    const url = new URL(target);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '<unparseable target>';
  }
}

function filterResponseHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function handleMcpProxy(req, res) {
  // Self-gated as well as gated at dispatch: this handler forwards to any host
  // the caller names, so it must never be mountable without the check.
  const verdict = guardLocalRequest(req, { allowedHosts: allowedHostsFromEnv() });
  if (!verdict.ok) {
    console.error(`[mcp-sleuth] refused ${req.method} ${PROXY_PATH} (${verdict.reason})`);
    refuseLocalRequest(res);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, NO_CORS);
    res.end();
    return;
  }

  const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
  const target = parsed.searchParams.get('target');
  if (!target) {
    res.writeHead(400, {
      ...NO_CORS,
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Missing "target" query parameter');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, {
      ...NO_CORS,
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Invalid target URL');
    return;
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    res.writeHead(400, {
      ...NO_CORS,
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Only http and https targets are supported');
    return;
  }

  const lib = targetUrl.protocol === 'https:' ? https : http;
  const upstream = lib.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: filterRequestHeaders(req.headers),
      ...tlsOptionsFor(parsed.searchParams),
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, {
        ...filterResponseHeaders(upRes.headers),
        ...NO_CORS,
      });
      upRes.pipe(res);
      upRes.on('error', () => res.end());
    },
  );

  upstream.on('error', (err) => {
    const detail = err.code ? `${err.code} ${err.message}` : err.message;
    console.error(
      `[mcp-sleuth] proxy upstream error for ${req.method} ${safeTargetLabel(target)}: ${detail}`,
    );
    if (!res.headersSent) {
      res.writeHead(502, {
        ...NO_CORS,
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    res.end(`Bad Gateway: ${detail}`);
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
