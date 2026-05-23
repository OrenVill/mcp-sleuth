import { useState } from 'react';
import type { ToolContent, ToolResult } from '../types';
import { CodeBlock } from './CodeBlock';
import { MarkdownPreview } from './MarkdownPreview';
import { detectLanguage, type SupportedLang } from '../lib/highlighter';

interface Props {
  result: ToolResult | null;
  error: string | null;
  loading: boolean;
}

type ResultView = 'formatted' | 'raw';

function ViewToggle({ view, onChange }: { view: 'code' | 'preview'; onChange: (v: 'code' | 'preview') => void }) {
  return (
    <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
      {(['code', 'preview'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
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
  );
}

function TextContentBlock({ content }: { content: ToolContent }) {
  const [view, setView] = useState<'code' | 'preview'>('code');
  const raw = content.text as string;
  const lang = detectLanguage(raw);
  const isMarkdown = lang === 'markdown';

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold flex items-center gap-2">
          {content.type}
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500/80 normal-case tracking-normal">{lang}</span>
        </span>
        <div className="flex items-center gap-2">
          {isMarkdown && <ViewToggle view={view} onChange={setView} />}
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(raw).catch(() => {}); }}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy"
          >
            copy
          </button>
        </div>
      </div>
      {isMarkdown && view === 'preview' ? (
        <MarkdownPreview source={raw} />
      ) : (
        <CodeBlock code={raw} lang={lang} />
      )}
    </div>
  );
}

function ResourceBlock({ content }: { content: ToolContent }) {
  const resource = content.resource as { uri?: string; mimeType?: string; text?: string; blob?: string } | undefined;
  const [view, setView] = useState<'code' | 'preview'>('code');

  if (!resource?.text) {
    // blob-only image
    if (resource?.blob && resource.mimeType?.startsWith('image/')) {
      const src = `data:${resource.mimeType};base64,${resource.blob}`;
      return (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
            <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold flex items-center gap-2">
              resource <span className="text-zinc-700">·</span>
              <span className="text-zinc-500/80 normal-case font-mono">{resource.mimeType}</span>
            </span>
            <a href={src} download className="text-[10px] uppercase tracking-wider text-violet-400 hover:text-violet-300 transition-colors">Download</a>
          </div>
          <div className="p-4">
            <img src={src} alt={resource.uri ?? ''} className="max-w-full rounded-lg border border-zinc-800" />
          </div>
        </div>
      );
    }
    return <CodeBlock code={JSON.stringify(content, null, 2)} lang="json" />;
  }

  const { uri = '', mimeType = 'text/plain', text } = resource;
  const isHtml = mimeType === 'text/html' || mimeType.endsWith('+html');
  const isMarkdown = mimeType === 'text/markdown';
  const isImage = mimeType.startsWith('image/');
  const isSvg = mimeType === 'image/svg+xml';
  const hasPreview = isHtml || isMarkdown || isSvg;

  const imageSrc = isImage
    ? resource.blob
      ? `data:${mimeType};base64,${resource.blob}`
      : resource.text
      ? `data:${mimeType};charset=utf-8,${encodeURIComponent(resource.text)}`
      : null
    : null;

  const lang: SupportedLang = isHtml ? 'html'
    : isMarkdown ? 'markdown'
    : isSvg ? 'html'
    : mimeType === 'application/json' ? 'json'
    : detectLanguage(text);

  // Pure image (non-SVG) — just show the image with a download link, no toggle
  if (isImage && !isSvg && imageSrc) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold flex items-center gap-2">
            resource <span className="text-zinc-700">·</span>
            <span className="text-zinc-500/80 normal-case font-mono">{mimeType}</span>
          </span>
        </div>
        <div className="p-4 flex flex-col items-start gap-3">
          <img src={imageSrc} alt={uri} className="max-w-full rounded-lg border border-zinc-800" />
          <a href={imageSrc} download={uri.split('/').pop() ?? 'image'}
            className="text-[10px] uppercase tracking-wider text-violet-400 hover:text-violet-300 transition-colors">
            Download
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold flex items-center gap-2">
          resource
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-500/80 normal-case tracking-normal font-mono">{mimeType}</span>
        </span>
        <div className="flex items-center gap-2">
          {hasPreview && <ViewToggle view={view} onChange={setView} />}
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); }}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy"
          >
            copy
          </button>
        </div>
      </div>

      {view === 'preview' && isHtml ? (
        <iframe
          srcDoc={text}
          sandbox="allow-scripts"
          title={uri}
          className="w-full block"
          style={{ minHeight: '320px', border: 'none' }}
        />
      ) : view === 'preview' && (isMarkdown || isSvg) ? (
        isMarkdown ? (
          <MarkdownPreview source={text} />
        ) : (
          <img src={imageSrc!} alt={uri} className="max-w-full p-4 rounded-lg" />
        )
      ) : (
        <CodeBlock code={text} lang={lang} />
      )}
    </div>
  );
}

function RawResultBlock({ result }: { result: ToolResult }) {
  const raw = JSON.stringify(result, null, 2);
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
          Full ToolResult (JSON)
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(raw);
          }}
          className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          copy
        </button>
      </div>
      <CodeBlock code={raw} lang="json" />
    </div>
  );
}

export function ResultPane({ result, error, loading }: Props) {
  const [view, setView] = useState<ResultView>('formatted');
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-amber-400/90 flex items-center gap-2">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Calling tool…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-5">
        <div className="text-[11px] uppercase tracking-wider text-red-400/90 font-semibold mb-2">
          Transport error
        </div>
        <pre className="text-sm text-red-300 whitespace-pre-wrap break-words font-mono">
          {error}
        </pre>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-500 italic">
        Run the tool to see results here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-500">Response</span>
        <div
          className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/70 p-0.5"
          role="tablist"
          aria-label="Result view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'formatted'}
            onClick={() => setView('formatted')}
            className={
              view === 'formatted'
                ? 'px-3 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-100 shadow-sm'
                : 'px-3 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-300'
            }
          >
            Formatted
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'raw'}
            onClick={() => setView('raw')}
            className={
              view === 'raw'
                ? 'px-3 py-1 rounded-md text-[11px] font-medium bg-zinc-800 text-zinc-100 shadow-sm'
                : 'px-3 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-300'
            }
          >
            Raw
          </button>
        </div>
      </div>

      {view === 'raw' ? (
        <RawResultBlock result={result} />
      ) : (
        <>
          {result.isError && (
            <div className="text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5 rounded-md bg-red-950/40 text-red-300 border border-red-900/60">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              tool reported error
            </div>
          )}
          {result.content.map((c, i) => {
            if (c.type === 'resource') return <ResourceBlock key={i} content={c} />;
            if (c.type === 'text' && c.text !== undefined) return <TextContentBlock key={i} content={c} />;
            const raw = JSON.stringify(c, null, 2);
            return (
              <div key={i} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
                <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
                  <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
                    {c.type}
                  </span>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard?.writeText(raw).catch(() => {}); }}
                    className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Copy"
                  >
                    copy
                  </button>
                </div>
                <CodeBlock code={raw} lang="json" />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
