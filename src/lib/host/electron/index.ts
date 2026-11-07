import type { Host } from '../types';
import { createElectronMcpHost, type ElectronBridge } from './mcpElectron';
import { createElectronFilesHost } from './filesElectron';
import { createElectronSecretsHost } from './secretsElectron';
import { createElectronUpdateHost } from './updatesElectron';
import { createLlmElectron, type LlmBridge } from './llmElectron';
import { createElectronOAuthHost } from './oauthElectron';
import { bindElectronReverseBridge } from './reverseElectron';

export function createElectronHost(bridge: ElectronBridge): Host {
  bindElectronReverseBridge(bridge);
  return {
    kind: 'electron',
    mcp: createElectronMcpHost(bridge),
    files: createElectronFilesHost(bridge),
    secrets: createElectronSecretsHost(bridge),
    updates: createElectronUpdateHost(bridge),
    llm: createLlmElectron(bridge as unknown as LlmBridge),
    oauth: createElectronOAuthHost(bridge),
  };
}
