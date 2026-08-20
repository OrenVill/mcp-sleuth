#!/usr/bin/env node
/**
 * Streamable-HTTP MCP fixture server for the Playwright release suite.
 *
 * Serves `http://localhost:3001/mcp` (override with PORT or argv[2]).
 *
 * The tool/resource/prompt set here is not arbitrary — it is the minimum that
 * satisfies `tests/release/`:
 *   - §3.6 needs one tool each exposing a string, number, enum, and object param.
 *   - §3.7 invokes the *first* registered tool and expects a markdown result,
 *     so `echo_markdown` must stay first and must take only string params.
 *   - §3.7/§3.13 need a resource whose list entry matches /html/i.
 *   - §3.22 (Permission Surface) needs tools that infer filesystem, network,
 *     and shell risk.
 *
 * Stateless mode (`sessionIdGenerator: undefined`): a fresh server+transport per
 * request, so there is no session state to leak between specs.
 *
 * IMPORTANT: no tool, resource, or prompt name/description may contain the word
 * "fixture". `helpers.ts` locates the server row with
 * `locator('aside li').filter({ hasText: 'Fixture' })`, and Playwright's hasText
 * is a case-insensitive substring match — so any list entry containing it causes
 * a strict-mode violation against the server row. Use "sample" instead.
 */
import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';

const HTML_DOC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sample page</title></head>
<body><h1>Sample HTML resource</h1><p>Rendered inside the preview iframe.</p></body></html>`;

const MARKDOWN_DOC = `# Sample readme

This is a **markdown** resource used by the release suite.

- first item
- second item
`;

const SVG_DOC = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
<circle cx="32" cy="32" r="28" fill="#7c3aed"/></svg>`;

function buildServer() {
  const server = new McpServer({ name: 'http-sample-server', version: '1.0.0' });

  // ── Tools ────────────────────────────────────────────────────────────────
  // MUST stay first: §3.7 invokes the first tool and fills every text input.
  server.registerTool(
    'echo_markdown',
    {
      description:
        'Echo the supplied message back, formatted as a markdown document with a heading and a list.',
      inputSchema: { message: z.string().describe('Text to echo back') },
    },
    async ({ message }) => ({
      content: [
        {
          type: 'text',
          text: `# Echo result\n\nYou sent **${message}**.\n\n- received\n- formatted\n- returned\n`,
        },
      ],
    }),
  );

  // Covers the number, enum, and object/array form controls for §3.6.
  server.registerTool(
    'search_documents',
    {
      description:
        'Search the sample document corpus and return ranked matches with scores.',
      inputSchema: {
        query: z.string().describe('Search terms'),
        limit: z.number().optional().describe('Maximum number of results'),
        mode: z.enum(['fast', 'thorough', 'exhaustive']).optional().describe('Search strategy'),
        filters: z
          .object({ tag: z.string().optional(), since: z.string().optional() })
          .optional()
          .describe('Structured filters applied before ranking'),
        exclude: z.array(z.string()).optional().describe('Terms to exclude'),
      },
    },
    async ({ query, limit, mode }) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              mode: mode ?? 'fast',
              limit: limit ?? 10,
              results: [
                { id: 'doc-1', title: 'Sample document one', score: 0.94 },
                { id: 'doc-2', title: 'Sample document two', score: 0.71 },
              ],
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  // §3.22 Permission Surface: filesystem / network / shell risk inference.
  server.registerTool(
    'read_file',
    {
      description: 'Read a file from the local filesystem and return its contents.',
      inputSchema: { path: z.string().describe('Absolute path to read') },
    },
    async ({ path }) => ({ content: [{ type: 'text', text: `contents of ${path}` }] }),
  );

  server.registerTool(
    'fetch_url',
    {
      description: 'Fetch a remote URL over the network and return the response body.',
      inputSchema: { url: z.string().describe('URL to fetch') },
    },
    async ({ url }) => ({ content: [{ type: 'text', text: `body of ${url}` }] }),
  );

  server.registerTool(
    'run_command',
    {
      description: 'Execute a shell command on the host and capture its output.',
      inputSchema: {
        command: z.string().describe('Command to execute'),
        args: z.array(z.string()).optional().describe('Command arguments'),
      },
    },
    async ({ command }) => ({ content: [{ type: 'text', text: `ran ${command}` }] }),
  );

  // ── Resources ────────────────────────────────────────────────────────────
  server.registerResource(
    'page.html',
    'file:///sample/page.html',
    { description: 'An HTML document with a preview toggle', mimeType: 'text/html' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/html', text: HTML_DOC }],
    }),
  );

  server.registerResource(
    'readme.md',
    'file:///sample/readme.md',
    { description: 'A markdown document', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: MARKDOWN_DOC }],
    }),
  );

  server.registerResource(
    'data.json',
    'file:///sample/data.json',
    { description: 'A structured JSON document', mimeType: 'application/json' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ name: 'sample', items: [1, 2, 3] }, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    'logo.svg',
    'file:///sample/logo.svg',
    { description: 'An SVG image resource', mimeType: 'image/svg+xml' },
    async (uri) => ({
      // Images come back as base64 `blob`, not `text` — this is the branch
      // ResourceDetail's BinaryContent renderer handles.
      contents: [
        {
          uri: uri.href,
          mimeType: 'image/svg+xml',
          blob: Buffer.from(SVG_DOC, 'utf8').toString('base64'),
        },
      ],
    }),
  );

  // ── Prompts ──────────────────────────────────────────────────────────────
  server.registerPrompt(
    'summarize_text',
    {
      description: 'Summarize a block of text at a chosen level of detail.',
      argsSchema: {
        text: z.string().describe('Text to summarize'),
        detail: z.enum(['brief', 'full']).optional().describe('How much detail to keep'),
      },
    },
    ({ text, detail }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Summarize the following at ${detail ?? 'brief'} detail:\n\n${text}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'code_review',
    {
      description: 'Review a code snippet and suggest improvements.',
      argsSchema: {
        language: z.string().describe('Programming language'),
        code: z.string().describe('Code to review'),
      },
    },
    ({ language, code }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: `Review this ${language} code:\n\n${code}` },
        },
      ],
    }),
  );

  return server;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

const httpServer = createServer(async (req, res) => {
  // Permissive CORS so the explorer works with its local proxy either on or off.
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url ?? '/').split('?')[0];
  if (path !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(err instanceof Error ? err.message : String(err));
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`http-mcp-fixture listening on http://${HOST}:${PORT}/mcp`);
});
