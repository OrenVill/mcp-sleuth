import { describe, expect, it } from 'vitest';
import { renderTerminalMarkdown } from './terminalMarkdown';

describe('renderTerminalMarkdown', () => {
  it('renders headings and emphasis', () => {
    const out = renderTerminalMarkdown('## Title\n\n**bold** and `code`');
    expect(out).toContain('Title');
    expect(out).toContain('bold');
    expect(out).toContain('code');
  });
});
