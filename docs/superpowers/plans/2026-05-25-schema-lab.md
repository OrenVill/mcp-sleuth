# Schema Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Schema Lab tab inside the same developer-tools modal as Protocol Inspector so developers can inspect tool schemas, see validation notes, generate example arguments, and copy a JSON-RPC `tools/call` payload.

**Architecture:** This work assumes PR #32 (`feature/protocol-inspector`) has been merged or the implementation branch is based on it. Split the feature into pure schema-analysis helpers in `src/lib/schemaLab.ts`, a focused `SchemaLabPanel` UI, and a renamed `DevToolsModal` that hosts both Protocol Inspector and Schema Lab tabs. Keep Schema Lab read-only in v1; structure the helpers so a future editable/mock schema mode can pass an arbitrary schema into the same analysis functions.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing `CodeBlock`, `MarkdownPreview`, `JsonSchema`, `JsonSchemaProperty`, `ServerEntry`, and `ToolDef` types.

---

## Prerequisite

Start from the Protocol Inspector branch or merge PR #32 first:

```bash
git checkout feature/protocol-inspector
git pull
```

If PR #32 has already merged:

```bash
git checkout main
git pull
git checkout -b feature/schema-lab
```

If PR #32 is still open:

```bash
git checkout feature/protocol-inspector
git pull
git checkout -b feature/schema-lab
```

Run the baseline:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass. The build may print the existing Vite Node `20.19+` warning on Node `20.18.2`; that warning is not introduced by this feature.

---

## File Structure

- Create `src/lib/schemaLab.ts` for all schema summary, validation, example generation, and JSON-RPC payload logic.
- Create `src/lib/schemaLab.test.ts` for TDD coverage of the pure helpers.
- Create `src/components/SchemaLabPanel.tsx` for the read-only Schema Lab UI.
- Create or rename `src/components/DevToolsModal.tsx` to own the shared modal shell and tabs.
- Move the existing Protocol Inspector timeline body from `src/components/ProtocolInspector.tsx` into `src/components/ProtocolInspectorPanel.tsx`, or keep the file as the panel and make `DevToolsModal` wrap it. Prefer the split if it keeps modal chrome out of the timeline component.
- Modify `src/App.tsx` to open `DevToolsModal`, pass the current selected server/tool, and rename the header button from `Inspector` to `Dev Tools`.
- Modify `src/components/ToolDetail.tsx` to add a `Schema Lab` action beside the Arguments heading.
- Update `.cursor/skills/prepare-for-release/SKILL.md`, `README.md`, and `README.npm.md` with Schema Lab checks/docs.
- Update `.cursorrules` so future dev-tools work keeps the shared modal and release checklist current.

---

### Task 1: Pure Schema Lab Helpers

**Files:**
- Create: `src/lib/schemaLab.ts`
- Create: `src/lib/schemaLab.test.ts`

- [ ] **Step 1: Write failing tests for schema summary, examples, validation notes, and JSON-RPC payloads**

Create `src/lib/schemaLab.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  buildJsonRpcToolCall,
  generateExampleArgs,
  getSchemaLabRows,
  getSchemaLabSummary,
  validateToolSchema,
} from './schemaLab';
import type { ToolDef } from '../types';

const tool: ToolDef = {
  name: 'search_docs',
  description: 'Search project docs',
  inputSchema: {
    type: 'object',
    required: ['query', 'limit'],
    properties: {
      query: {
        type: 'string',
        description: 'Search text',
        default: 'release',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
      },
      mode: {
        type: 'string',
        enum: ['semantic', 'keyword'],
      },
      filters: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      includeArchived: {
        type: 'boolean',
      },
    },
  },
};

describe('schemaLab', () => {
  test('summarizes a tool input schema', () => {
    expect(getSchemaLabSummary(tool)).toEqual({
      rootType: 'object',
      propertyCount: 6,
      requiredCount: 2,
      optionalCount: 4,
      unsupportedRoot: false,
    });
  });

  test('returns parameter rows with required, enum, defaults, and constraints', () => {
    expect(getSchemaLabRows(tool)).toEqual([
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Search text',
        defaultValue: 'release',
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'limit',
        type: 'integer',
        required: true,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: 1,
        maximum: 20,
      },
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: ['semantic', 'keyword'],
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'filters',
        type: 'object',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'tags',
        type: 'array',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
      {
        name: 'includeArchived',
        type: 'boolean',
        required: false,
        description: undefined,
        defaultValue: undefined,
        enumValues: undefined,
        minimum: undefined,
        maximum: undefined,
      },
    ]);
  });

  test('generates deterministic example arguments from supported schema features', () => {
    expect(generateExampleArgs(tool)).toEqual({
      query: 'release',
      limit: 1,
      mode: 'semantic',
      filters: {
        owner: 'string',
      },
      tags: ['string'],
      includeArchived: false,
    });
  });

  test('builds a copyable JSON-RPC tools/call payload', () => {
    expect(buildJsonRpcToolCall(tool)).toEqual({
      method: 'tools/call',
      params: {
        name: 'search_docs',
        arguments: {
          query: 'release',
          limit: 1,
          mode: 'semantic',
          filters: {
            owner: 'string',
          },
          tags: ['string'],
          includeArchived: false,
        },
      },
    });
  });

  test('reports schema issues without requiring a full JSON Schema validator', () => {
    const badTool: ToolDef = {
      name: 'bad_tool',
      inputSchema: {
        type: 'string',
        required: ['missing'],
        properties: {
          count: { type: 'integerish' },
        },
      },
    };

    expect(validateToolSchema(badTool)).toEqual([
      {
        severity: 'warning',
        message: 'Root input schema type is "string"; MCP tool input schemas are expected to be object-shaped.',
      },
      {
        severity: 'error',
        message: 'Required field "missing" is not defined in properties.',
      },
      {
        severity: 'warning',
        message: 'Property "count" uses unsupported type "integerish"; SchemaForm will render it as text.',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- src/lib/schemaLab.test.ts
```

Expected: FAIL because `src/lib/schemaLab.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/lib/schemaLab.ts`:

```ts
import type { JsonSchema, JsonSchemaProperty, ToolDef } from '../types';

export interface SchemaLabSummary {
  rootType: string;
  propertyCount: number;
  requiredCount: number;
  optionalCount: number;
  unsupportedRoot: boolean;
}

export interface SchemaLabRow {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  enumValues?: unknown[];
  minimum?: number;
  maximum?: number;
}

export interface SchemaLabIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
}

const SUPPORTED_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);

function fieldType(prop: JsonSchemaProperty | JsonSchema): string {
  const raw = prop.type;
  if (Array.isArray(raw)) return raw.find((type) => type !== 'null') ?? 'string';
  return raw ?? 'string';
}

function propertiesFor(schema: JsonSchema): Record<string, JsonSchemaProperty> {
  return schema.properties ?? {};
}

function requiredFor(schema: JsonSchema): Set<string> {
  return new Set(schema.required ?? []);
}

export function getSchemaLabSummary(tool: ToolDef): SchemaLabSummary {
  const schema = tool.inputSchema;
  const rootType = fieldType(schema);
  const properties = propertiesFor(schema);
  const required = requiredFor(schema);
  const propertyCount = Object.keys(properties).length;
  const requiredCount = required.size;

  return {
    rootType,
    propertyCount,
    requiredCount,
    optionalCount: Math.max(propertyCount - requiredCount, 0),
    unsupportedRoot: rootType !== 'object',
  };
}

export function getSchemaLabRows(tool: ToolDef): SchemaLabRow[] {
  const schema = tool.inputSchema;
  const properties = propertiesFor(schema);
  const required = requiredFor(schema);

  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: fieldType(prop),
    required: required.has(name),
    description: prop.description,
    defaultValue: prop.default,
    enumValues: prop.enum,
    minimum: prop.minimum,
    maximum: prop.maximum,
  }));
}

function exampleForProperty(prop: JsonSchemaProperty): unknown {
  const type = fieldType(prop);
  if (prop.default !== undefined) return prop.default;
  if (prop.enum && prop.enum.length > 0) return prop.enum[0];

  switch (type) {
    case 'string':
      return 'string';
    case 'integer':
      return Number.isFinite(prop.minimum) ? prop.minimum : 1;
    case 'number':
      return Number.isFinite(prop.minimum) ? prop.minimum : 1;
    case 'boolean':
      return false;
    case 'array':
      return [prop.items ? exampleForProperty(prop.items) : 'item'];
    case 'object': {
      const childProps = prop.properties ?? {};
      return Object.fromEntries(
        Object.entries(childProps).map(([key, child]) => [key, exampleForProperty(child)]),
      );
    }
    default:
      return 'string';
  }
}

export function generateExampleArgs(tool: ToolDef): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(propertiesFor(tool.inputSchema)).map(([key, prop]) => [
      key,
      exampleForProperty(prop),
    ]),
  );
}

export function buildJsonRpcToolCall(tool: ToolDef): {
  method: 'tools/call';
  params: { name: string; arguments: Record<string, unknown> };
} {
  return {
    method: 'tools/call',
    params: {
      name: tool.name,
      arguments: generateExampleArgs(tool),
    },
  };
}

export function validateToolSchema(tool: ToolDef): SchemaLabIssue[] {
  const schema = tool.inputSchema;
  const rootType = fieldType(schema);
  const properties = propertiesFor(schema);
  const issues: SchemaLabIssue[] = [];

  if (rootType !== 'object') {
    issues.push({
      severity: 'warning',
      message: `Root input schema type is "${rootType}"; MCP tool input schemas are expected to be object-shaped.`,
    });
  }

  for (const required of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(properties, required)) {
      issues.push({
        severity: 'error',
        message: `Required field "${required}" is not defined in properties.`,
      });
    }
  }

  for (const [name, prop] of Object.entries(properties)) {
    const type = fieldType(prop);
    if (!SUPPORTED_TYPES.has(type)) {
      issues.push({
        severity: 'warning',
        message: `Property "${name}" uses unsupported type "${type}"; SchemaForm will render it as text.`,
      });
    }
  }

  if (issues.length === 0) {
    issues.push({
      severity: 'info',
      message: 'No obvious schema issues found for the subset supported by MCP Explorer.',
    });
  }

  return issues;
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run:

```bash
npm test -- src/lib/schemaLab.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper module**

```bash
git add src/lib/schemaLab.ts src/lib/schemaLab.test.ts
git commit -m "feat: add schema lab analysis helpers"
```

---

### Task 2: Schema Lab Panel UI

**Files:**
- Create: `src/components/SchemaLabPanel.tsx`
- Test manually through the app; no component test harness exists in this repo.

- [ ] **Step 1: Create the read-only Schema Lab panel**

Create `src/components/SchemaLabPanel.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { ServerEntry, ToolDef } from '../types';
import {
  buildJsonRpcToolCall,
  generateExampleArgs,
  getSchemaLabRows,
  getSchemaLabSummary,
  validateToolSchema,
} from '../lib/schemaLab';
import { CodeBlock } from './CodeBlock';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
}

function allTools(server: ServerEntry | null): ToolDef[] {
  if (!server) return [];
  const native = server.tools ?? [];
  const discovered = (server.discovered ?? []).filter(
    (tool) => !native.some((nativeTool) => nativeTool.name === tool.name),
  );
  return [...native, ...discovered];
}

function selectedToolFor(server: ServerEntry | null, toolName: string | null): ToolDef | null {
  const tools = allTools(server);
  if (!toolName) return tools[0] ?? null;
  return tools.find((tool) => tool.name === toolName) ?? tools[0] ?? null;
}

function issueClass(severity: string): string {
  if (severity === 'error') return 'border-red-900/60 bg-red-950/30 text-red-200';
  if (severity === 'warning') return 'border-amber-900/60 bg-amber-950/30 text-amber-200';
  return 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200';
}

export function SchemaLabPanel({ servers, selectedServerId, selectedToolName }: Props) {
  const connectedServers = servers.filter((server) => server.status === 'connected');
  const initialServerId = selectedServerId ?? connectedServers[0]?.id ?? '';
  const [serverId, setServerId] = useState(initialServerId);
  const activeServer = connectedServers.find((server) => server.id === serverId) ?? connectedServers[0] ?? null;
  const tools = allTools(activeServer);
  const initialToolName = selectedToolName ?? tools[0]?.name ?? '';
  const [toolName, setToolName] = useState(initialToolName);

  const tool = useMemo(
    () => selectedToolFor(activeServer, toolName),
    [activeServer, toolName],
  );

  if (connectedServers.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center px-8">
        <div className="max-w-sm">
          <p className="text-sm text-zinc-300">Connect a server to inspect tool schemas.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Schema Lab works from the tools advertised by connected MCP servers.
          </p>
        </div>
      </div>
    );
  }

  if (!tool || !activeServer) {
    return (
      <div className="flex-1 grid place-items-center text-center px-8">
        <div className="max-w-sm">
          <p className="text-sm text-zinc-300">No tools available on the selected server.</p>
          <p className="text-xs text-zinc-600 mt-1">
            Choose another connected server or discover additional tools first.
          </p>
        </div>
      </div>
    );
  }

  const summary = getSchemaLabSummary(tool);
  const rows = getSchemaLabRows(tool);
  const issues = validateToolSchema(tool);
  const exampleArgs = generateExampleArgs(tool);
  const jsonRpcCall = buildJsonRpcToolCall(tool);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-5">
      <div className="space-y-5">
        <section className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">Server</span>
            <select
              value={activeServer.id}
              onChange={(event) => {
                const nextServerId = event.target.value;
                setServerId(nextServerId);
                const nextServer = connectedServers.find((server) => server.id === nextServerId) ?? null;
                setToolName(allTools(nextServer)[0]?.name ?? '');
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm"
            >
              {connectedServers.map((server) => (
                <option key={server.id} value={server.id}>{server.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">Tool</span>
            <select
              value={tool.name}
              onChange={(event) => setToolName(event.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm font-mono"
            >
              {tools.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>{candidate.name}</option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <div className="text-xs text-zinc-500">{activeServer.name}</div>
          <h3 className="text-xl font-semibold text-zinc-50 font-mono mt-1">{tool.name}</h3>
          {tool.description && (
            <div className="mt-2">
              <MarkdownPreview source={tool.description} />
            </div>
          )}
        </section>

        <section className="grid grid-cols-4 gap-2">
          {[
            ['Root', summary.rootType],
            ['Properties', summary.propertyCount],
            ['Required', summary.requiredCount],
            ['Optional', summary.optionalCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
              <div className="text-sm text-zinc-100 font-mono mt-1">{String(value)}</div>
            </div>
          ))}
        </section>

        <section>
          <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
            Parameters
          </h4>
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950/80 text-[10px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Details</th>
                  <th className="text-left px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((row) => (
                  <tr key={row.name} className="bg-zinc-900/30">
                    <td className="px-3 py-2 font-mono text-zinc-100">
                      {row.name}
                      {row.required && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-rose-400">required</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-violet-300">{row.type}</td>
                    <td className="px-3 py-2 text-xs text-zinc-400">
                      {row.defaultValue !== undefined && <div>default: <code>{JSON.stringify(row.defaultValue)}</code></div>}
                      {row.enumValues && <div>enum: <code>{row.enumValues.map(String).join(', ')}</code></div>}
                      {row.minimum !== undefined && <div>min: <code>{row.minimum}</code></div>}
                      {row.maximum !== undefined && <div>max: <code>{row.maximum}</code></div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{row.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
            Validation Notes
          </h4>
          <div className="space-y-2">
            {issues.map((issue) => (
              <div key={`${issue.severity}:${issue.message}`} className={`rounded-lg border px-3 py-2 text-sm ${issueClass(issue.severity)}`}>
                <span className="font-semibold uppercase text-[10px] tracking-wide mr-2">{issue.severity}</span>
                {issue.message}
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
                Example Arguments
              </h4>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(JSON.stringify(exampleArgs, null, 2))}
                className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
              >
                Copy args
              </button>
            </div>
            <CodeBlock code={JSON.stringify(exampleArgs, null, 2)} lang="json" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
                JSON-RPC tools/call
              </h4>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(JSON.stringify(jsonRpcCall, null, 2))}
                className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
              >
                Copy call
              </button>
            </div>
            <CodeBlock code={JSON.stringify(jsonRpcCall, null, 2)} lang="json" />
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript build to catch UI type errors**

Run:

```bash
npm run build
```

Expected: PASS. If React hook lint later flags synchronous state derived from props, replace that state with derived values or event-only updates.

- [ ] **Step 3: Commit Schema Lab panel**

```bash
git add src/components/SchemaLabPanel.tsx
git commit -m "feat: add schema lab panel"
```

---

### Task 3: Convert Inspector Modal Into Dev Tools Modal

**Files:**
- Create: `src/components/DevToolsModal.tsx`
- Create or modify: `src/components/ProtocolInspectorPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ToolDetail.tsx`

- [ ] **Step 1: Split Protocol Inspector modal shell from timeline content**

If `src/components/ProtocolInspector.tsx` from PR #32 still owns both the modal shell and the timeline, split it:

```bash
mv src/components/ProtocolInspector.tsx src/components/ProtocolInspectorPanel.tsx
```

Then edit `ProtocolInspectorPanel.tsx`:
- Remove `open`, `onClose`, backdrop, modal header, and close button props/markup.
- Keep the trace subscription, empty state, timeline list, detail pane, copy event, and clear behavior.
- Export `ProtocolInspectorPanel`.

The resulting props should be:

```ts
interface Props {
  servers: ServerEntry[];
}
```

The top-level return should be either the empty state or the timeline grid, not a fixed modal wrapper.

- [ ] **Step 2: Create shared Dev Tools modal with tabs**

Create `src/components/DevToolsModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ServerEntry } from '../types';
import { ProtocolInspectorPanel } from './ProtocolInspectorPanel';
import { SchemaLabPanel } from './SchemaLabPanel';

export type DevToolsTab = 'protocol' | 'schema';

interface Props {
  open: boolean;
  initialTab: DevToolsTab;
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
  onClose: () => void;
}

const TABS: Array<{ id: DevToolsTab; label: string }> = [
  { id: 'protocol', label: 'Protocol Inspector' },
  { id: 'schema', label: 'Schema Lab' },
];

export function DevToolsModal({
  open,
  initialTab,
  servers,
  selectedServerId,
  selectedToolName,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<DevToolsTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-6xl mx-4 h-[84vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Dev Tools</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Inspect runtime MCP traffic and debug tool schemas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 hover:bg-zinc-800"
            aria-label="Close dev tools"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center px-5 pt-2 shrink-0 border-b border-zinc-800/80">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px uppercase tracking-wide',
                activeTab === tab.id
                  ? 'border-violet-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {activeTab === 'protocol' ? (
            <ProtocolInspectorPanel servers={servers} />
          ) : (
            <SchemaLabPanel
              servers={servers}
              selectedServerId={selectedServerId}
              selectedToolName={selectedToolName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `App.tsx` to open Dev Tools**

Replace the Protocol Inspector import/state/usage from PR #32:

```tsx
import { DevToolsModal, type DevToolsTab } from './components/DevToolsModal';
```

Add state:

```tsx
const [devToolsOpen, setDevToolsOpen] = useState(false);
const [devToolsInitialTab, setDevToolsInitialTab] = useState<DevToolsTab>('protocol');
```

Add helper:

```tsx
function openDevTools(tab: DevToolsTab) {
  setDevToolsInitialTab(tab);
  setDevToolsOpen(true);
}
```

Rename the header button from `Inspector` to `Dev Tools`:

```tsx
<button
  type="button"
  onClick={() => openDevTools('protocol')}
  title="Dev Tools"
  className="text-xs px-2 py-1 rounded-md border border-zinc-700/80 bg-zinc-900/60 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 transition-colors flex items-center gap-1 font-mono"
>
  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3" aria-hidden>
    <path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
  <span>Dev Tools</span>
</button>
```

Pass a new prop to `ToolDetail`:

```tsx
onOpenSchemaLab={() => openDevTools('schema')}
```

Render the modal near `GlobalSearch`:

```tsx
<DevToolsModal
  open={devToolsOpen}
  initialTab={devToolsInitialTab}
  servers={servers}
  selectedServerId={selectedServer?.id ?? null}
  selectedToolName={selectedToolName}
  onClose={() => setDevToolsOpen(false)}
/>
```

- [ ] **Step 4: Update `ToolDetail.tsx` to expose Schema Lab from the selected tool**

Add to props:

```ts
onOpenSchemaLab: () => void;
```

Thread it through `ToolDetail` into `ToolDetailSession`.

In the Arguments section header, replace the current header block with:

```tsx
<div className="flex items-center justify-between mb-4">
  <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
    Arguments
  </h2>
  <button
    type="button"
    onClick={onOpenSchemaLab}
    className="text-xs px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
  >
    Schema Lab
  </button>
</div>
```

- [ ] **Step 5: Run build and lint for integration issues**

Run:

```bash
npm run build
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit Dev Tools integration**

```bash
git add src/App.tsx src/components/ToolDetail.tsx src/components/DevToolsModal.tsx src/components/ProtocolInspectorPanel.tsx
git add -u src/components/ProtocolInspector.tsx
git commit -m "feat: add schema lab to dev tools"
```

---

### Task 4: Documentation And Release Checklist

**Files:**
- Modify: `.cursor/skills/prepare-for-release/SKILL.md`
- Modify: `.cursorrules`
- Modify: `README.md`
- Modify: `README.npm.md`

- [ ] **Step 1: Update release checklist with Schema Lab walkthrough**

In `.cursor/skills/prepare-for-release/SKILL.md`, add this after the Protocol Inspector section:

```markdown
### 3.16 Schema Lab

- Click **Dev Tools** in the top header and switch to the **Schema Lab** tab.
- Confirm Schema Lab shows connected server and tool selectors.
- Select a tool with required arguments and confirm required fields are highlighted in the parameter table.
- Confirm the schema summary shows root type, property count, required count, and optional count.
- Confirm validation notes render. A valid schema should show a positive/info note; malformed or unsupported schema shapes should show warning/error notes without crashing.
- Confirm generated example arguments are deterministic and match defaults, enum first values, and primitive fallback values.
- Click **Copy args** and confirm the clipboard receives JSON arguments.
- Click **Copy call** and confirm the clipboard receives a JSON-RPC `tools/call` payload with `method`, `params.name`, and `params.arguments`.
- From a selected tool detail page, click **Schema Lab** beside Arguments and confirm Dev Tools opens directly to Schema Lab for that tool.
```

- [ ] **Step 2: Update `.cursorrules` for shared Dev Tools modal**

Replace the Protocol Inspector section with:

```markdown
## Dev Tools Modal

- Developer debugging features should live in the shared Dev Tools modal when they inspect MCP runtime behavior or tool schemas.
- Protocol Inspector is the runtime tab. It should capture MCP calls from `src/lib/mcpClient.ts` through `src/lib/protocolTrace.ts`.
- Schema Lab is the read-only schema tab. Keep analysis logic in `src/lib/schemaLab.ts` and UI in `src/components/SchemaLabPanel.tsx`.
- Keep browser-session debugging data in memory unless the user explicitly asks for persistence.
- Avoid recording authentication material in any debugging view.
```

- [ ] **Step 3: Update READMEs**

In `README.md`, add to Features:

```markdown
- **Schema Lab** — inspect tool input schemas, highlight required fields, generate example arguments, and copy JSON-RPC `tools/call` payloads.
```

In `README.npm.md`, add to “What it does”:

```markdown
- Schema Lab for inspecting tool schemas, generating example args, and copying JSON-RPC calls
```

- [ ] **Step 4: Commit docs**

```bash
git add .cursor/skills/prepare-for-release/SKILL.md .cursorrules README.md README.npm.md
git commit -m "docs: add schema lab release checks"
```

---

### Task 5: Final Verification

**Files:**
- All changed files from Tasks 1-4.

- [ ] **Step 1: Run targeted helper tests**

```bash
npm test -- src/lib/schemaLab.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: PASS. Existing Vite Node version warning may appear on Node `20.18.2`.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm run dev
```

Manual expected behavior:
- Header shows `Dev Tools`.
- `Dev Tools` opens the shared modal with `Protocol Inspector` and `Schema Lab` tabs.
- Protocol Inspector still shows traces from connecting and invoking tools.
- Schema Lab shows server/tool selectors for connected servers.
- Schema Lab parameter table marks required fields.
- Example args and JSON-RPC call render as formatted JSON.
- `Copy args` and `Copy call` do not throw in the browser console.
- From a selected tool, the `Schema Lab` button beside Arguments opens Dev Tools directly to Schema Lab for that tool.

- [ ] **Step 6: Check git status and prepare PR**

```bash
git status --short
git log --oneline -3
```

Expected: working tree clean after commits.

---

## Self-Review

- Spec coverage: The plan covers shared modal placement, read-only Schema Lab, selected-tool defaulting, validation notes, example generation, required highlighting, copy JSON-RPC call, docs, release checks, and verification.
- Placeholder scan: No `TBD`, `TODO`, “similar to”, or unspecified test steps remain.
- Type consistency: The plan consistently uses `ToolDef`, `JsonSchema`, `JsonSchemaProperty`, `ServerEntry`, `DevToolsTab`, `SchemaLabPanel`, `ProtocolInspectorPanel`, and `DevToolsModal`.
- Scope check: Editable/mock schema mode is intentionally deferred; helper functions accept `ToolDef` now and can later be reused with locally edited schema data.
