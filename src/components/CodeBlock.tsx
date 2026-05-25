import { useEffect, useState } from 'react';
import { detectLanguage, getHighlighter, prettifyCode, SHIKI_THEME, type SupportedLang } from '../lib/highlighter';

interface Props {
  code: string;
  lang?: SupportedLang;
  className?: string;
}

export function CodeBlock({ code, lang, className }: Props) {
  const resolvedLang: SupportedLang = lang ?? detectLanguage(code);
  const prepared = prettifyCode(code, resolvedLang);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (resolvedLang === 'text') {
      return;
    }
    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        setHtml(
          hl.codeToHtml(prepared, {
            lang: resolvedLang,
            theme: SHIKI_THEME,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [prepared, resolvedLang]);

  const wrapper = `shiki-block text-xs leading-relaxed ${className ?? ''}`;

  if (resolvedLang === 'text' || html === null) {
    return (
      <pre className={`${wrapper} whitespace-pre-wrap break-words p-4 font-mono text-zinc-100`}>
        {prepared}
      </pre>
    );
  }

  return <div className={wrapper} dangerouslySetInnerHTML={{ __html: html }} />;
}
