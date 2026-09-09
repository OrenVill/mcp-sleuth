/**
 * A `fetch` that will accept a certificate no CA signed, for named hosts only.
 *
 * A development or intranet MCP endpoint commonly has a self-signed
 * certificate. The browser build handles this in the local proxy, which builds
 * the upstream request itself. The desktop build has no proxy — MCP leaves the
 * main process directly — so the waiver has to be applied where that request is
 * made.
 *
 * Electron's `net.fetch` was the obvious candidate, since a session can carry a
 * certificate verify proc. It does not work: with a session passed to
 * `net.fetch` the proc is not consulted for the request and the fetch fails with
 * ERR_CERT_AUTHORITY_INVALID anyway. So the transport gets a small fetch built
 * on `node:https`, which does expose `rejectUnauthorized` per request. That is
 * the same knob `proxy.js` uses for the browser build, which also keeps the two
 * builds honest about meaning the same thing by it.
 *
 * Two limits keep this from becoming "TLS off":
 *
 * - It is handed only to the transports of servers the user explicitly ticked;
 *   every other connection uses the platform fetch, untouched.
 * - It refuses any host that is not the one it was created for, so a redirect
 *   to somewhere else cannot ride the waiver.
 *
 * Streaming matters here: MCP's streamable HTTP transport reads
 * `text/event-stream` responses incrementally, so the body is handed back as a
 * stream rather than buffered.
 */
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

/**
 * @param {string} allowedHost hostname whose certificate need not verify
 * @param {{ requestImpl?: typeof httpsRequest }} [deps]
 * @returns {(input: string | URL, init?: RequestInit) => Promise<Response>}
 */
export function createInsecureFetch(allowedHost, deps = {}) {
  const host = String(allowedHost).toLowerCase();
  const requestImpl = deps.requestImpl ?? httpsRequest;

  return function insecureFetch(input, init = {}) {
    const url = input instanceof URL ? input : new URL(String(input));

    if (url.protocol !== 'https:') {
      return Promise.reject(new Error('The self-signed waiver applies to https only'));
    }
    if (url.hostname.toLowerCase() !== host) {
      return Promise.reject(
        new Error(`Refusing to waive certificate checks for ${url.hostname}`),
      );
    }

    const headers = {};
    new Headers(init.headers ?? {}).forEach((value, key) => {
      headers[key] = value;
    });

    return new Promise((resolve, reject) => {
      const upstream = requestImpl(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: init.method ?? 'GET',
          headers,
          rejectUnauthorized: false,
        },
        (res) => {
          resolve(
            new Response(
              // 204 and 304 must not carry a body, and Response rejects one.
              res.statusCode === 204 || res.statusCode === 304
                ? null
                : Readable.toWeb(res),
              {
                status: res.statusCode ?? 502,
                statusText: res.statusMessage ?? '',
                headers: headersFrom(res.headers),
              },
            ),
          );
        },
      );

      upstream.on('error', reject);

      if (init.signal) {
        if (init.signal.aborted) upstream.destroy();
        else init.signal.addEventListener('abort', () => upstream.destroy(), { once: true });
      }

      if (init.body !== undefined && init.body !== null) {
        upstream.write(typeof init.body === 'string' ? init.body : Buffer.from(init.body));
      }
      upstream.end();
    });
  };
}

/** Node gives repeated headers as arrays; the web Headers API wants them joined. */
function headersFrom(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }
  return headers;
}
