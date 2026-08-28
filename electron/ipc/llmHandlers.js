/**
 * Provider HTTP from the main process. Electron has no CORS and no proxy, so
 * this is a direct fetch — matching how MCP already leaves the main process.
 *
 * `fetchImpl` is injected so this is testable without sockets, following the
 * pattern in electron/mcp/sessions.js. Bodies are never logged: they carry the
 * API key's traffic and raw output from the server under investigation.
 */
export function createLlmService({ fetchImpl = fetch, channels = {
  chunk: 'chunk',
  done: 'done',
  error: 'error',
} } = {}) {
  const inflight = new Map();

  async function start(sender, { requestId, url, headers, body }) {
    const controller = new AbortController();
    inflight.set(requestId, controller);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const detail = (await res.text().catch(() => '')).trim().slice(0, 300);
        const message = detail
          ? `${res.status} ${res.statusText}: ${detail}`
          : `${res.status} ${res.statusText}`;
        sender.send(channels.error, { requestId, message });
        return;
      }

      const decoder = new TextDecoder();
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          sender.send(channels.chunk, {
            requestId,
            chunk: decoder.decode(value, { stream: true }),
          });
        }
      }
      sender.send(channels.done, { requestId });
    } catch (err) {
      // An abort is a user action, not a failure, but the renderer still needs
      // the stream closed, so it is reported the same way.
      sender.send(channels.error, {
        requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inflight.delete(requestId);
    }
  }

  function abort(requestId) {
    const controller = inflight.get(requestId);
    if (!controller) return;
    controller.abort();
    inflight.delete(requestId);
  }

  async function listModels({ url, headers }) {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).trim().slice(0, 300);
      throw new Error(
        detail ? `${res.status} ${res.statusText}: ${detail}` : `${res.status} ${res.statusText}`,
      );
    }
    return res.json();
  }

  return { start, abort, listModels };
}

/** Registers the IPC surface. Called from electron/main.js. */
export function registerLlmHandlers(ipcMain, CHANNELS, ok, fail) {
  const service = createLlmService({
    channels: {
      chunk: CHANNELS.llmChunk,
      done: CHANNELS.llmDone,
      error: CHANNELS.llmError,
    },
  });

  ipcMain.handle(CHANNELS.llmChatStart, async (event, payload) => {
    // Deliberately not awaited: the reply must return immediately so the
    // renderer can start listening while chunks stream in.
    void service.start(event.sender, payload);
    return ok(true);
  });

  ipcMain.handle(CHANNELS.llmChatAbort, async (_event, requestId) => {
    service.abort(requestId);
    return ok(true);
  });

  ipcMain.handle(CHANNELS.llmListModels, async (_event, payload) => {
    try {
      return ok(await service.listModels(payload));
    } catch (err) {
      return fail(err, 'E_LLM_MODELS');
    }
  });
}
