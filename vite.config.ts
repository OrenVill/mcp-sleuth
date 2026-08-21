import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';
import { handleStdioBridge, STDIO_BRIDGE_PREFIX } from './stdio-bridge.js';
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
    name: 'mcp-sleuth-vault-storage',
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
    name: 'mcp-sleuth-app-data',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(appDataMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(appDataMiddleware);
    },
  };
}

function stdioBridgeMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if ((req.url ?? '/').startsWith(STDIO_BRIDGE_PREFIX)) {
    void handleStdioBridge(req, res).catch((err: unknown) => {
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

function mcpProxyPlugin(): PluginOption {
  return {
    name: 'mcp-sleuth-proxy',
    configureServer(server) {
      server.middlewares.use(stdioBridgeMiddleware);
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use(stdioBridgeMiddleware);
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
  };
}

export default defineConfig({
  plugins: [vaultStoragePlugin(), appDataPlugin(), react(), tailwindcss(), mcpProxyPlugin()],
  build: {
    rollupOptions: {
      output: {
        // Split the big third-party deps out of the app chunk. They change far
        // less often than the app does, so browsers keep them cached across
        // releases instead of re-downloading everything for a one-line fix.
        // Rolldown takes a function here, not the object map Rollup accepts.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[/\\]react(-dom)?[/\\]/.test(id)) return 'vendor-react';
          if (id.includes('@modelcontextprotocol')) return 'vendor-mcp';
          if (/node_modules[/\\]marked[/\\]/.test(id)) return 'vendor-markdown';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      '*.test.js',
      'electron/**/*.test.js',
      'scripts/**/*.test.js',
    ],
    passWithNoTests: true,
  },
});
