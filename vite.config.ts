import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';
import { handleVaultStorage, isVaultStorageRequest } from './vault-file-handler.js';
import { handleAppData, isAppDataRequest } from './app-data-handler.js';

function vaultStorageMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if (isVaultStorageRequest(req.url ?? '/')) {
    void handleVaultStorage(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end(err instanceof Error ? err.message : String(err));
    });
    return;
  }
  next();
}

/** Run before Vite's SPA HTML fallback so GET /__vault_storage hits the file store. */
function vaultStoragePlugin(): PluginOption {
  return {
    name: 'mcp-explorer-vault-storage',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(vaultStorageMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(vaultStorageMiddleware);
    },
  };
}

function appDataMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if (isAppDataRequest(req.url ?? '/')) {
    void handleAppData(req, res).catch((err: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end(err instanceof Error ? err.message : String(err));
    });
    return;
  }
  next();
}

function appDataPlugin(): PluginOption {
  return {
    name: 'mcp-explorer-app-data',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(appDataMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(appDataMiddleware);
    },
  };
}

function mcpProxyPlugin(): PluginOption {
  return {
    name: 'mcp-explorer-proxy',
    configureServer(server) {
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
  };
}

export default defineConfig({
  plugins: [vaultStoragePlugin(), appDataPlugin(), react(), tailwindcss(), mcpProxyPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '*.test.js'],
    passWithNoTests: true,
  },
});
