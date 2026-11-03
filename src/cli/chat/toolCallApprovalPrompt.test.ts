import { describe, expect, it } from 'vitest';
import { formatToolCallApprovalCard } from './toolCallApprovalPrompt';

describe('formatToolCallApprovalCard', () => {
  it('shows tool name, server, and args', () => {
    const card = formatToolCallApprovalCard({
      call: {
        id: '1',
        llmName: 'get_top_stories',
        serverId: 'srv-a',
        toolName: 'get_top_stories',
        args: { count: 20, listType: 'top' },
      },
      serverName: 'Hacker News',
      verdict: 'ask',
      width: 60,
    });
    expect(card).toContain('get_top_stories');
    expect(card).toContain('Hacker News');
    expect(card).toContain('"count": 20');
    expect(card).toContain('╭');
    expect(card).toContain('╰');
  });

  it('pretty-prints nested tools_json with summary', () => {
    const card = formatToolCallApprovalCard({
      call: {
        id: '1',
        llmName: 'execute_tools',
        serverId: 's',
        toolName: 'execute_tools',
        args: {
          tools_json: JSON.stringify([
            { name: 'get_current_weather', arguments: { latitude: 40.7128 } },
            { name: 'get_current_weather', arguments: { latitude: 51.5074 } },
          ]),
        },
      },
      serverName: 'a',
      verdict: 'ask',
      width: 72,
    });
    expect(card).toContain('2 nested tool call(s)');
    expect(card).toContain('"latitude": 40.7128');
    expect(card).not.toContain('tools_json": "[{\\"');
    expect(card.split('\n').every((line) => line.length <= 72 || line.startsWith('╭'))).toBe(true);
  });

  it('shows always-asks badge for locked tools', () => {
    const card = formatToolCallApprovalCard({
      call: {
        id: '1',
        llmName: 'run_shell',
        serverId: 's',
        toolName: 'run_shell',
        args: {},
      },
      serverName: 'Dev',
      verdict: 'ask_locked',
      width: 55,
    });
    expect(card).toContain('ALWAYS ASKS');
  });
});
