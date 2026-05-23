import { useEffect, useState } from 'react';
import type { PromptDef, PromptMessage, ServerEntry } from '../types';
import { getPrompt } from '../lib/mcpClient';
import { serializePromptMessages } from '../lib/promptSerialize';
import { CodeBlock } from './CodeBlock';
import { detectLanguage } from '../lib/highlighter';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  server: ServerEntry;
  prompt: PromptDef;
}

function MessageCard({ message }: { message: PromptMessage }) {
  const [view, setView] = useState<'code' | 'preview'>('code');
  const text = message.content.text ?? JSON.stringify(message.content, null, 2);
  const lang = message.content.type === 'text' ? detectLanguage(text) : 'json';
  const isMarkdown = lang === 'markdown';
  const isUser = message.role === 'user';

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center gap-2 bg-zinc-950/40">
        <span
          className={[
            'text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-md',
            isUser
              ? 'bg-blue-950/60 text-blue-300 border border-blue-900/60'
              : 'bg-violet-950/60 text-violet-300 border border-violet-900/60',
          ].join(' ')}
        >
          {message.role}
        </span>
        <span className="text-[10px] text-zinc-600">{message.content.type}</span>
        {isMarkdown && (
          <div className="ml-auto inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            {(['code', 'preview'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={
                  view === v
                    ? 'px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-700 text-zinc-100'
                    : 'px-2 py-0.5 rounded text-[10px] font-medium text-zinc-500 hover:text-zinc-300'
                }
              >
                {v === 'code' ? 'Code' : 'Preview'}
              </button>
            ))}
          </div>
        )}
      </div>
      {isMarkdown && view === 'preview' ? (
        <MarkdownPreview source={text} />
      ) : (
        <CodeBlock code={text} lang={lang} />
      )}
    </div>
  );
}

export function PromptDetail({ server, prompt }: Props) {
  const hasArgs = (prompt.arguments?.length ?? 0) > 0;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((prompt.arguments ?? []).map((a) => [a.name, ''])),
  );
  const [loading, setLoading] = useState(!hasArgs);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<PromptMessage[] | null>(null);

  async function doGet(args: Record<string, string>) {
    setLoading(true);
    setError(null);
    setMessages(null);
    try {
      const result = await getPrompt(server.id, prompt.name, args);
      setMessages(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch for prompts without arguments — all setState calls are in async
  // callbacks so they don't trigger synchronous cascading renders in the effect.
  useEffect(() => {
    if (hasArgs) return;
    let cancelled = false;
    getPrompt(server.id, prompt.name, {})
      .then((result) => { if (!cancelled) setMessages(result); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [prompt.name, server.id, hasArgs]);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-zinc-100 font-semibold font-mono">{prompt.name}</h2>
            {prompt.description && (
              <MarkdownPreview source={prompt.description} className="md-preview-compact" />
            )}
          </div>
          {messages && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(serializePromptMessages(messages)).catch(() => {});
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-zinc-700 text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              Copy all
            </button>
          )}
        </div>

        {hasArgs && (
          <div className="space-y-2">
            {(prompt.arguments ?? []).map((arg) => (
              <div key={arg.name} className="flex items-start gap-3">
                <label className="text-[11px] font-mono text-zinc-400 w-28 shrink-0 pt-1.5">
                  {arg.name}
                  {arg.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <div className="flex-1">
                  <input
                    type="text"
                    value={values[arg.name] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
                    }
                    placeholder={arg.description ?? arg.name}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none transition-colors"
                  />
                  {arg.description && (
                    <p className="text-[11px] text-zinc-500 mt-1">{arg.description}</p>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => void doGet(values)}
              disabled={loading}
              className="mt-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {loading ? 'Getting prompt…' : 'Get prompt'}
            </button>
          </div>
        )}

        {loading && !hasArgs && (
          <div className="text-sm text-zinc-500 flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {messages && (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <MessageCard key={i} message={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
