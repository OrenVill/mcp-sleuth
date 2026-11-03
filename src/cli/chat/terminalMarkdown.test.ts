import { describe, expect, it } from 'vitest';
import {
  decodeBasicHtmlEntities,
  formatTerminalTable,
  formatTerminalTableStacked,
  renderTerminalMarkdown,
} from './terminalMarkdown';

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

  it('decodes HTML entities in table cells', () => {
    const out = renderTerminalMarkdown("| T |\n| --- |\n| it&#39;s ok |");
    expect(out).toContain("it's ok");
    expect(out).not.toContain('&#39;');
  });
});

describe('formatTerminalTable', () => {
  it('aligns columns', () => {
    const table = formatTerminalTable(['Item', 'N'], [['a', '1']], ['left', 'right']);
    expect(table).toContain('Item');
    expect(table).toContain('┼');
  });

  it('uses a stacked layout when the grid would exceed maxWidth', () => {
    const header = ['#', 'Title', 'Points', 'Author', 'Comments', 'Story ID'];
    const rows = [
      ['1', 'Astra can read and write weights to GPU', '2791', 'dbreunig', '854', '50341174'],
      ['2', 'Nvidia open-source ontology', '141', 'campervans', '41', '50348962'],
    ];
    const table = formatTerminalTable(header, rows, [], { maxWidth: 52 });
    expect(table).not.toContain('┌');
    expect(table).toContain('Title: Astra can read and write weights to GPU');
    expect(table).toContain('Points: 2791');
  });

  it('keeps the grid on wide maxWidth', () => {
    const table = formatTerminalTable(['Name', 'Score'], [['alpha', '12']], [], {
      maxWidth: 120,
    });
    expect(table).toContain('┌');
  });
});

describe('decodeBasicHtmlEntities', () => {
  it('handles apostrophe entities', () => {
    expect(decodeBasicHtmlEntities('it&#39;s')).toBe("it's");
  });
});

describe('formatTerminalTableStacked', () => {
  it('wraps long field lines', () => {
    const out = formatTerminalTableStacked(['Title'], [['short']], 24);
    expect(out).toContain('Title: short');
  });
});
