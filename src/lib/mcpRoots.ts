/** Default filesystem roots Detective advertises to MCP servers via `roots/list`. */
export const DEFAULT_MCP_ROOTS: Array<{ uri: string; name?: string }> = [
  { uri: 'file:///', name: 'Filesystem root' },
];

export function listMcpRoots(): Array<{ uri: string; name?: string }> {
  return DEFAULT_MCP_ROOTS.map((root) => ({ ...root }));
}
