import { describe, expect, it } from 'vitest';
import { renderTerminalMarkdown } from '../chat/terminalMarkdown';

describe('emitMarkdown rendering', () => {
  it('renders readiness-style sections', () => {
    const md = '# Agent Readiness — fixture\n\n## tool_a\n\n- Finding one\n';
    const out = renderTerminalMarkdown(md, { accentHeadings: true });
    expect(out).toContain('Agent Readiness');
    expect(out).toContain('tool_a');
    expect(out).toContain('Finding one');
    expect(out).not.toContain('# ');
  });
});
