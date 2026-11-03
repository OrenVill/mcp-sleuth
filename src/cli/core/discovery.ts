import type { ToolDef } from '../../types';
import type { ConnectedServer } from './mcpConnect';
import type { StoredServer } from '../../lib/storage';

/** Meta-tool discovery in the CLI reuses native tools until meta bindings are stored in the vault. */
export async function maybeDiscoverTools(
  _stored: StoredServer,
  _connected: ConnectedServer,
  nativeTools: ToolDef[],
  discoverFlag: boolean,
): Promise<ToolDef[]> {
  if (discoverFlag && process.stderr.isTTY) {
    process.stderr.write(
      'mcp-detective: --discover requires meta-tool bindings from the app; using tools/list only.\n',
    );
  }
  return nativeTools;
}
