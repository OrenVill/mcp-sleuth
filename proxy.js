import http from 'node:http';
import https from 'node:https';
import { setDefaultResultOrder } from 'node:dns';

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

const DEFAULT_ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'Mcp-Session-Id',
  'Mcp-Protocol-Version',
  'Last-Event-ID',
].join(', ');

const EXPOSE_HEADERS = [
  'Mcp-Session-Id',
  'Mcp-Protocol-Version',
].join(', ');

function corsHeaders(req) {
  const origin = req.headers.origin || '*';
  const requestedHeaders = req.headers['access-control-request-headers'];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': requestedHeaders || DEFAULT_ALLOW_HEADERS,
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    Vary: 'Origin',
  };
}

function filterRequestHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === 'origin' || key === 'referer') continue;
    if (key === 'accept-encoding') continue;
    out[k] = v;
  }
  return out;
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
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
  const target = parsed.searchParams.get('target');
  if (!target) {
    res.writeHead(400, {
      ...corsHeaders(req),
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
      ...corsHeaders(req),
      'Content-Type': 'text/plain; charset=utf-8',
    });
    res.end('Invalid target URL');
    return;
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    res.writeHead(400, {
      ...corsHeaders(req),
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
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, {
        ...filterResponseHeaders(upRes.headers),
        ...corsHeaders(req),
      });
      upRes.pipe(res);
      upRes.on('error', () => res.end());
    },
  );

  upstream.on('error', (err) => {
    const detail = err.code ? `${err.code} ${err.message}` : err.message;
    console.error(
      `[mcp-explorer] proxy upstream error for ${req.method} ${target}: ${detail}`,
    );
    if (!res.headersSent) {
      res.writeHead(502, {
        ...corsHeaders(req),
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    res.end(`Bad Gateway: ${detail}`);
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
