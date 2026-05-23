import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

export type SupportedLang = 'json' | 'markdown' | 'html' | 'text';

const THEME_NAME = 'github-dark-default';

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import('@shikijs/themes/github-dark-default')],
      langs: [
        import('@shikijs/langs/json'),
        import('@shikijs/langs/markdown'),
        import('@shikijs/langs/html'),
      ],
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }
  return highlighterPromise;
}

export const SHIKI_THEME = THEME_NAME;

/** Convert Python repr (single-quoted dict/list) to a JSON string. Returns null if not applicable. */
function pythonReprToJson(input: string): string | null {
  let result = '';
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === "'") {
      // Single-quoted string → double-quoted JSON string
      result += '"';
      i++;
      while (i < len) {
        const c = input[i];
        if (c === "'") { result += '"'; i++; break; }
        if (c === '\\') { result += c; i++; if (i < len) { result += input[i]; i++; } continue; }
        if (c === '"') { result += '\\"'; i++; continue; }
        result += c; i++;
      }
      continue;
    }

    if (ch === '"') {
      // Double-quoted string → pass through (already valid JSON)
      result += ch; i++;
      while (i < len) {
        const c = input[i]; result += c; i++;
        if (c === '\\') { if (i < len) { result += input[i]; i++; } continue; }
        if (c === '"') break;
      }
      continue;
    }

    // Python literals → JSON equivalents
    if (input.startsWith('True', i) && (i + 4 >= len || !/\w/.test(input[i + 4]))) { result += 'true'; i += 4; continue; }
    if (input.startsWith('False', i) && (i + 5 >= len || !/\w/.test(input[i + 5]))) { result += 'false'; i += 5; continue; }
    if (input.startsWith('None', i) && (i + 4 >= len || !/\w/.test(input[i + 4]))) { result += 'null'; i += 4; continue; }

    result += ch; i++;
  }

  return result;
}

function tryParseJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch { return null; }
}

export function prettifyCode(code: string, lang: SupportedLang): string {
  if (lang === 'json') {
    const direct = tryParseJson(code);
    if (direct !== null) return JSON.stringify(direct, null, 2);
    const converted = pythonReprToJson(code);
    if (converted !== null) {
      const parsed = tryParseJson(converted);
      if (parsed !== null) return JSON.stringify(parsed, null, 2);
    }
    return code;
  }
  if (lang === 'text') {
    return code.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '');
  }
  return code;
}

export function detectLanguage(raw: string): SupportedLang {
  const text = raw.trim();
  if (!text) return 'text';

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    if (tryParseJson(text) !== null) return 'json';
    // Try Python repr (single-quoted keys/values)
    const converted = pythonReprToJson(text);
    if (converted !== null && tryParseJson(converted) !== null) return 'json';
  }

  if (looksLikeHtml(text)) return 'html';
  if (looksLikeMarkdown(text)) return 'markdown';
  return 'text';
}

function looksLikeHtml(text: string): boolean {
  if (/<!doctype\s+html/i.test(text)) return true;
  if (/<\/?(?:html|head|body|div|span|p|a|img|ul|ol|li|table|tr|td|h[1-6]|script|style|section|article|header|footer|nav|main|button|input|form|iframe|svg)\b/i.test(text)) {
    const tagMatches = text.match(/<\/?[a-zA-Z][^>]*>/g);
    if (tagMatches && tagMatches.length >= 2) return true;
  }
  return false;
}

function looksLikeMarkdown(text: string): boolean {
  const signals = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^```[\w-]*\s*$/m,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|\s)\*\*[^*\n]+\*\*/,
    /(^|\s)_[^_\n]+_/,
    /^>\s+\S/m,
    /^\|.+\|.+\|/m,
  ];
  let hits = 0;
  for (const re of signals) {
    if (re.test(text)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}
