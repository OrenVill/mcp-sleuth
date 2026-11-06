#!/usr/bin/env node
/**
 * MCP server that exercises client-side reverse requests (elicitation) for §3.33.
 * Listens on http://127.0.0.1:3006/mcp
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { serveMcp } from './serve-mcp.mjs';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3006);

function buildServer() {
  const server = new McpServer({ name: 'reverse-sample-server', version: '1.0.0' });

  server.registerTool(
    'ask_confirm',
    {
      description: 'Ask the user to confirm via MCP elicitation before proceeding.',
      inputSchema: { step: z.string().describe('Label for the confirmation step') },
    },
    async ({ step }, extra) => {
      const result = await extra.elicitInput({
        message: `Confirm step: ${step}?`,
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: { type: 'boolean', description: 'Proceed with this step' },
          },
          required: ['confirm'],
        },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  );

  return server;
}

serveMcp(buildServer, { port: PORT, label: 'reverse-mcp-server' });
