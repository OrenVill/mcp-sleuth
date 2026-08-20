import type { McpHost } from '../types';

const notImplemented = () => {
  throw new Error('browserMcpHost is not implemented yet');
};

export const browserMcpHost = new Proxy({} as McpHost, {
  get: () => notImplemented,
});
