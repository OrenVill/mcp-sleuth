# MCP Resources & Prompts Support

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Add full MCP protocol coverage for `resources/*` and `prompts/*` alongside the existing `tools/*` support. The middle column gains a tab bar (Tools / Resources / Prompts); the right column gains two new detail components. This closes the protocol gap without restructuring the existing tool flow.

## Architecture

### Approach

New `ServerBrowser` component owns the tab bar and conditionally renders `ToolList`, `ResourceList`, or `PromptList`. Two new right-column components — `ResourceDetail` and `PromptDetail` — handle their respective detail views. `App.tsx` picks which detail to render based on the active tab.

### Component map

```
App.tsx
├── ServerList (unchanged)
├── ServerBrowser          ← new wrapper
│   ├── tab bar            (Tools n | Resources n | Prompts n)
│   ├── ToolList           (existing, unchanged)
│   ├── ResourceList       ← new
│   └── PromptList         ← new
└── [active detail]
    ├── ToolDetail         (existing, unchanged)
    ├── ResourceDetail     ← new
    └── PromptDetail       ← new
```

### Tab state

- Single `activeTab: 'tools' | 'resources' | 'prompts'` in `App.tsx` — global, does not reset on server switch (user stays in "resources mode" while browsing servers).
- `selectedResourceUri: string | null` and `selectedPromptName: string | null` added alongside existing `selectedToolName`.
- Switching tab resets the selection for the tab being left.
- Tabs with zero items are hidden. No empty "Resources" tab if the server doesn't advertise any.

## Data Model

### New types (`types.ts`)

```ts
interface ResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64 for binary
}

interface PromptDef {
  name: string;
  description?: string;
  arguments?: PromptArgDef[];
}

interface PromptArgDef {
  name: string;
  description?: string;
  required?: boolean;
}

interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: string; text?: string };
}
```

### `ServerEntry` additions

```ts
resources?: ResourceEntry[]
resourceTemplates?: ResourceTemplate[]
prompts?: PromptDef[]
```

Fetched on connect, stored in memory (not vault-persisted — fetched fresh each connection, like `tools`).

## MCP Client Additions (`mcpClient.ts`)

Four new functions, mirroring the existing `callTool` / `refetchTools` pattern. Errors propagate to callers — no silent swallowing.

```ts
listResources(serverId: string): Promise<{
  resources: ResourceEntry[];
  templates: ResourceTemplate[];
}>

readResource(serverId: string, uri: string): Promise<{
  contents: ResourceContent[];
}>

listPrompts(serverId: string): Promise<PromptDef[]>

getPrompt(
  serverId: string,
  name: string,
  args: Record<string, string>
): Promise<PromptMessage[]>
```

### On connect (`handleConnect` in `App.tsx`)

`listResources` and `listPrompts` run in parallel with `connect`. If either throws (server doesn't support them), the error is caught and the field is left `undefined` — the corresponding tab stays hidden.

## Middle Column — `ServerBrowser`

New component replacing the direct `ToolList` render in `App.tsx`.

**Tab bar:**
- Shows "Tools (n) | Resources (n) | Prompts (n)" counts.
- Tabs with zero items are hidden.
- Active tab: violet underline. Inactive: zinc-500. Matches existing palette.
- Hidden entirely when server is disconnected.

**List components:**

`ResourceList` — two collapsible sections:
- "Resources" — direct URI resources, each showing name + URI
- "Templates" — URI-template resources, each showing name + template string
- Clicking an item selects it (same pattern as tool selection)

`PromptList` — flat list:
- Each item shows name + optional description
- Same selection pattern as tools

## Right Column

### `ResourceDetail`

**Direct resource selected:**
1. "Read" button triggers `readResource(serverId, uri)`
2. Result rendered by MIME type:
   - `application/json` → syntax-highlighted `CodeBlock`
   - `text/markdown` → rendered markdown
   - `text/*` (plain, csv, xml, html, …) → `CodeBlock` with detected language
   - Binary / unknown → "binary content (N bytes)" notice + download link via `data:` URL
3. Copy button for text content

**URI-template resource selected:**
1. Variables extracted via `{varname}` regex (no RFC 6570 library — simple brace-match covers all real-world MCP templates). One text input per variable (e.g. `file:///{path}` → field `path`).
2. "Read" button fills the URI and calls `readResource`
3. Same MIME-aware rendering as direct resources

### `PromptDetail`

**With arguments:**
1. Compact form — one text input per argument, required args marked with `*`
2. "Get prompt" button calls `getPrompt(serverId, name, filledArgs)`

**Without arguments:**
- Auto-fetches on selection (no button)

**Result rendering:**
- Each `PromptMessage` as a card: role badge (`user` in blue, `assistant` in violet) + content below
- Content rendered as markdown if `type === 'text'`, `CodeBlock` if it looks like code
- "Copy all" button at the top serializes all messages to a `role: content` block and copies to clipboard

## Error Handling

- `readResource` / `getPrompt` errors shown inline in the detail component (same pattern as tool invocation errors in `ResultPane`)
- Loading states shown with a spinner / disabled button during in-flight requests

## Out of Scope

- Resource subscriptions (`resources/subscribe`) — read-only for now
- Forwarding rendered prompts to an LLM
- Persisting resource/prompt lists to the vault (fetched fresh on connect)
