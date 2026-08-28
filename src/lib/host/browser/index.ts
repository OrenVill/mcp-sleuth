import type { Host } from '../types';
import { browserMcpHost } from './mcpBrowser';
import { browserFilesHost } from './filesBrowser';
import { browserSecretsHost } from './secretsBrowser';
import { browserUpdateHost } from './updatesBrowser';
import { llmBrowser } from './llmBrowser';

export const browserHost: Host = {
  kind: 'browser',
  mcp: browserMcpHost,
  files: browserFilesHost,
  secrets: browserSecretsHost,
  updates: browserUpdateHost,
  llm: llmBrowser,
};
