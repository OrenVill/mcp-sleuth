# MCP Resources & Prompts Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `resources/*` and `prompts/*` MCP protocol support alongside tools, surfaced via a tab bar in the middle column with dedicated detail views in the right column.

**Architecture:** New `ServerBrowser` component wraps the existing `ToolList` with a tab bar (Tools / Resources / Prompts) and two sibling list components. Two new right-column components — `ResourceDetail` and `PromptDetail` — handle their respective detail views. `App.tsx` owns tab state and picks which detail to render.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, @modelcontextprotocol/sdk, Shiki (for syntax-highlighted content rendering), Vitest

---

## File Map

**New files:**
- `src/lib/uriTemplate.ts` — extract/fill URI template variables
- `src/lib/uriTemplate.test.ts` — tests for above
- `src/lib/promptSerialize.ts` — serialize PromptMessage[] to clipboard text
- `src/lib/promptSerialize.test.ts` — tests for above
- `src/components/ServerBrowser.tsx` — tab bar + conditional list rendering
- `src/components/ResourceList.tsx` — list direct + template resources
- `src/components/PromptList.tsx` — list prompts
- `src/components/ResourceDetail.tsx` — read + MIME-aware render
- `src/components/PromptDetail.tsx` — argument form + message render + copy

**Modified files:**
- `src/types.ts` — add ResourceEntry, ResourceTemplate, ResourceContent, PromptDef, PromptArgDef, PromptMessage; extend ServerEntry
- `src/lib/mcpClient.ts` — add listResources, readResource, listPrompts, getPrompt
- `src/App.tsx` — fetch resources/prompts on connect; add tab + selection state; render ServerBrowser + correct detail

---

## Task 1: Extend types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add the new types and extend ServerEntry**

Open `src/types.ts` and add after the existing `DiscoveryRun` block:

```ts
// --- Resources ---

export interface ResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 for binary
}

// --- Prompts ---

export interface PromptArgDef {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptDef {
  name: string;
  description?: string;
  arguments?: PromptArgDef[];
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: string; text?: string };
}
```

And add to `ServerEntry`:

```ts
  resources?: ResourceEntry[];
  resourceTemplates?: ResourceTemplate[];
  prompts?: PromptDef[];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(resources-prompts): add ResourceEntry, ResourceTemplate, ResourceContent, PromptDef, PromptMessage types"
```

---

## Task 2: URI template utility

**Files:**
- Create: `src/lib/uriTemplate.ts`
- Create: `src/lib/uriTemplate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/uriTemplate.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { extractUriTemplateVars, fillUriTemplate } from './uriTemplate';

describe('extractUriTemplateVars', () => {
  test('returns empty array for template with no vars', () => {
    expect(extractUriTemplateVars('file:///static/path')).toEqual([]);
  });

  test('extracts single variable', () => {
    expect(extractUriTemplateVars('file:///{path}')).toEqual(['path']);
  });

  test('extracts multiple variables', () => {
    expect(extractUriTemplateVars('https://api.example.com/{owner}/{repo}/issues/{id}')).toEqual(['owner', 'repo', 'id']);
  });

  test('deduplicates repeated variables', () => {
    expect(extractUriTemplateVars('{a}/{a}/{b}')).toEqual(['a', 'b']);
  });
});

describe('fillUriTemplate', () => {
  test('replaces all variables with their values', () => {
    expect(fillUriTemplate('file:///{path}', { path: 'docs/readme.md' })).toBe('file:///docs/readme.md');
  });

  test('leaves unfilled variables as empty string', () => {
    expect(fillUriTemplate('{owner}/{repo}', { owner: 'acme' })).toBe('acme/');
  });

  test('handles template with no variables', () => {
    expect(fillUriTemplate('file:///static', {})).toBe('file:///static');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/uriTemplate.test.ts
```

Expected: FAIL with "Cannot find module './uriTemplate'"

- [ ] **Step 3: Implement the utility**

Create `src/lib/uriTemplate.ts`:

```ts
export function extractUriTemplateVars(template: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of template.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function fillUriTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => values[name] ?? '');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/uriTemplate.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/uriTemplate.ts src/lib/uriTemplate.test.ts
git commit -m "feat(resources-prompts): add URI template variable extraction utility"
```

---

## Task 3: Prompt serialization utility

**Files:**
- Create: `src/lib/promptSerialize.ts`
- Create: `src/lib/promptSerialize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/promptSerialize.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { serializePromptMessages } from './promptSerialize';
import type { PromptMessage } from '../types';

describe('serializePromptMessages', () => {
  test('serializes a single user message', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'text', text: 'Hello world' } },
    ];
    expect(serializePromptMessages(msgs)).toBe('user: Hello world');
  });

  test('serializes multiple messages separated by blank lines', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'text', text: 'Say hi' } },
      { role: 'assistant', content: { type: 'text', text: 'Hi there!' } },
    ];
    expect(serializePromptMessages(msgs)).toBe('user: Say hi\n\nassistant: Hi there!');
  });

  test('falls back to JSON for non-text content', () => {
    const msgs: PromptMessage[] = [
      { role: 'user', content: { type: 'image', data: 'base64...' } as never },
    ];
    const result = serializePromptMessages(msgs);
    expect(result).toContain('user:');
    expect(result).toContain('"type": "image"');
  });

  test('returns empty string for empty array', () => {
    expect(serializePromptMessages([])).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/promptSerialize.test.ts
```

Expected: FAIL with "Cannot find module './promptSerialize'"

- [ ] **Step 3: Implement the utility**

Create `src/lib/promptSerialize.ts`:

```ts
import type { PromptMessage } from '../types';

export function serializePromptMessages(messages: PromptMessage[]): string {
  return messages
    .map((m) => {
      const text =
        m.content.type === 'text' && m.content.text !== undefined
          ? m.content.text
          : JSON.stringify(m.content, null, 2);
      return `${m.role}: ${text}`;
    })
    .join('\n\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/promptSerialize.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/promptSerialize.ts src/lib/promptSerialize.test.ts
git commit -m "feat(resources-prompts): add prompt message serialization utility"
```

---

## Task 4: MCP client — resources

**Files:**
- Modify: `src/lib/mcpClient.ts`

- [ ] **Step 1: Add listResources and readResource**

Add these two exports to the end of `src/lib/mcpClient.ts`:

```ts
export async function listResources(
  serverId: string,
): Promise<{ resources: ResourceEntry[]; templates: ResourceTemplate[] }> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.listResources();
  const resources = (result.resources ?? []) as unknown as ResourceEntry[];
  const templates = (result.resourceTemplates ?? []) as unknown as ResourceTemplate[];
  return { resources, templates };
}

export async function readResource(
  serverId: string,
  uri: string,
): Promise<{ contents: ResourceContent[] }> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.readResource({ uri });
  return { contents: result.contents as unknown as ResourceContent[] };
}
```

Also add the missing imports at the top of `mcpClient.ts` — add `ResourceEntry, ResourceTemplate, ResourceContent` to the existing import from `'../types'`:

```ts
import type { ResourceEntry, ResourceTemplate, ResourceContent, ServerAuth, ToolDef, ToolResult } from '../types';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcpClient.ts
git commit -m "feat(resources-prompts): add listResources and readResource to mcpClient"
```

---

## Task 5: MCP client — prompts

**Files:**
- Modify: `src/lib/mcpClient.ts`

- [ ] **Step 1: Add listPrompts and getPrompt**

Add these two exports to the end of `src/lib/mcpClient.ts`. Also add `PromptDef, PromptMessage` to the import line updated in Task 4:

```ts
import type { ResourceEntry, ResourceTemplate, ResourceContent, PromptDef, PromptMessage, ServerAuth, ToolDef, ToolResult } from '../types';
```

Then add at the end of the file:

```ts
export async function listPrompts(serverId: string): Promise<PromptDef[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.listPrompts();
  return result.prompts as unknown as PromptDef[];
}

export async function getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>,
): Promise<PromptMessage[]> {
  const client = clients.get(serverId);
  if (!client) throw new Error(`Not connected to server "${serverId}"`);
  const result = await client.getPrompt({ name, arguments: args });
  return result.messages as unknown as PromptMessage[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mcpClient.ts
git commit -m "feat(resources-prompts): add listPrompts and getPrompt to mcpClient"
```

---

## Task 6: Fetch resources & prompts on connect

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add tab and selection state to App**

In `App.tsx`, add these three state declarations alongside the existing `selectedToolName` state:

```ts
const [activeTab, setActiveTab] = useState<'tools' | 'resources' | 'prompts'>('tools');
const [selectedResourceUri, setSelectedResourceUri] = useState<string | null>(null);
const [selectedPromptName, setSelectedPromptName] = useState<string | null>(null);
```

- [ ] **Step 2: Update handleConnect to fetch resources and prompts**

In `App.tsx`, update the import to include the new mcpClient functions:

```ts
import { connect, disconnect, callTool as mcpCallTool, onToolsChanged, refetchTools, listResources, listPrompts } from './lib/mcpClient';
```

Inside `handleConnect`, after the `connect(id, url, auth)` call succeeds and before `updateServer`, add a parallel fetch:

```ts
const tools = await connect(id, url, auth);
const metaTools = detectMetaTools(tools);

// Fetch resources and prompts in parallel; ignore if server doesn't support them
const [resourceResult, promptResult] = await Promise.allSettled([
  listResources(id),
  listPrompts(id),
]);

const resources = resourceResult.status === 'fulfilled' ? resourceResult.value.resources : undefined;
const resourceTemplates = resourceResult.status === 'fulfilled' ? resourceResult.value.templates : undefined;
const prompts = promptResult.status === 'fulfilled' ? promptResult.value : undefined;

updateServer(id, {
  status: 'connected',
  tools,
  metaTools,
  resources,
  resourceTemplates,
  prompts,
  discovered: undefined,
  discoveryRuns: {},
  error: undefined,
});
```

- [ ] **Step 3: Reset resource/prompt selection on server switch or disconnect**

In `handleSelect`, reset all selections:

```ts
function handleSelect(id: string) {
  setSelectedId(id);
  setSelectedToolName(null);
  setSelectedResourceUri(null);
  setSelectedPromptName(null);
}
```

In `handleDisconnect`, add to the existing reset:

```ts
if (selectedId === id) {
  setSelectedToolName(null);
  setSelectedResourceUri(null);
  setSelectedPromptName(null);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(resources-prompts): fetch resources and prompts on connect, add tab state"
```

---

## Task 7: ResourceList component

**Files:**
- Create: `src/components/ResourceList.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ResourceList.tsx`:

```tsx
import { useState } from 'react';
import type { ResourceEntry, ResourceTemplate, ServerEntry } from '../types';

interface Props {
  server: ServerEntry;
  selectedUri: string | null;
  onSelect: (uri: string) => void;
}

function SectionHeader({ label, count, open, onToggle }: { label: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold hover:text-zinc-300 transition-colors"
    >
      <span>{label} <span className="text-zinc-600 font-normal">({count})</span></span>
      <svg viewBox="0 0 16 16" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </button>
  );
}

function ResourceRow({ item, uri, selected, onSelect }: { item: ResourceEntry | ResourceTemplate; uri: string; selected: boolean; onSelect: () => void }) {
  const subtitle = 'uri' in item ? item.uri : item.uriTemplate;
  return (
    <li
      onClick={onSelect}
      className={[
        'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
        selected
          ? 'bg-zinc-900/90 border border-zinc-700/70'
          : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
      ].join(' ')}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
      )}
      <div className="font-mono text-xs text-zinc-100 truncate">{item.name}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5 truncate leading-snug">{subtitle}</div>
    </li>
  );
}

export function ResourceList({ server, selectedUri, onSelect }: Props) {
  const [directOpen, setDirectOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);

  const resources = server.resources ?? [];
  const templates = server.resourceTemplates ?? [];

  if (resources.length === 0 && templates.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-zinc-500 text-center">
        No resources advertised.
      </div>
    );
  }

  return (
    <ul className="py-1">
      {resources.length > 0 && (
        <>
          <SectionHeader label="Resources" count={resources.length} open={directOpen} onToggle={() => setDirectOpen((v) => !v)} />
          {directOpen && resources.map((r) => (
            <ResourceRow key={r.uri} item={r} uri={r.uri} selected={selectedUri === r.uri} onSelect={() => onSelect(r.uri)} />
          ))}
        </>
      )}
      {templates.length > 0 && (
        <>
          <SectionHeader label="Templates" count={templates.length} open={templatesOpen} onToggle={() => setTemplatesOpen((v) => !v)} />
          {templatesOpen && templates.map((t) => (
            <ResourceRow key={t.uriTemplate} item={t} uri={t.uriTemplate} selected={selectedUri === t.uriTemplate} onSelect={() => onSelect(t.uriTemplate)} />
          ))}
        </>
      )}
    </ul>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResourceList.tsx
git commit -m "feat(resources-prompts): add ResourceList component"
```

---

## Task 8: PromptList component

**Files:**
- Create: `src/components/PromptList.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/PromptList.tsx`:

```tsx
import type { ServerEntry } from '../types';

interface Props {
  server: ServerEntry;
  selectedPromptName: string | null;
  onSelect: (name: string) => void;
}

export function PromptList({ server, selectedPromptName, onSelect }: Props) {
  const prompts = server.prompts ?? [];

  if (prompts.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-zinc-500 text-center">
        No prompts advertised.
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1">
      {prompts.map((p) => {
        const isSelected = p.name === selectedPromptName;
        return (
          <li
            key={p.name}
            onClick={() => onSelect(p.name)}
            className={[
              'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
              isSelected
                ? 'bg-zinc-900/90 border border-zinc-700/70'
                : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
            ].join(' ')}
          >
            {isSelected && (
              <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
            )}
            <div className="font-mono text-xs text-zinc-100 truncate">{p.name}</div>
            {p.description && (
              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">
                {p.description}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PromptList.tsx
git commit -m "feat(resources-prompts): add PromptList component"
```

---

## Task 9: ServerBrowser component

**Files:**
- Create: `src/components/ServerBrowser.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ServerBrowser.tsx`:

```tsx
import type { ServerEntry } from '../types';
import { ToolList } from './ToolList';
import { ResourceList } from './ResourceList';
import { PromptList } from './PromptList';

type Tab = 'tools' | 'resources' | 'prompts';

interface Props {
  server: ServerEntry | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedToolName: string | null;
  onSelectTool: (name: string) => void;
  selectedResourceUri: string | null;
  onSelectResource: (uri: string) => void;
  selectedPromptName: string | null;
  onSelectPrompt: (name: string) => void;
}

export function ServerBrowser({
  server,
  activeTab,
  onTabChange,
  selectedToolName,
  onSelectTool,
  selectedResourceUri,
  onSelectResource,
  selectedPromptName,
  onSelectPrompt,
}: Props) {
  if (!server || server.status !== 'connected') {
    return (
      <ToolList
        server={server}
        selectedToolName={selectedToolName}
        onSelect={onSelectTool}
      />
    );
  }

  const toolCount = (server.tools?.length ?? 0) + (server.discovered?.length ?? 0);
  const resourceCount = (server.resources?.length ?? 0) + (server.resourceTemplates?.length ?? 0);
  const promptCount = server.prompts?.length ?? 0;

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'tools', label: 'Tools', count: toolCount },
    { id: 'resources', label: 'Resources', count: resourceCount },
    { id: 'prompts', label: 'Prompts', count: promptCount },
  ].filter((t) => t.id === 'tools' || t.count > 0);

  const resolvedTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'tools';

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/20">
      {tabs.length > 1 && (
        <div className="flex border-b border-zinc-800/80 px-2 pt-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                'px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px',
                resolvedTab === tab.id
                  ? 'border-violet-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {tab.label}
              <span className={`ml-1.5 ${resolvedTab === tab.id ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {resolvedTab === 'tools' && (
          <ToolList
            server={server}
            selectedToolName={selectedToolName}
            onSelect={onSelectTool}
            embedded
          />
        )}
        {resolvedTab === 'resources' && (
          <ResourceList
            server={server}
            selectedUri={selectedResourceUri}
            onSelect={onSelectResource}
          />
        )}
        {resolvedTab === 'prompts' && (
          <PromptList
            server={server}
            selectedPromptName={selectedPromptName}
            onSelect={onSelectPrompt}
          />
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Add `embedded` prop to ToolList**

`ToolList` currently renders its own `<aside>` wrapper. When embedded in `ServerBrowser`, we only want the inner content (no wrapper, no header). Add an `embedded?: boolean` prop to `ToolList`:

In `src/components/ToolList.tsx`, update the `Props` interface:

```ts
interface Props {
  server: ServerEntry | null;
  selectedToolName: string | null;
  onSelect: (toolName: string) => void;
  embedded?: boolean;
}
```

Then update the `ToolList` function: when `embedded` is true, skip the outer `<aside>` and just return the `<ul>`:

```tsx
export function ToolList({ server, selectedToolName, onSelect, embedded }: Props) {
  if (!server) {
    if (embedded) return null;
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800/80 p-6 text-sm text-zinc-500 bg-zinc-950/20">
        <div className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Tools</div>
        Select a server from the left.
      </div>
    );
  }

  if (server.status !== 'connected') {
    if (embedded) return null;
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800/80 p-6 text-sm bg-zinc-950/20">
        <div className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Tools</div>
        <p className="text-zinc-400">
          Connect to <span className="text-zinc-200 font-medium">{server.name}</span> to discover tools.
        </p>
      </div>
    );
  }

  const tools = server.tools ?? [];

  const listContent = (
    <>
      {tools.length === 0 && (
        <li className="px-4 py-6 text-sm text-zinc-500 text-center">
          No tools advertised.
        </li>
      )}
      {tools.map((t: ToolDef) => {
        const isSelected = t.name === selectedToolName;
        const desc = stripEmoji(t.description ?? '').split('\n').filter(Boolean)[0];
        return (
          <li
            key={t.name}
            onClick={() => onSelect(t.name)}
            className={[
              'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
              isSelected
                ? 'bg-zinc-900/90 border border-zinc-700/70'
                : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
            ].join(' ')}
          >
            {isSelected && (
              <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
            )}
            <div className="font-mono text-xs text-zinc-100 truncate">{t.name}</div>
            {desc && (
              <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">
                {desc}
              </div>
            )}
          </li>
        );
      })}
      <DiscoveredToolsSection
        tools={server.discovered ?? []}
        nativeNames={new Set(tools.map((t) => t.name))}
        selectedToolName={selectedToolName}
        onSelect={onSelect}
      />
    </>
  );

  if (embedded) {
    return <ul className="py-1">{listContent}</ul>;
  }

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800/80 flex flex-col h-full bg-zinc-950/20">
      <div className="px-4 py-3.5 border-b border-zinc-800/80 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
          Tools
        </h2>
        <span className="text-[11px] text-zinc-600">{tools.length}</span>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">{listContent}</ul>
    </aside>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ServerBrowser.tsx src/components/ToolList.tsx
git commit -m "feat(resources-prompts): add ServerBrowser tab bar, add embedded mode to ToolList"
```

---

## Task 10: Wire ServerBrowser into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace ToolList with ServerBrowser in App.tsx**

Update the import in `App.tsx` — remove the `ToolList` import, add `ServerBrowser`:

```ts
import { ServerBrowser } from './components/ServerBrowser';
```

In the JSX return (the main layout), replace:

```tsx
<ToolList
  server={selectedServer}
  selectedToolName={selectedToolName}
  onSelect={setSelectedToolName}
/>
```

With:

```tsx
<ServerBrowser
  server={selectedServer}
  activeTab={activeTab}
  onTabChange={(tab) => {
    setActiveTab(tab);
    setSelectedToolName(null);
    setSelectedResourceUri(null);
    setSelectedPromptName(null);
  }}
  selectedToolName={selectedToolName}
  onSelectTool={setSelectedToolName}
  selectedResourceUri={selectedResourceUri}
  onSelectResource={setSelectedResourceUri}
  selectedPromptName={selectedPromptName}
  onSelectPrompt={setSelectedPromptName}
/>
```

- [ ] **Step 2: Verify TypeScript compiles and app runs**

```bash
npx tsc -b --noEmit
npm run dev
```

Open http://localhost:5173. Connect to a server. You should see the tab bar (if the server advertises resources or prompts) or just the normal tool list (if not). The Tools tab should work exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(resources-prompts): wire ServerBrowser into App replacing direct ToolList"
```

---

## Task 11: ResourceDetail component

**Files:**
- Create: `src/components/ResourceDetail.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ResourceDetail.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ResourceContent, ResourceEntry, ResourceTemplate, ServerEntry } from '../types';
import { readResource } from '../lib/mcpClient';
import { extractUriTemplateVars, fillUriTemplate } from '../lib/uriTemplate';
import { CodeBlock } from './CodeBlock';
import type { SupportedLang } from '../lib/highlighter';

interface Props {
  server: ServerEntry;
  uri: string; // may be a URI template string
}

function mimeToLang(mimeType: string | undefined): SupportedLang {
  if (!mimeType) return 'text';
  if (mimeType === 'application/json') return 'json';
  if (mimeType === 'text/markdown') return 'markdown';
  if (mimeType === 'text/html') return 'html';
  return 'text';
}

function BinaryContent({ content }: { content: ResourceContent }) {
  const blob = content.blob ?? '';
  const mime = content.mimeType ?? 'application/octet-stream';
  const byteLength = Math.ceil((blob.length * 3) / 4);
  const dataUrl = `data:${mime};base64,${blob}`;
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-400">
      Binary content ({byteLength} bytes, <span className="text-zinc-500">{mime}</span>)
      <a
        href={dataUrl}
        download={content.uri.split('/').pop() ?? 'resource'}
        className="ml-3 text-violet-400 hover:text-violet-300 underline transition-colors"
      >
        Download
      </a>
    </div>
  );
}

function ContentBlock({ content }: { content: ResourceContent }) {
  if (content.text !== undefined) {
    const lang = mimeToLang(content.mimeType);
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">
            {content.mimeType ?? 'text'}
          </span>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(content.text!).catch(() => {}); }}
            className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            copy
          </button>
        </div>
        <CodeBlock code={content.text} lang={lang} />
      </div>
    );
  }
  if (content.blob !== undefined) {
    return <BinaryContent content={content} />;
  }
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-500">
      Empty response.
    </div>
  );
}

function DirectResource({ server, resource }: { server: ServerEntry; resource: ResourceEntry }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contents, setContents] = useState<ResourceContent[] | null>(null);

  async function doRead() {
    setLoading(true);
    setError(null);
    setContents(null);
    try {
      const result = await readResource(server.id, resource.uri);
      setContents(result.contents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-zinc-100 font-semibold">{resource.name}</h2>
          <p className="text-[11px] text-zinc-500 font-mono mt-0.5 break-all">{resource.uri}</p>
          {resource.description && (
            <p className="text-sm text-zinc-400 mt-1">{resource.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void doRead()}
          disabled={loading}
          className="shrink-0 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? 'Reading…' : 'Read'}
        </button>
      </div>
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {contents && contents.map((c, i) => <ContentBlock key={i} content={c} />)}
    </div>
  );
}

function TemplateResource({ server, template }: { server: ServerEntry; template: ResourceTemplate }) {
  const vars = extractUriTemplateVars(template.uriTemplate);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(vars.map((v) => [v, ''])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contents, setContents] = useState<ResourceContent[] | null>(null);

  async function doRead() {
    const uri = fillUriTemplate(template.uriTemplate, values);
    setLoading(true);
    setError(null);
    setContents(null);
    try {
      const result = await readResource(server.id, uri);
      setContents(result.contents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-zinc-100 font-semibold">{template.name}</h2>
        <p className="text-[11px] text-zinc-500 font-mono mt-0.5 break-all">{template.uriTemplate}</p>
        {template.description && (
          <p className="text-sm text-zinc-400 mt-1">{template.description}</p>
        )}
      </div>
      {vars.length > 0 && (
        <div className="space-y-2">
          {vars.map((v) => (
            <div key={v} className="flex items-center gap-3">
              <label className="text-[11px] font-mono text-zinc-400 w-28 shrink-0">{v}</label>
              <input
                type="text"
                value={values[v] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                placeholder={v}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => void doRead()}
        disabled={loading}
        className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? 'Reading…' : 'Read'}
      </button>
      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {contents && contents.map((c, i) => <ContentBlock key={i} content={c} />)}
    </div>
  );
}

export function ResourceDetail({ server, uri }: Props) {
  const direct = server.resources?.find((r) => r.uri === uri);
  const template = server.resourceTemplates?.find((t) => t.uriTemplate === uri);

  if (direct) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <DirectResource key={uri} server={server} resource={direct} />
      </main>
    );
  }
  if (template) {
    return (
      <main className="flex-1 overflow-y-auto p-6">
        <TemplateResource key={uri} server={server} template={template} />
      </main>
    );
  }
  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResourceDetail.tsx
git commit -m "feat(resources-prompts): add ResourceDetail with MIME-aware render and URI template form"
```

---

## Task 12: PromptDetail component

**Files:**
- Create: `src/components/PromptDetail.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/PromptDetail.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { PromptDef, PromptMessage, ServerEntry } from '../types';
import { getPrompt } from '../lib/mcpClient';
import { serializePromptMessages } from '../lib/promptSerialize';
import { CodeBlock } from './CodeBlock';
import { detectLanguage } from '../lib/highlighter';

interface Props {
  server: ServerEntry;
  prompt: PromptDef;
}

function MessageCard({ message }: { message: PromptMessage }) {
  const text = message.content.text ?? JSON.stringify(message.content, null, 2);
  const lang = message.content.type === 'text' ? detectLanguage(text) : 'json';
  const isUser = message.role === 'user';

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center gap-2 bg-zinc-950/40">
        <span
          className={[
            'text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-md',
            isUser
              ? 'bg-blue-950/60 text-blue-300 border border-blue-900/60'
              : 'bg-violet-950/60 text-violet-300 border border-violet-900/60',
          ].join(' ')}
        >
          {message.role}
        </span>
        <span className="text-[10px] text-zinc-600">{message.content.type}</span>
      </div>
      <CodeBlock code={text} lang={lang} />
    </div>
  );
}

export function PromptDetail({ server, prompt }: Props) {
  const hasArgs = (prompt.arguments?.length ?? 0) > 0;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((prompt.arguments ?? []).map((a) => [a.name, ''])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<PromptMessage[] | null>(null);

  async function doGet(args: Record<string, string>) {
    setLoading(true);
    setError(null);
    setMessages(null);
    try {
      const result = await getPrompt(server.id, prompt.name, args);
      setMessages(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch for prompts without arguments
  useEffect(() => {
    if (!hasArgs) {
      void doGet({});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.name, server.id]);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-zinc-100 font-semibold font-mono">{prompt.name}</h2>
            {prompt.description && (
              <p className="text-sm text-zinc-400 mt-1">{prompt.description}</p>
            )}
          </div>
          {messages && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(serializePromptMessages(messages)).catch(() => {});
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-zinc-700 text-[11px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              Copy all
            </button>
          )}
        </div>

        {hasArgs && (
          <div className="space-y-2">
            {(prompt.arguments ?? []).map((arg) => (
              <div key={arg.name} className="flex items-center gap-3">
                <label className="text-[11px] font-mono text-zinc-400 w-28 shrink-0">
                  {arg.name}
                  {arg.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type="text"
                  value={values[arg.name] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [arg.name]: e.target.value }))
                  }
                  placeholder={arg.description ?? arg.name}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none transition-colors"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void doGet(values)}
              disabled={loading}
              className="mt-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {loading ? 'Getting prompt…' : 'Get prompt'}
            </button>
          </div>
        )}

        {loading && !hasArgs && (
          <div className="text-sm text-zinc-500 flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {messages && (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <MessageCard key={i} message={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/PromptDetail.tsx
git commit -m "feat(resources-prompts): add PromptDetail with argument form, Shiki rendering, and copy"
```

---

## Task 13: Wire detail components into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports and computed selections**

Add to `App.tsx` imports:

```ts
import { ResourceDetail } from './components/ResourceDetail';
import { PromptDetail } from './components/PromptDetail';
```

Add computed selections (alongside existing `selectedTool` useMemo):

```ts
const selectedResource = useMemo(() => {
  if (!selectedServer || !selectedResourceUri) return null;
  const direct = selectedServer.resources?.find((r) => r.uri === selectedResourceUri);
  if (direct) return { type: 'direct' as const, uri: selectedResourceUri };
  const template = selectedServer.resourceTemplates?.find((t) => t.uriTemplate === selectedResourceUri);
  if (template) return { type: 'template' as const, uri: selectedResourceUri };
  return null;
}, [selectedServer, selectedResourceUri]);

const selectedPrompt = useMemo(() => {
  if (!selectedServer || !selectedPromptName) return null;
  return selectedServer.prompts?.find((p) => p.name === selectedPromptName) ?? null;
}, [selectedServer, selectedPromptName]);
```

- [ ] **Step 2: Render the right detail component**

In the JSX layout, replace:

```tsx
<ToolDetail
  server={selectedServer}
  tool={selectedTool}
  metaBinding={selectedMeta}
  discoveryRun={selectedRun}
  onDiscover={(metaToolName, opts) => {
    if (selectedServer) void handleDiscover(selectedServer.id, metaToolName, opts);
  }}
  onStop={(metaToolName) => {
    if (selectedServer) handleDiscoveryStop(selectedServer.id, metaToolName);
  }}
/>
```

With:

```tsx
{activeTab === 'resources' && selectedServer && selectedResource ? (
  <ResourceDetail
    key={selectedResource.uri}
    server={selectedServer}
    uri={selectedResource.uri}
  />
) : activeTab === 'prompts' && selectedServer && selectedPrompt ? (
  <PromptDetail
    key={`${selectedServer.id}:${selectedPrompt.name}`}
    server={selectedServer}
    prompt={selectedPrompt}
  />
) : (
  <ToolDetail
    server={selectedServer}
    tool={selectedTool}
    metaBinding={selectedMeta}
    discoveryRun={selectedRun}
    onDiscover={(metaToolName, opts) => {
      if (selectedServer) void handleDiscover(selectedServer.id, metaToolName, opts);
    }}
    onStop={(metaToolName) => {
      if (selectedServer) handleDiscoveryStop(selectedServer.id, metaToolName);
    }}
  />
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(resources-prompts): wire ResourceDetail and PromptDetail into App"
```

---

## Task 14: Full test suite and manual verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (includes new uriTemplate and promptSerialize tests, plus all pre-existing tests).

- [ ] **Step 2: Build the production bundle**

```bash
npm run build
```

Expected: build completes with no TypeScript or Vite errors.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open http://localhost:5173. Connect to an MCP server.

Verify:
- **Tools tab**: existing tool list works exactly as before.
- **Resources tab** (if server has resources): tab appears with count, clicking a direct resource shows Read button, clicking Read shows MIME-appropriate content, copy button works.
- **Templates** (if server has templates): filling in template variables and clicking Read fetches content.
- **Prompts tab** (if server has prompts): tab appears, selecting a no-arg prompt auto-fetches, selecting an arg prompt shows form, Get prompt renders messages with role badges, Copy all copies `role: content` text to clipboard.
- If server has neither resources nor prompts: no extra tabs appear.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(resources-prompts): complete MCP resources and prompts support"
```
