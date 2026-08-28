import { Marked, type RendererObject, type Tokens } from 'marked';

/**
 * Markdown rendering for untrusted text.
 *
 * Everything this renders can come from the MCP server under investigation —
 * tool descriptions, tool results, resource contents, prompt text — and the
 * output feeds `dangerouslySetInnerHTML`. `marked` passes raw HTML straight
 * through by default (its `sanitize` option was removed in v5 in favour of
 * "use a sanitizer"), so without this module a server could put
 * `<img src=x onerror=…>` in a tool description and run script in a renderer
 * that holds the decrypted vault and, on the desktop build, the preload bridge.
 *
 * Rather than add a sanitizer dependency, raw HTML is escaped at the renderer
 * level and URL schemes are allowlisted — enough because the only HTML that
 * reaches the output is HTML this module generates itself.
 */

/** Schemes that may appear in a link or image. Everything else is dropped. */
const SAFE_URL = /^(?:https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(href: string | null | undefined): boolean {
  // Browsers strip leading whitespace and control characters before reading the
  // scheme, so they are stripped here too — otherwise "\njavascript:" passes.
  // Done by code point rather than a regex to keep control characters out of
  // the source (eslint's no-control-regex).
  const stripped = Array.from(href ?? '')
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('');
  return SAFE_URL.test(stripped);
}

const renderer: RendererObject = {
  /** Raw HTML, block or inline: emit it as visible text, never as markup. */
  html({ text }: Tokens.HTML | Tokens.Tag): string {
    return escapeHtml(text);
  },

  link({ href, title, tokens }: Tokens.Link): string {
    const inner = this.parser.parseInline(tokens);
    // Keep the text so the reader still sees what was written, minus the link.
    if (!isSafeUrl(href)) return inner;
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(href)}"${titleAttr} rel="noopener noreferrer" target="_blank">${inner}</a>`;
  },

  image({ href, title, text }: Tokens.Image): string {
    if (!isSafeUrl(href)) return escapeHtml(text ?? '');
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text ?? '')}"${titleAttr}>`;
  },
};

const safeMarked = new Marked({ renderer });

/** Render markdown to HTML that is safe to inject. */
export function renderMarkdown(source: string): string {
  return safeMarked.parse(source) as string;
}
