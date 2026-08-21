import { describe, expect, it } from 'vitest';
import { rootImportsIn } from './check-packaged-imports.mjs';

/**
 * The regression these cover: this check used to pattern-match `../name.js` and
 * assume it meant the repo root. Once electron/ grew subdirectories that was
 * wrong in both directions — it flagged electron/ipc/x.js importing
 * `../externalLinks.js` (a sibling, already packaged) and never noticed
 * electron/update/store.js importing `../../app-data-handler.js` (genuinely at
 * the root, and genuinely needed in the asar).
 */
const ROOT = '/repo';

function reader(sources) {
  return (file) => sources[file] ?? '';
}

describe('rootImportsIn', () => {
  it('finds a root module imported from electron/', () => {
    const sources = { 'electron/main.js': "import { x } from '../data-dir.js';" };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual(['data-dir.js']);
  });

  it('finds a root module imported from a nested directory', () => {
    const sources = {
      'electron/update/store.js': "import { y } from '../../app-data-handler.js';",
    };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([
      'app-data-handler.js',
    ]);
  });

  it('ignores a sibling inside electron/, which is packaged wholesale', () => {
    const sources = {
      'electron/ipc/updateHandlers.js': "import { z } from '../externalLinks.js';",
    };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([]);
  });

  it('ignores a same-directory import', () => {
    const sources = { 'electron/ipc/updateHandlers.js': "import { a } from './channels.js';" };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([]);
  });

  it('ignores anything resolving outside the repo', () => {
    const sources = { 'electron/main.js': "import { b } from '../../elsewhere.js';" };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([]);
  });

  it('skips test files, which never ship', () => {
    const sources = { 'electron/main.test.js': "import { c } from '../data-dir.js';" };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([]);
  });

  it('deduplicates and sorts', () => {
    const sources = {
      'electron/main.js': "import a from '../data-dir.js';\nimport b from '../server.js';",
      'electron/windowState.js': "import c from '../data-dir.js';",
    };
    expect(rootImportsIn(Object.keys(sources), reader(sources), ROOT)).toEqual([
      'data-dir.js',
      'server.js',
    ]);
  });

  it('reads the real tree without throwing, and finds the known root modules', () => {
    const files = [
      'electron/main.js',
      'electron/windowState.js',
      'electron/update/store.js',
      'electron/ipc/updateHandlers.js',
    ];
    const found = rootImportsIn(files);
    expect(found).toContain('app-data-handler.js');
    expect(found).not.toContain('externalLinks.js');
  });
});
