import type { Host } from '../types';
import { createElectronMcpHost, type ElectronBridge } from './mcpElectron';
import { createElectronFilesHost } from './filesElectron';
import { createElectronSecretsHost } from './secretsElectron';
import { createElectronUpdateHost } from './updatesElectron';

export function createElectronHost(bridge: ElectronBridge): Host {
  return {
    kind: 'electron',
    mcp: createElectronMcpHost(bridge),
    files: createElectronFilesHost(bridge),
    secrets: createElectronSecretsHost(bridge),
    updates: createElectronUpdateHost(bridge),
  };
}
