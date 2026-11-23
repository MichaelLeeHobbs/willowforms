import { fileURLToPath } from 'node:url'

/**
 * Workspace packages resolved to `src`, shared by vitest and the playground. Anchored regexes,
 * because a plain string alias for `@willowforms/designer` also rewrites
 * `@willowforms/designer/styles.css` and breaks the build.
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
