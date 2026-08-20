#!/usr/bin/env node
/**
 * Verify every repo-root module the Electron main process imports is packaged.
 *
 * electron-builder's `files` list is an allowlist. Adding an import in
 * `electron/` without adding the file there produces a build that succeeds and
 * an app that dies on launch with ERR_MODULE_NOT_FOUND — a failure no unit test
 * or E2E run against the dev tree can catch.
 *
 * Derived from the imports themselves rather than a hardcoded list, so it keeps
 * working as the main process grows.
 *
 * Usage: node scripts/check-packaged-imports.mjs [path/to/app.asar]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';

const asarPath = process.argv[2] ?? 'release/linux-unpacked/resources/app.asar';

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return extname(full) === '.js' || extname(full) === '.cjs' ? [full] : [];
  });
}

/** Root-level modules imported as `../name.js` from anywhere under electron/. */
export function rootImportsIn(files, read = (f) => readFileSync(f, 'utf8')) {
  const found = new Set();
  for (const file of files) {
    if (file.includes('.test.')) continue;
    for (const match of read(file).matchAll(/from\s+'\.\.\/([\w.-]+\.js)'/g)) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

const required = rootImportsIn(walk('electron'));
if (required.length === 0) {
  console.error('check-packaged-imports: found no root imports — is the path right?');
  process.exit(1);
}

const listed = execFileSync('npx', ['asar', 'list', asarPath], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.replace(/^\//, ''));

const missing = required.filter((name) => !listed.includes(name));

for (const name of required) {
  console.log(`  ${missing.includes(name) ? '✗' : '✓'} ${name}`);
}

if (missing.length > 0) {
  console.error(
    `\ncheck-packaged-imports: ${missing.join(', ')} imported by electron/ but not packaged.` +
      `\nAdd them to the \`files\` list in electron-builder.yml.`,
  );
  process.exit(1);
}
console.log(`\nAll ${required.length} root modules are packaged.`);
