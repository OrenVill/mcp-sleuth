export type ServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Persisted auth configuration for MCP HTTP requests (merged into StreamableHTTPClientTransport requestInit). */
export type ServerAuthMethod = 'none' | 'bearer' | 'api_key' | 'basic';

export interface ServerAuth {
  method: ServerAuthMethod;
  /** Authorization: Bearer … */
  bearerToken?: string;
  /** Custom header name (e.g. X-API-Key, Authorization) */
  apiKeyHeader?: string;
  apiKeyValue?: string;
  basicUsername?: string;
  basicPassword?: string;
}

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  description?: string;
  /** Optional HTTP auth for the MCP endpoint */
  auth?: ServerAuth;
  /** Route browser MCP traffic through the local static server proxy. Defaults to true. */
  proxyThroughLocal?: boolean;
  status: ServerStatus;
  error?: string;
  tools?: ToolDef[];
  custom?: boolean;
  metaTools?: MetaToolBinding[];
  /** Discovered tools, in-memory, reset on reconnect. */
  discovered?: DiscoveredTool[];
  /** Per-meta-tool discovery run state, keyed by meta-tool name. */
  discoveryRuns?: Record<string, DiscoveryRun>;
  resources?: ResourceEntry[];
  resourceTemplates?: ResourceTemplate[];
  prompts?: PromptDef[];
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
}

export interface ToolContent {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

// --- Meta-tool discovery ---

export type MetaToolKind =
  | 'bulk_list'
  | 'paginated_list'
  | 'search'
  | 'hybrid_index'
  | 'hybrid_describe'
  | 'category_index'
  | 'category_list'
  | 'enable_capability'
  | 'proxy_invoke'
  | 'manifest';

export interface MetaToolBinding {
  toolName: string;
  kind: MetaToolKind;
  confidence: number;
  /** Name of a paired meta-tool, e.g. hybrid_index ↔ hybrid_describe, category_index ↔ category_list. */
  pairedWith?: string;
  /** Cached input schema for strategies that need to inspect param shapes (paginated_list, search, enable_capability). */
  inputSchema?: JsonSchema;
  /** For proxy_invoke: which input field carries the inner tool's args. */
  proxyArgKey?: string;
  /** For proxy_invoke: which input field carries the inner tool's name. */
  proxyNameKey?: string;
}

export interface DiscoveredTool extends ToolDef {
  source: {
    via: string;
    kind: MetaToolKind;
    proxyArgKey?: string;
    proxyNameKey?: string;
  };
}

export type DiscoveryStatus = 'idle' | 'running' | 'done' | 'partial' | 'error';

export interface DiscoveryRun {
  status: DiscoveryStatus;
  startedAt?: number;
  finishedAt?: number;
  probesAttempted: number;
  callsMade: number;
  toolsFound: number;
  error?: string;
}

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
