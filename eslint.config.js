import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'release', 'test-results', 'playwright-report']),
  {
    // The Node side: the Electron main process, the CLI, and the zero-dep
    // handlers. Plain ESM with no TypeScript project, so no type-aware rules.
    files: [
      'electron/**/*.{js,cjs}',
      'scripts/**/*.mjs',
      'bin/**/*.js',
      '*.js',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // These files deliberately swallow errors in best-effort paths — a failed
      // window-state write or a stale lock file must never stop the app.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
