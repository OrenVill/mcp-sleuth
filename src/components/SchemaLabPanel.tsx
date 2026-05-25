import { useState } from 'react';
import {
  buildJsonRpcToolCall,
  generateSchemaFormPreview,
  getSchemaLabRows,
  getSchemaLabSummary,
  validateToolSchema,
  type SchemaLabIssue,
  type SchemaLabRow,
  type SchemaFormPreviewField,
} from '../lib/schemaLab';
import type { ServerEntry, ToolDef } from '../types';
import { CodeBlock } from './CodeBlock';
import { MarkdownPreview } from './MarkdownPreview';

interface Props {
  servers: ServerEntry[];
  selectedServerId: string | null;
  selectedToolName: string | null;
}

interface PanelSelection {
  serverId: string | null;
  toolName: string | null;
  propKey: string;
}

const SELECT_CLASS =
  'mt-1 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm disabled:opacity-50 disabled:cursor-not-allowed';

function getConnectedServers(servers: ServerEntry[]): ServerEntry[] {
  return servers.filter((server) => server.status === 'connected');
}

function getAllTools(server: ServerEntry | null): ToolDef[] {
  if (!server) return [];

  const nativeTools = server.tools ?? [];
  const nativeNames = new Set(nativeTools.map((tool) => tool.name));
  const discoveredTools = (server.discovered ?? []).filter((tool) => !nativeNames.has(tool.name));

  return [...nativeTools, ...discoveredTools];
}

function getActiveServer(connectedServers: ServerEntry[], serverId: string | null): ServerEntry | null {
  return connectedServers.find((server) => server.id === serverId) ?? connectedServers[0] ?? null;
}

function getSelectedTool(tools: ToolDef[], toolName: string): ToolDef | null {
  if (toolName) {
    const selected = tools.find((tool) => tool.name === toolName);
    if (selected) return selected;
  }

  return tools[0] ?? null;
}

function issueClass(severity: SchemaLabIssue['severity']): string {
  switch (severity) {
    case 'error':
      return 'border-red-900/60 bg-red-950/30 text-red-200';
    case 'warning':
      return 'border-amber-900/60 bg-amber-950/30 text-amber-200';
    case 'info':
      return 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200';
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value).catch(() => {});
}

function formatDetail(value: unknown): string {
  return JSON.stringify(value);
}

function rowDetails(row: SchemaLabRow): string[] {
  const details: string[] = [];

  if (row.defaultValue !== undefined) {
    details.push(`default: ${formatDetail(row.defaultValue)}`);
  }

  if (row.enumValues && row.enumValues.length > 0) {
    details.push(`enum: ${row.enumValues.map((value) => String(value)).join(', ')}`);
  }

  if (row.minimum !== undefined) {
    details.push(`min: ${row.minimum}`);
  }

  if (row.maximum !== undefined) {
    details.push(`max: ${row.maximum}`);
  }

  return details;
}

function controlLabel(field: SchemaFormPreviewField): string {
  switch (field.control) {
    case 'select':
      return 'Dropdown';
    case 'boolean-select':
      return 'Boolean dropdown';
    case 'number':
      return 'Number input';
    case 'json-textarea':
      return 'JSON textarea';
    case 'text':
    default:
      return 'Text input';
  }
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid place-items-center text-center px-8 py-16">
      <div className="max-w-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-zinc-600" aria-hidden>
            <path
              d="M5 7h14M5 12h10M5 17h6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-sm text-zinc-300">{title}</p>
        <p className="text-xs text-zinc-600 mt-1">{body}</p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="text-sm text-zinc-100 font-mono mt-1">{value}</div>
    </div>
  );
}

export function SchemaLabPanel({ servers, selectedServerId, selectedToolName }: Props) {
  const connectedServers = getConnectedServers(servers);
  const propKey = `${selectedServerId ?? ''}\u0000${selectedToolName ?? ''}`;
  const [panelSelection, setPanelSelection] = useState<PanelSelection | null>(null);
  const userSelection = panelSelection?.propKey === propKey ? panelSelection : null;
  const requestedServerId = userSelection?.serverId ?? selectedServerId;
  const requestedToolName = userSelection?.toolName ?? selectedToolName;

  if (connectedServers.length === 0) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
        <EmptyState
          title="Connect a server to inspect tool schemas."
          body="Schema Lab works from the tools advertised by connected MCP servers."
        />
      </div>
    );
  }

  const activeServer = getActiveServer(connectedServers, requestedServerId);
  const tools = getAllTools(activeServer);
  const tool = getSelectedTool(tools, requestedToolName ?? '');

  const summary = tool ? getSchemaLabSummary(tool) : null;
  const rows = tool ? getSchemaLabRows(tool) : [];
  const issues = tool ? validateToolSchema(tool) : [];
  const formPreview = tool ? generateSchemaFormPreview(tool) : null;
  const jsonRpcCall = tool ? buildJsonRpcToolCall(tool) : null;
  const description = (tool?.description ?? '').trim();

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-5 py-5 space-y-5">
        <section className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
              Server
            </span>
            <select
              value={activeServer?.id ?? ''}
              onChange={(event) => {
                const nextServerId = event.target.value;
                const nextServer = getActiveServer(connectedServers, nextServerId);
                const nextTools = getAllTools(nextServer);

                setPanelSelection({
                  serverId: nextServerId,
                  toolName: nextTools[0]?.name ?? null,
                  propKey,
                });
              }}
              className={SELECT_CLASS}
            >
              {connectedServers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-zinc-500">
              Tool
            </span>
            <select
              value={tool?.name ?? ''}
              onChange={(event) =>
                setPanelSelection({
                  serverId: activeServer?.id ?? null,
                  toolName: event.target.value,
                  propKey,
                })
              }
              disabled={tools.length === 0}
              className={`${SELECT_CLASS} font-mono`}
            >
              {tools.length === 0 ? (
                <option value="">No tools available</option>
              ) : (
                tools.map((candidate) => (
                  <option key={candidate.name} value={candidate.name}>
                    {candidate.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </section>

        {!activeServer || !tool || !summary || !jsonRpcCall ? (
          <EmptyState
            title="No tools are available on the selected server."
            body="Choose another connected server or discover additional tools first."
          />
        ) : (
          <>
            <section>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">{activeServer.name}</span>
                <span className="text-zinc-700">/</span>
                <span className="text-violet-400 font-mono">{tool.name}</span>
              </div>
              <h3 className="text-2xl font-semibold text-zinc-50 tracking-tight font-mono mt-1">
                {tool.name}
              </h3>
              {description && (
                <div className="mt-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
                  <MarkdownPreview source={description} />
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryCard label="Root" value={summary.rootType} />
              <SummaryCard label="Properties" value={summary.propertyCount} />
              <SummaryCard label="Required" value={summary.requiredCount} />
              <SummaryCard label="Optional" value={summary.optionalCount} />
            </section>

            <section>
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                Parameters
              </h4>
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead className="bg-zinc-950/80 text-[10px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Required</th>
                      <th className="text-left px-3 py-2 font-semibold">Details</th>
                      <th className="text-left px-3 py-2 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-sm text-zinc-500 italic">
                          This tool takes no arguments.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => {
                        const details = rowDetails(row);

                        return (
                          <tr key={row.name} className="bg-zinc-900/20 align-top">
                            <td className="px-3 py-2 font-mono text-zinc-100">{row.name}</td>
                            <td className="px-3 py-2 font-mono text-violet-300">{row.type}</td>
                            <td className="px-3 py-2">
                              {row.required ? (
                                <span className="inline-flex rounded-full border border-rose-900/70 bg-rose-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-300">
                                  Required
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                                  Optional
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-zinc-400">
                              {details.length === 0 ? (
                                <span className="text-zinc-600">None</span>
                              ) : (
                                <div className="space-y-1">
                                  {details.map((detail) => (
                                    <div key={detail}>
                                      <code className="text-zinc-300">{detail}</code>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-zinc-400">
                              {row.description ? (
                                <MarkdownPreview source={row.description} className="md-preview-compact" />
                              ) : (
                                <span className="text-zinc-600">None</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {formPreview && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                    Schema / Form Preview
                  </h4>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs text-zinc-500">Input schema</div>
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
                        <CodeBlock code={stringify(tool.inputSchema)} lang="json" />
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-xs text-zinc-500">Generated argument form</div>
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 space-y-3">
                        {formPreview.fields.length === 0 ? (
                          <p className="text-sm text-zinc-500 italic">No form controls will be rendered.</p>
                        ) : (
                          formPreview.fields.map((field) => (
                            <div key={field.name} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-mono text-sm text-zinc-100">{field.name}</div>
                                {field.required && (
                                  <span className="text-[10px] uppercase tracking-wide text-rose-400 font-semibold">
                                    required
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                <span className="rounded border border-violet-900/60 bg-violet-950/30 px-2 py-0.5 text-violet-200">
                                  {controlLabel(field)}
                                </span>
                                <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-zinc-400 font-mono">
                                  {field.type}
                                </span>
                                {field.placeholder && (
                                  <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-zinc-500 font-mono">
                                    placeholder {field.placeholder}
                                  </span>
                                )}
                              </div>
                              {field.options && field.options.length > 0 && (
                                <div className="mt-2 text-[11px] text-zinc-500">
                                  Options: {field.options.map((option) => String(option)).join(', ')}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <h5 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
                        Generated Example Args
                      </h5>
                      <button
                        type="button"
                        onClick={() => copyText(stringify(formPreview.exampleArgs))}
                        className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                      >
                        Copy args
                      </button>
                    </div>
                    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
                      <CodeBlock code={stringify(formPreview.exampleArgs)} lang="json" />
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                      Renderer Warnings
                    </h5>
                    <div className="space-y-2">
                      {formPreview.warnings.length === 0 ? (
                        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-200">
                          No SchemaForm simplifications detected.
                        </div>
                      ) : (
                        formPreview.warnings.map((warning) => (
                          <div
                            key={warning}
                            className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-200"
                          >
                            {warning}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section>
              <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 mb-2">
                Validation Notes
              </h4>
              <div className="space-y-2">
                {issues.map((issue) => (
                  <div
                    key={`${issue.severity}:${issue.message}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${issueClass(issue.severity)}`}
                  >
                    <span className="font-semibold uppercase text-[10px] tracking-wide mr-2">
                      {issue.severity}
                    </span>
                    {issue.message}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400">
                    JSON-RPC tools/call
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyText(stringify(jsonRpcCall))}
                    className="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                  >
                    Copy call
                  </button>
                </div>
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
                  <CodeBlock code={stringify(jsonRpcCall)} lang="json" />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
