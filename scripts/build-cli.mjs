#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [resolve(root, 'src/cli/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(root, 'dist/cli/main.js'),
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  // MCP session manager stays a separate file (Electron + dynamic import).
  external: [],
  loader: { '.js': 'js' },
});

console.log('CLI bundle written to dist/cli/main.js');
