import { describe, expect, it } from 'vitest';
import { formatTerminalTable, renderTerminalMarkdown } from './terminalMarkdown';

describe('renderTerminalMarkdown', () => {
  it('renders headings and emphasis', () => {
    const out = renderTerminalMarkdown('## Title\n\n**bold** and `code`');
    expect(out).toContain('Title');
    expect(out).toContain('bold');
    expect(out).toContain('code');
  });

  it('renders GFM tables', () => {
    const out = renderTerminalMarkdown(
      '| Name | Score |\n| --- | ---: |\n| alpha | 12 |\n| beta | 99 |',
    );
    expect(out).toContain('Name');
    expect(out).toContain('Score');
    expect(out).toContain('alpha');
    expect(out).toContain('99');
    expect(out).toContain('┌');
    expect(out).toContain('└');
  });
});

describe('formatTerminalTable', () => {
  it('aligns columns', () => {
    const table = formatTerminalTable(['Item', 'N'], [['a', '1']], ['left', 'right']);
    expect(table).toContain('Item');
    expect(table).toContain('┼');
  });
});
