#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

const server = new McpServer({ name: 'stdio-fixture', version: '1.0.0' });

server.registerTool(
  'echo',
  {
    description: 'Echo text',
    inputSchema: { message: z.string() },
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }),
);

server.registerTool(
  'env_value',
  {
    description: 'Return the value of an environment variable this process was spawned with',
    inputSchema: { name: z.string() },
  },
  async ({ name }) => ({
    content: [{ type: 'text', text: process.env[name] ?? '' }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
