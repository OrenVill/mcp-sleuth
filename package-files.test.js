import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Runtime files the CLI and static server import — must appear in package.json "files". */
const REQUIRED_PUBLISH_FILES = [
  'bin',
  'dist',
  'server.js',
  'proxy.js',
  'stdio-bridge.js',
  'vault-file-handler.js',
  'app-data-handler.js',
  'daemon-lock.js',
];

describe('npm package files', () => {
  it('includes all runtime modules referenced by the CLI and server', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    for (const file of REQUIRED_PUBLISH_FILES) {
      expect(pkg.files, `missing "${file}" in package.json files`).toContain(file);
    }
  });
});
