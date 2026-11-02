import { describe, expect, test } from 'vitest';
import { analyzeAgentReadiness } from './agentReadiness';
import {
  quickWinsForServerTools,
  serverReadinessMarkdown,
  toolReadinessMarkdown,
} from './agentReadinessMarkdown';
import type { AgentReadinessToolReport, AgentReadinessIssue } from './agentReadiness';
import type { ServerEntry, ToolDef } from '../types';

function issue(partial: Omit<AgentReadinessIssue, 'serverId' | 'serverName'> & { toolName?: string }): AgentReadinessIssue {
  return {
    serverId: 'docs',
    serverName: 'Docs server',
    toolName: 'search_docs',
    ...partial,
  };
}

function toolReport(overrides: Partial<AgentReadinessToolReport> & { toolName?: string } = {}): AgentReadinessToolReport {
  return {
    serverId: 'docs',
    serverName: 'Docs server',
    toolName: 'search_docs',
    score: 72,
    verdict: 'agent-ready',
    issues: [],
    ...overrides,
  };
}

describe('toolReadinessMarkdown', () => {
  test('formats a tool with several issues', () => {
    const tool = toolReport({
      issues: [
        issue({
          id: 'parameter-description-missing',
          severity: 'high',
          path: 'query',
          message: 'Parameter "query" has no description.',
          recommendation: 'Explain what the parameter controls and how an agent should choose a value.',
        }),
        issue({
          id: 'unclear-error-message',
          severity: 'medium',
          message: 'Recent failed calls to "search_docs" returned unclear error messages.',
          recommendation:
            'Return actionable errors that identify the bad field and suggest a recovery step.',
        }),
      ],
    });

    const md = toolReadinessMarkdown(tool);
    expect(md).toBe(`# Agent Readiness — search_docs

**Server:** Docs server
**Score:** 72 / 100 — Agent ready
**Issues:** 2 (0 critical, 1 high, 1 medium, 0 low)

## Issues

### High — parameter \`query\`
- **Message:** Parameter "query" has no description.
- **Recommendation:** Explain what the parameter controls and how an agent should choose a value.
- **Id:** \`parameter-description-missing\`

### Medium — tool
- **Message:** Recent failed calls to "search_docs" returned unclear error messages.
- **Recommendation:** Return actionable errors that identify the bad field and suggest a recovery step.
- **Id:** \`unclear-error-message\`
`);
  });

  test('tool with no issues', () => {
    const md = toolReadinessMarkdown(toolReport({ score: 95, verdict: 'excellent' }));
    expect(md).toContain('_No readiness issues found._');
    expect(md).toContain('**Issues:** 0 (0 critical, 0 high, 0 medium, 0 low)');
  });

  test('includes generatedAt only when passed', () => {
    const without = toolReadinessMarkdown(toolReport({ toolName: 't' }));
    expect(without).not.toContain('**Generated:**');

    const withTs = toolReadinessMarkdown(toolReport({ toolName: 't' }), { generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(withTs).toContain('**Generated:** 2026-01-01T00:00:00.000Z');
  });

  test('same input is byte-identical', () => {
    const tool = toolReport({
      issues: [issue({ id: 'tool-description-missing', severity: 'low', message: 'm', recommendation: 'r' })],
    });
    expect(toolReadinessMarkdown(tool)).toBe(toolReadinessMarkdown(tool));
  });
});

describe('serverReadinessMarkdown', () => {
  test('server with multiple tools includes table, quick wins, and details', () => {
    const tools: AgentReadinessToolReport[] = [
      toolReport({
        toolName: 'search_docs',
        score: 72,
        verdict: 'agent-ready',
        issues: [
          issue({
            id: 'parameter-description-missing',
            severity: 'high',
            path: 'query',
            message: 'Parameter "query" has no description.',
            recommendation: 'Explain what the parameter controls and how an agent should choose a value.',
          }),
        ],
      }),
      toolReport({
        toolName: 'run',
        score: 40,
        verdict: 'not-ready',
        issues: [
          issue({
            toolName: 'run',
            id: 'tool-name-generic',
            severity: 'high',
            message: 'Tool name "run" is too generic.',
            recommendation: 'Rename to a verb_noun name.',
          }),
        ],
      }),
    ];
    const quickWins = quickWinsForServerTools(tools);
    const md = serverReadinessMarkdown('Docs server', tools, quickWins);

    expect(md).toContain('# Agent Readiness — Docs server');
    expect(md).toContain('**Tools scored:** 2 · **Ready tools:** 1 · **Critical issues:** 0 · **High issues:** 2');
    expect(md).toContain('## Quick wins');
    expect(md).toContain('| `search_docs` | 72 | Agent ready | 0 | 1 | 0 | 0 |');
    expect(md).toContain('| `run` | 40 | Not ready | 0 | 1 | 0 | 0 |');
    expect(md).toContain('### `search_docs` — 72 · Agent ready');
    expect(md).toContain('#### High — parameter `query`');
    expect(md).toContain('### `run` — 40 · Not ready');
  });

  test('excludes another server when building from filtered tools', () => {
    const docsTools: AgentReadinessToolReport[] = [
      toolReport({ toolName: 'search_docs', serverId: 'docs', serverName: 'Docs server' }),
    ];
    const otherTools: AgentReadinessToolReport[] = [
      toolReport({ toolName: 'other_tool', serverId: 'other', serverName: 'Other', score: 10, verdict: 'not-ready' }),
    ];
    const md = serverReadinessMarkdown('Docs server', docsTools, quickWinsForServerTools(docsTools));
    expect(md).not.toContain('other_tool');
    expect(md).not.toContain('Other');
    expect(otherTools).toHaveLength(1);
  });

  test('groups identical findings across tools and lists tool names once', () => {
    const sharedIssue = {
      id: 'parameter-description-missing',
      severity: 'high' as const,
      path: 'query',
      message: 'Parameter "query" has no description.',
      recommendation: 'Explain what the parameter controls and how an agent should choose a value.',
    };
    const tools: AgentReadinessToolReport[] = [
      toolReport({
        toolName: 'zebra_search',
        issues: [issue({ ...sharedIssue, toolName: 'zebra_search' })],
      }),
      toolReport({
        toolName: 'alpha_search',
        issues: [issue({ ...sharedIssue, toolName: 'alpha_search' })],
      }),
      toolReport({
        toolName: 'beta_search',
        issues: [issue({ ...sharedIssue, toolName: 'beta_search' })],
      }),
    ];

    const md = serverReadinessMarkdown('Docs server', tools, []);
    expect(md).toContain('## Shared findings');
    expect(md).toContain(
      '- **Parameter "query" has no description.** (3 tools): `alpha_search`, `beta_search`, `zebra_search`',
    );
    expect(md).not.toContain('## Tool details');
    expect(md.match(/Parameter "query" has no description\./g)).toHaveLength(1);
  });

  test('keeps tool-specific findings under Tool details and shared ones grouped', () => {
    const sharedIssue = {
      id: 'tool-description-missing',
      severity: 'medium' as const,
      message: 'Tool has no description.',
      recommendation: 'Add a description.',
    };
    const tools: AgentReadinessToolReport[] = [
      toolReport({
        toolName: 'shared_a',
        issues: [issue({ ...sharedIssue, toolName: 'shared_a' })],
      }),
      toolReport({
        toolName: 'shared_b',
        issues: [issue({ ...sharedIssue, toolName: 'shared_b' })],
      }),
      toolReport({
        toolName: 'unique_tool',
        score: 40,
        verdict: 'not-ready',
        issues: [
          issue({
            toolName: 'unique_tool',
            id: 'tool-name-generic',
            severity: 'high',
            message: 'Tool name "unique_tool" is too generic.',
            recommendation: 'Rename to a verb_noun name.',
          }),
        ],
      }),
    ];

    const md = serverReadinessMarkdown('Docs server', tools, []);
    const sharedIdx = md.indexOf('## Shared findings');
    const detailsIdx = md.indexOf('## Tool details');
    expect(sharedIdx).toBeGreaterThan(-1);
    expect(detailsIdx).toBeGreaterThan(sharedIdx);
    expect(md).toContain('- **Tool has no description.** (2 tools): `shared_a`, `shared_b`');
    expect(md).toContain('### `unique_tool` — 40 · Not ready');
    expect(md).toContain('#### High — tool');
    expect(md).not.toContain('### `shared_a`');
    expect(md).not.toContain('### `shared_b`');
  });

  test('shared and unique issue ordering is stable', () => {
    const tools: AgentReadinessToolReport[] = [
      toolReport({
        toolName: 't2',
        issues: [
          issue({
            toolName: 't2',
            id: 'b-id',
            severity: 'medium',
            message: 'shared message',
            recommendation: 'fix shared',
          }),
          issue({
            toolName: 't2',
            id: 'z-unique',
            severity: 'low',
            message: 'only on t2',
            recommendation: 'fix t2',
          }),
        ],
      }),
      toolReport({
        toolName: 't1',
        issues: [
          issue({
            toolName: 't1',
            id: 'b-id',
            severity: 'medium',
            message: 'shared message',
            recommendation: 'fix shared',
          }),
          issue({
            toolName: 't1',
            id: 'a-unique',
            severity: 'high',
            message: 'only on t1',
            recommendation: 'fix t1',
          }),
        ],
      }),
    ];

    const first = serverReadinessMarkdown('Docs server', tools, []);
    const second = serverReadinessMarkdown('Docs server', [...tools].reverse(), []);
    expect(first).toBe(second);
    expect(first.indexOf('shared message')).toBeLessThan(first.indexOf('## Tool details'));
    expect(first.indexOf('only on t1')).toBeLessThan(first.indexOf('only on t2'));
  });
});

describe('escaping and untrusted text', () => {
  test('escapes pipe, backticks, newlines, hash, and script-like content', () => {
    const tool = toolReport({
      toolName: 'weird|tool`name',
      issues: [
        issue({
          id: 'id-with-`tick',
          severity: 'medium',
          path: 'field|one\nline2',
          message: 'Heading # break <script>alert(1)</script>',
          recommendation: 'Use `safe` values',
        }),
      ],
    });
    const md = toolReadinessMarkdown(tool);
    expect(md).toContain('# Agent Readiness — weird|tool\'name');
    expect(md).toContain('parameter `field|one line2`');
    expect(md).not.toContain('<script>');
    expect(md).toContain('&lt;script&gt;');
    expect(md).toContain("id-with-'tick");
  });
});

describe('secret safety', () => {
  test('markdown never includes configured auth, env, or URL secrets', () => {
    const secretBearer = 'super-secret-bearer-token-83';
    const secretApiKey = 'super-secret-api-key-83';
    const secretPassword = 'super-secret-basic-password-83';
    const secretEnv = 'super-secret-env-value-83';
    const secretUrl = 'https://user:pass@internal.example/mcp';

    const server: ServerEntry = {
      id: 'secret-server',
      name: 'Secret server',
      url: secretUrl,
      status: 'connected',
      auth: {
        method: 'bearer',
        bearerToken: secretBearer,
        apiKeyValue: secretApiKey,
        basicPassword: secretPassword,
      },
      stdioEnv: { SECRET: secretEnv },
      tools: [
        {
          name: 'query',
          inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
        } satisfies ToolDef,
      ],
    };

    const report = analyzeAgentReadiness([server]);
    const docsTools = report.tools.filter((tool) => tool.serverId === 'secret-server');
    const toolMd = toolReadinessMarkdown(docsTools[0]);
    const serverMd = serverReadinessMarkdown(
      'Secret server',
      docsTools,
      quickWinsForServerTools(docsTools),
    );

    for (const secret of [secretBearer, secretApiKey, secretPassword, secretEnv, secretUrl, 'user:pass']) {
      expect(toolMd).not.toContain(secret);
      expect(serverMd).not.toContain(secret);
    }
  });
});
