import { fileURLToPath } from 'node:url'

/**
 * In-repo source aliases.
 *
 * Published packages resolve through `dist`, but during development and tests we
 * point at `src` so an edit in core shows up in the playground with no rebuild.
 * Shared by vitest and the playground's vite config so the two cannot drift.
 *
 * These are anchored regexes rather than bare prefixes: a plain string alias for
 * `@willowforms/designer` also rewrites `@willowforms/designer/styles.css`, which
 * resolves to a path inside index.ts and fails at build time.
 */
const at = (p: string): string => fileURLToPath(new URL(p, import.meta.url))

export const willowformsAliases = [
  {
    find: '@willowforms/designer/styles.css',
    replacement: at('./packages/designer/src/designer.css'),
  },
  { find: /^@willowforms\/core$/, replacement: at('./packages/core/src/index.ts') },
  { find: /^@willowforms\/renderer$/, replacement: at('./packages/renderer/src/index.tsx') },
  { find: /^@willowforms\/kit-mui$/, replacement: at('./packages/kit-mui/src/index.ts') },
  {
    find: '@willowforms/kit-html/styles.css',
    replacement: at('./packages/kit-html/src/kit-html.css'),
  },
  { find: /^@willowforms\/kit-html$/, replacement: at('./packages/kit-html/src/index.ts') },
  { find: /^@willowforms\/designer$/, replacement: at('./packages/designer/src/index.ts') },
]
