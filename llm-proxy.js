import http from 'node:http';
import https from 'node:https';
import { isSameOriginRequest } from './request-guard.js';
import { isAllowedTarget } from './llm-targets.js';

export const LLM_PROXY_PATH = '/__llm_proxy';

/**
 * Deliberately narrower than proxy.js. That one forwards to any MCP endpoint the
 * user configured; this one would otherwise be a general-purpose relay reachable
 * from any page the browser has open. Constraining the path to endpoints a
 * provider actually exposes keeps it a forwarder.
 *
 * The host is intentionally unconstrained: Ollama, LM Studio, vLLM and every
 * other self-hosted OpenAI-compatible server lives on an arbitrary host.
 */
/** The allowlist itself lives in llm-targets.js, shared with the desktop build. */

/** Headers we never forward upstream. */
const STRIPPED = new Set([
  'host',
  'connection',
  'content-length',
  'origin',
  'referer',
  'cookie',
]);

export function isLlmProxyRequest(url) {
  return url === LLM_PROXY_PATH || url.startsWith(`${LLM_PROXY_PATH}?`);
}

/**
 * Closes the localhost-service vector: any page the user has open could
 * otherwise issue a blind cross-origin POST to this endpoint (a simple
 * content-type dodges preflight, and we send no CORS headers to stop it),
 * reaching internal hosts at allowlisted paths.
 *
 * This used to allow a request carrying neither `Sec-Fetch-Site` nor `Origin`,
 * on the grounds that only non-browser clients omit both. A cross-origin
 * no-cors GET omits both too on any engine predating Fetch Metadata, which made
 * the gate a blind SSRF. It now fails closed; see request-guard.js.
 */
export { isSameOriginRequest };

export { isAllowedTarget };

function reject(res, message) {
  res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function forwardHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (STRIPPED.has(key.toLowerCase())) continue;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function handleLlmProxy(req, res) {
  return new Promise((resolve) => {
    if (!isSameOriginRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Cross-origin requests are not accepted');
      resolve();
      return;
    }

    const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
    const provider = parsed.searchParams.get('provider');
    const target = parsed.searchParams.get('target');

    if (!provider) {
      reject(res, 'Missing "provider" query parameter');
      resolve();
      return;
    }
    if (!target) {
      reject(res, 'Missing "target" query parameter');
      resolve();
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      reject(res, 'Invalid target URL');
      resolve();
      return;
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      reject(res, 'Only http and https targets are supported');
      resolve();
      return;
    }
    if (!isAllowedTarget(provider, targetUrl)) {
      reject(res, 'Target is not a recognised endpoint for this provider');
      resolve();
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
        headers: forwardHeaders(req.headers),
      },
      (upstreamRes) => {
        // Bodies are never logged: they carry the API key's traffic and the raw
        // output of the server under investigation.
        res.writeHead(upstreamRes.statusCode ?? 502, {
          'Content-Type': upstreamRes.headers['content-type'] ?? 'application/json',
          'Cache-Control': 'no-store',
        });
        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
      },
    );

    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end(`Upstream request failed: ${err.message}`);
      resolve();
    });

    req.pipe(upstream);
  });
}
