import { useState } from 'react';
import type { ResourceContent, ResourceEntry, ResourceTemplate, ServerEntry } from '../types';
import { readResource } from '../lib/mcpClient';
import { extractUriTemplateVars, fillUriTemplate } from '../lib/uriTemplate';
import { CodeBlock } from './CodeBlock';
import type { SupportedLang } from '../lib/highlighter';

interface Props {
  server: ServerEntry;
  uri: string; // may be a URI template string
}

function mimeToLang(mimeType: string | undefined): SupportedLang {
  if (!mimeType) return 'text';
  if (mimeType === 'application/json') return 'json';
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'text/html') return 'html';
  return 'text';
}

function BinaryContent({ content }: { content: ResourceContent }) {
  const blob = content.blob ?? '';
  const mime = content.mimeType ?? 'application/octet-stream';
  const byteLength = Math.ceil((blob.length * 3) / 4);
  const dataUrl = `data:${mime};base64,${blob}`;
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-400">
      Binary content ({byteLength} bytes, <span className="text-zinc-500">{mime}</span>)
      <a
        href={dataUrl}
        download={content.uri.split('/').pop() ?? 'resource'}
        className="ml-3 text-violet-400 hover:text-violet-300 underline transition-colors"
      >
        Download
      </a>
    </div>
  );
}

function ContentBlock({ content }: { content: ResourceContent }) {
  if (content.text !== undefined) {
    const lang = mimeToLang(content.mimeType);
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
            {content.mimeType ?? 'text'}
          </span>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(content.text!).catch(() => {}); }}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            copy
          </button>
        </div>
        <CodeBlock code={content.text} lang={lang} />
      </div>
    );
  }
  if (content.blob !== undefined) {
    return <BinaryContent content={content} />;
  }
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-500">
      Empty response.
    </div>
  );
}

function DirectResource({ server, resource }: { server: ServerEntry; resource: ResourceEntry }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contents, setContents] = useState<ResourceContent[] | null>(null);

  async function doRead() {
    setLoading(true);
    setError(null);
    setContents(null);
    try {
      const result = await readResource(server.id, resource.uri);
      setContents(result.contents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-zinc-100 font-semibold">{resource.name}</h2>
          <p className="text-[11px] text-zinc-500 font-mono mt-0.5 break-all">{resource.uri}</p>
          {resource.description && (
            <p className="text-sm text-zinc-400 mt-1">{resource.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void doRead()}
          disabled={loading}
          className="shrink-0 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? 'Reading…' : 'Read'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {contents && contents.map((c, i) => <ContentBlock key={i} content={c} />)}
    </div>
  );
}

function TemplateResource({ server, template }: { server: ServerEntry; template: ResourceTemplate }) {
  const vars = extractUriTemplateVars(template.uriTemplate);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(vars.map((v) => [v, ''])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contents, setContents] = useState<ResourceContent[] | null>(null);

  async function doRead() {
    const uri = fillUriTemplate(template.uriTemplate, values);
    setLoading(true);
    setError(null);
    setContents(null);
    try {
      const result = await readResource(server.id, uri);
      setContents(result.contents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-zinc-100 font-semibold">{template.name}</h2>
        <p className="text-[11px] text-zinc-500 font-mono mt-0.5 break-all">{template.uriTemplate}</p>
        {template.description && (
          <p className="text-sm text-zinc-400 mt-1">{template.description}</p>
        )}
      </div>
      {vars.length > 0 && (
        <div className="space-y-2">
          {vars.map((v) => (
            <div key={v} className="flex items-center gap-3">
              <label className="text-[11px] font-mono text-zinc-400 w-28 shrink-0">{v}</label>
              <input
                type="text"
                value={values[v] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                placeholder={v}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => void doRead()}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? 'Reading…' : 'Read'}
      </button>
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {contents && contents.map((c, i) => <ContentBlock key={i} content={c} />)}
    </div>
  );
}

export function ResourceDetail({ server, uri }: Props) {
  const direct = server.resources?.find((r) => r.uri === uri);
  const template = server.resourceTemplates?.find((t) => t.uriTemplate === uri);

  if (direct) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <DirectResource key={uri} server={server} resource={direct} />
      </main>
    );
  }
  if (template) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <TemplateResource key={uri} server={server} template={template} />
      </main>
    );
  }
  return null;
}
