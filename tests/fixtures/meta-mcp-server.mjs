#!/usr/bin/env node
/**
 * Meta-tool MCP fixture for the Playwright release suite.
 *
 * Serves `http://localhost:3002/mcp` (override with PORT or argv[2]).
 *
 * Stands in for the unified-mcp server from OrenVill/awesome-mcp-servers, which
 * specs §3.6 and §3.12 previously reached over the LAN at a hardcoded IP. That
 * made the release gate unrunnable by anyone else and impossible in CI. This
 * reproduces only the shapes those specs need, deterministically and offline:
 *
 *   - §3.6 needs a tool with a boolean parameter (`get_current_weather`).
 *   - §3.12 needs a meta-tool that triggers discovery (`search_tools`, which
 *     `detect.ts` scores as kind `search`) plus a proxy invoker
 *     (`execute_tools`, kind `proxy_invoke`), and tools that only discovery
 *     surfaces.
 *
 * To test against the real thing instead, run unified-mcp from that repo and
 * point AWESOME_URL at it — see tests/release/helpers.ts.
 *
 * IMPORTANT: no name or description here may contain "Fixture" or
 * "awesome-mcp-servers". helpers.ts locates server rows with a case-insensitive
 * substring match, so either would cause a strict-mode violation.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { serveMcp } from './serve-mcp.mjs';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3002);

/** Tools only reachable through `search_tools` — what discovery is meant to find. */
const CATALOGUE = [
  {
    name: 'get_country',
    description: 'Look up a country by name or alpha-2/alpha-3 code.',
    inputSchema: {
      type: 'object',
      properties: { nameOrCode: { type: 'string', description: 'Country name or code' } },
      required: ['nameOrCode'],
    },
  },
  {
    name: 'search_wikipedia',
    description: 'Search Wikipedia and return matching article summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Maximum results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_top_stories',
    description: 'Load the current Hacker News front page.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number' } },
    },
  },
  {
    name: 'find_synonyms',
    description: 'Find synonyms for a word.',
    inputSchema: {
      type: 'object',
      properties: { word: { type: 'string' } },
      required: ['word'],
    },
  },
];

function buildServer() {
  const server = new McpServer({ name: 'meta-sample-server', version: '1.0.0' });

  // §3.6: the boolean-parameter tool.
  server.registerTool(
    'get_current_weather',
    {
      description: 'Fetch the current weather for a city, optionally with a forecast.',
      inputSchema: {
        city: z.string().describe('City name'),
        include_forecast: z.boolean().optional().describe('Include a multi-day forecast'),
        units: z.enum(['metric', 'imperial']).optional().describe('Unit system'),
      },
    },
    async ({ city, include_forecast, units }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              city,
              units: units ?? 'metric',
              temperature: 21,
              conditions: 'clear',
              forecast: include_forecast ? [{ day: 1, high: 23, low: 14 }] : undefined,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // §3.12: the meta-tool. `parse.ts` reads a JSON payload with a `tools` array.
  server.registerTool(
    'search_tools',
    {
      description: 'Search the available tools and return their definitions.',
      inputSchema: { query: z.string().optional().describe('Substring to match') },
    },
    async ({ query }) => {
      const needle = (query ?? '').trim().toLowerCase();
      const matches = needle
        ? CATALOGUE.filter(
            (t) =>
              t.name.toLowerCase().includes(needle) ||
              t.description.toLowerCase().includes(needle),
          )
        : CATALOGUE;
      return { content: [{ type: 'text', text: JSON.stringify({ tools: matches }, null, 2) }] };
    },
  );

  // The proxy invoker discovery routes calls through.
  server.registerTool(
    'execute_tools',
    {
      description: 'Execute one of the discovered tools by name.',
      inputSchema: {
        tool: z.string().describe('Name of the tool to run'),
        arguments: z.record(z.string(), z.unknown()).optional().describe('Arguments to pass'),
      },
    },
    async ({ tool, arguments: args }) => {
      const known = CATALOGUE.some((t) => t.name === tool);
      return {
        content: [
          {
            type: 'text',
            text: known
              ? JSON.stringify({ tool, arguments: args ?? {}, result: 'ok' }, null, 2)
              : `Unknown tool: ${tool}`,
          },
        ],
        isError: !known,
      };
    },
  );

  return server;
}

serveMcp(buildServer, { port: PORT, label: 'meta-mcp-fixture' });
