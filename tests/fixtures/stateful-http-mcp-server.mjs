#!/usr/bin/env node
/**
 * Stateful Streamable HTTP MCP fixture for session-recovery tests.
 *
 * Serves `http://127.0.0.1:3005/mcp`. POST `/__restart` clears in-memory sessions.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { serveStatefulMcp } from './serve-mcp.mjs';

const PORT = Number(process.argv[2] ?? process.env.STATEFUL_MCP_PORT ?? 3005);

function buildServer() {
  const server = new McpServer({ name: 'stateful-sample-server', version: '1.0.0' });

  server.registerTool(
    'echo_text',
    {
      description: 'Echo the supplied message back as plain text.',
      inputSchema: { message: z.string().describe('Text to echo back') },
    },
    async ({ message }) => ({
      content: [{ type: 'text', text: String(message) }],
    }),
  );

  return server;
}

serveStatefulMcp(buildServer, {
  port: PORT,
  host: '127.0.0.1',
  label: 'Stateful MCP sample',
});
