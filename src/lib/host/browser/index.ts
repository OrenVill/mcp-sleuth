import type { Host } from '../types';
import { browserMcpHost } from './mcpBrowser';
import { browserFilesHost } from './filesBrowser';
import { browserSecretsHost } from './secretsBrowser';

export const browserHost: Host = {
  kind: 'browser',
  mcp: browserMcpHost,
  files: browserFilesHost,
  secrets: browserSecretsHost,
};
