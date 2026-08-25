import { fileURLToPath } from 'node:url'

/**
 * In-repo source aliases.
 *
 * Published packages resolve through `dist`, but during development and tests we
 * point at `src` so an edit in core shows up in the playground with no rebuild.
 * Shared by vitest and the playground's vite config so the two cannot drift.
 *
 * These are anchored regexes rather than bare prefixes: a plain string alias for
 * `@formsmith/designer` also rewrites `@formsmith/designer/styles.css`, which
 * resolves to a path inside index.ts and fails at build time.
 */
const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

export const formsmithAliases = [
  { find: '@formsmith/designer/styles.css', replacement: at('./packages/designer/src/designer.css') },
  { find: /^@formsmith\/core$/, replacement: at('./packages/core/src/index.ts') },
  { find: /^@formsmith\/renderer$/, replacement: at('./packages/renderer/src/index.tsx') },
  { find: /^@formsmith\/kit-mui$/, replacement: at('./packages/kit-mui/src/index.ts') },
  { find: /^@formsmith\/designer$/, replacement: at('./packages/designer/src/index.ts') },
]
