import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInsecureFetch } from './insecureFetch.js';

const here = dirname(fileURLToPath(import.meta.url));
const tlsDir = join(here, '..', '..', 'tests', 'fixtures', 'tls');

/** The same self-signed pair the release fixtures use. */
const tls = {
  key: readFileSync(join(tlsDir, 'self-signed-key.pem')),
  cert: readFileSync(join(tlsDir, 'self-signed-cert.pem')),
};

let server;
let port;

beforeAll(async () => {
  server = createServer(tls, (req, res) => {
    if (req.url === '/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: one\n\n');
      res.end('data: two\n\n');
      return;
    }
    if (req.url === '/echo') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        res.writeHead(201, { 'Content-Type': 'application/json', 'X-Seen': req.method });
        res.end(Buffer.concat(chunks));
      });
      return;
    }
    if (req.url === '/empty') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterAll(() => server?.close());

describe('createInsecureFetch', () => {
  it('reaches a server whose certificate nothing signed', async () => {
    // The control: the platform fetch refuses this exact URL.
    await expect(fetch(`https://localhost:${port}/`)).rejects.toThrow();

    const insecure = createInsecureFetch('localhost');
    const res = await insecure(`https://localhost:${port}/`);
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe('ok');
  });

  it('refuses any other host, so a redirect cannot ride the waiver', async () => {
    const insecure = createInsecureFetch('localhost');
    await expect(insecure(`https://127.0.0.1:${port}/`)).rejects.toThrow(
      /Refusing to waive certificate checks for 127\.0\.0\.1/,
    );
  });

  it('refuses plain http', async () => {
    const insecure = createInsecureFetch('localhost');
    await expect(insecure('http://localhost/x')).rejects.toThrow(/https only/i);
  });

  it('sends method, headers and body through', async () => {
    const insecure = createInsecureFetch('localhost');
    const res = await insecure(`https://localhost:${port}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-seen')).toBe('POST');
    await expect(res.json()).resolves.toEqual({ hello: 'world' });
  });

  it('streams the body rather than buffering it', async () => {
    // MCP reads text/event-stream incrementally; a buffered body would hang.
    const insecure = createInsecureFetch('localhost');
    const res = await insecure(`https://localhost:${port}/stream`);
    expect(res.body).toBeTruthy();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    expect(text).toContain('data: one');
    expect(text).toContain('data: two');
  });

  it('handles a status that must not carry a body', async () => {
    const insecure = createInsecureFetch('localhost');
    const res = await insecure(`https://localhost:${port}/empty`);
    expect(res.status).toBe(204);
  });

  it('aborts an in-flight request when the signal fires', async () => {
    const insecure = createInsecureFetch('localhost');
    const controller = new AbortController();
    const pending = insecure(`https://localhost:${port}/stream`, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
