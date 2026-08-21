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

const PORT = Number(process.argv[2] ?? process.env.LLM_FIXTURE_PORT ?? 3002);

/**
 * Turn 0: call `echo` with a fixed argument.
 * Turn 1 onward: answer in prose, ending the run.
 */
function scriptFor(toolResultCount) {
  if (toolResultCount === 0) {
    return {
      content: '',
      toolCalls: [
        { id: 'call_1', name: 'echo', args: { message: 'hello from the agent' } },
      ],
    };
  }
  return { content: 'The tool replied. We are done.', toolCalls: [] };
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
    streamCompletion(res, scriptFor(toolResults));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LLM fixture listening on http://127.0.0.1:${PORT}`);
});
