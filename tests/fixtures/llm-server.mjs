#!/usr/bin/env node
/**
 * A scripted OpenAI-compatible model for the Playwright suites.
 *
 * Real models are non-deterministic and need a paid key, so neither release
 * suite could assert on an agent run without this. Each request returns the
 * next entry in a fixed script, chosen by how many tool results the request
 * already contains — so turn 1 asks for a tool and turn 2 answers.
 */
import { createServer } from 'node:http';

// 3003, not 3002: playwright.config.ts already runs meta-mcp-server.mjs on
// 3002 for §3.6 and §3.12, and its `reuseExistingServer` means a stray LLM
// fixture on that port silently hijacks those specs instead of failing loudly.
const PORT = Number(process.argv[2] ?? process.env.LLM_FIXTURE_PORT ?? 3003);

/** How long the scripted "slowly" prompt stalls before it starts streaming. */
const SLOW_DELAY_MS = 2500;

/** Long enough to overflow the transcript's collapsed result cap. */
const LONG_ECHO = Array.from({ length: 40 }, (_, i) => `line ${i + 1} of a long payload`).join('\n');

/**
 * The "explode" prompt fails once and then works, so a test can drive the
 * error surface AND the recovery. A prompt that always failed could only ever
 * prove that Retry re-fails.
 */
let explodedOnce = false;

/**
 * Turn 0: call `echo_markdown` (a real tool on the MCP fixture) with a fixed argument.
 * Turn 1 onward: answer in prose, ending the run.
 */
function scriptFor(toolResultCount, userText) {
  // Recovery from the one-shot failure below: prose, so the retried run ends
  // without a second approval to drive.
  if (userText.includes('explode')) {
    return { content: 'Recovered after the failure.', toolCalls: [] };
  }
  if (toolResultCount === 0) {
    return {
      content: '',
      toolCalls: [
        // Must name a tool the MCP fixture actually exports, or the agent loop
        // takes the unresolvable-name path and no approval card ever appears.
        {
          id: 'call_1',
          name: 'echo_markdown',
          args: { message: userText.includes('long') ? LONG_ECHO : 'hello from the agent' },
        },
      ],
    };
  }
  // The bold is load-bearing: it is how a test tells copying the raw markdown
  // source apart from copying the rendered text.
  return { content: 'The tool replied. **We are done.**', toolCalls: [] };
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamCompletion(res, script) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (script.content) {
    // Two deltas, so the test can observe streaming rather than one blob.
    const half = Math.ceil(script.content.length / 2);
    sse(res, { choices: [{ delta: { content: script.content.slice(0, half) } }] });
    sse(res, { choices: [{ delta: { content: script.content.slice(half) } }] });
  }

  script.toolCalls.forEach((call, index) => {
    sse(res, {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index,
                id: call.id,
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          },
        },
      ],
    });
  });

  res.write('data: [DONE]\n\n');
  res.end();
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
    return;
  }

  if (url.pathname === '/v1/chat/completions') {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const toolResults = messages.filter((m) => m.role === 'tool').length;
    const userText = messages
      .filter((m) => m.role === 'user')
      .map((m) => String(m.content ?? ''))
      .join(' ');

    if (userText.includes('explode') && !explodedOnce) {
      explodedOnce = true;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'scripted upstream failure' } }));
      return;
    }

    // A prompt containing "slowly" stalls before the first token. Without it the
    // script answers instantly and the working indicator — which only exists in
    // that gap — could never be observed without racing it.
    if (userText.includes('slowly')) {
      await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS));
    }
    streamCompletion(res, scriptFor(toolResults, userText));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LLM fixture listening on http://127.0.0.1:${PORT}`);
});
