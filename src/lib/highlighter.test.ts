import { describe, expect, it } from 'vitest';
import { getHighlighter, prettifyCode, SHIKI_THEME } from './highlighter';

describe('highlighter', () => {
  it('produces Shiki HTML for JSON', async () => {
    const hl = await getHighlighter();
    const code = prettifyCode('{"hello":"world"}', 'json');
    const html = hl.codeToHtml(code, { lang: 'json', theme: SHIKI_THEME });
    expect(html).toContain('class="shiki');
    expect(html).toMatch(/style="[^"]*color/);
  });
});
