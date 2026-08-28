import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

/**
 * Every string rendered through MarkdownPreview can originate from an MCP
 * server under investigation — tool descriptions, tool results, resource
 * contents, prompt text. The renderer feeds `dangerouslySetInnerHTML`, so raw
 * HTML reaching the output is script execution in a renderer that holds the
 * decrypted vault.
 */
describe('renderMarkdown — untrusted input', () => {
  it('escapes a block-level HTML injection', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes a script tag', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes inline HTML with an event handler', () => {
    const html = renderMarkdown('text <b onmouseover=alert(1)>hover</b>');
    // The handler text survives as *visible text* on purpose — the reader should
    // see what the server wrote. What must not survive is the tag around it.
    expect(html).not.toContain('<b ');
    expect(html).not.toContain('</b>');
    expect(html).toContain('&lt;b onmouseover=alert(1)&gt;');
  });

  it('drops a javascript: link but keeps its text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a ');
    expect(html).toContain('click');
  });

  it('drops a data: link', () => {
    const html = renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD4=)');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('<a ');
  });

  it('drops a javascript: image but keeps its alt text', () => {
    const html = renderMarkdown('![x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).toContain('x');
  });

  it('is case-insensitive about the scheme', () => {
    const html = renderMarkdown('[a](JaVaScRiPt:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('ignores leading whitespace when checking the scheme', () => {
    const html = renderMarkdown('[a](  javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });
});

describe('renderMarkdown — legitimate markdown still works', () => {
  it('renders headings', () => {
    expect(renderMarkdown('# Heading')).toContain('<h1>Heading</h1>');
  });

  it('renders bold and inline code', () => {
    const html = renderMarkdown('a **bold** and `code`');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders fenced code blocks with their language class', () => {
    const html = renderMarkdown('```json\n{"a":1}\n```');
    expect(html).toContain('language-json');
    expect(html).toContain('&quot;a&quot;');
  });

  it('renders lists', () => {
    expect(renderMarkdown('- one\n- two')).toContain('<li>one</li>');
  });

  it('renders tables', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
  });

  it('keeps an http link and hardens the anchor', () => {
    const html = renderMarkdown('[ok](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('keeps a relative link', () => {
    expect(renderMarkdown('[rel](./docs/x.md)')).toContain('href="./docs/x.md"');
  });

  it('keeps a mailto link', () => {
    expect(renderMarkdown('[mail](mailto:a@b.c)')).toContain('href="mailto:a@b.c"');
  });

  it('keeps an https image', () => {
    const html = renderMarkdown('![alt](https://example.com/a.png)');
    expect(html).toContain('<img src="https://example.com/a.png"');
    expect(html).toContain('alt="alt"');
  });

  it('escapes quotes in a title rather than breaking out of the attribute', () => {
    const html = renderMarkdown('[a](https://example.com "ti\\"tle")');
    expect(html).not.toMatch(/title="ti"tle"/);
  });
});
