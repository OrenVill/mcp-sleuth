#!/usr/bin/env node
/**
 * MCP fixture served over TLS with a certificate no CA signed.
 *
 * Exists for §3.29. A development or intranet MCP endpoint commonly has exactly
 * this kind of certificate, and Sleuth offers a per-server option to accept one.
 * Asserting that option needs a server that genuinely fails verification, which
 * a normal fixture does not.
 *
 * The key pair in tests/fixtures/tls/ is committed on purpose. It is a test
 * fixture, it is generated for `localhost`, and it protects nothing — treat it
 * as public, and never reuse it anywhere else.
 *
 * Serves `https://localhost:3004/mcp` (override with PORT or argv[2]).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { serveMcp } from './serve-mcp.mjs';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3004);
const here = dirname(fileURLToPath(import.meta.url));

function buildServer() {
  const server = new McpServer({ name: 'tls-sample-server', version: '1.0.0' });

  server.registerTool(
    'echo_secure',
    {
      description: 'Echo a message back, over TLS.',
      inputSchema: { message: z.string().describe('Text to echo') },
    },
    ({ message }) => ({ content: [{ type: 'text', text: `secure echo: ${message}` }] }),
  );

  return server;
}

serveMcp(buildServer, {
  port: PORT,
  label: 'https-mcp-fixture',
  tls: {
    key: readFileSync(join(here, 'tls', 'self-signed-key.pem')),
    cert: readFileSync(join(here, 'tls', 'self-signed-cert.pem')),
  },
});
