/**
 * Flat config.
 *
 * Pinned to eslint 9. Version 9.x is out of support, and 10 was tried: it breaks
 * eslint-plugin-react outright ('contextOrFilename.getFilename is not a
 * function') and eslint-plugin-jsx-a11y does not claim support either. Losing
 * React and accessibility linting costs more than running a lint tool one major
 * behind, especially with an accessibility pass still on the roadmap. Revisit
 * once both plugins ship eslint 10 support.
 *
 * The interesting part is not the rule presets, it is the `no-restricted-imports`
 * blocks near the bottom. Invariants 1 and 2 in CLAUDE.md are the two rules that
 * decide whether this project can ever ship a second kit, and a rule that lives
 * only in a markdown file gets broken by the first person who has not read it.
 * Here they fail the build instead.
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import vitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

/** Packages that must never reach a component library. */
const COMPONENT_LIBRARIES = [
  { group: ['@mui/*', '@emotion/*'], message: '' },
  // `antd` covers `antd/es/button` too: these patterns use gitignore semantics,
  // where a bare name matches the path and everything under it.
  { group: ['antd', '@chakra-ui/*', '@radix-ui/*'], message: '' },
]

const noComponentLibrary = (why) => COMPONENT_LIBRARIES.map((entry) => ({ ...entry, message: why }))

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', 'docs/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // tsconfig.eslint.json is the only config that sees test files; the
        // per-package build configs exclude them so they stay out of dist.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase leans on explicit return types; keep it that way.
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // React packages.
  {
    files: ['packages/*/src/**/*.tsx', 'apps/playground/src/**/*.tsx'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The new JSX transform is on, so React need not be in scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  /*
   * The hooks rules, on every TypeScript file rather than only on the ones that
   * hold JSX.
   *
   * They were `.tsx`-only, and every hook in the designer lives in `store.ts` —
   * so the file with all the `useCallback` dependency arrays in it was the one
   * file `exhaustive-deps` never looked at. A hook is a hook whether or not the
   * file also returns markup.
   *
   * Separate from the React block below rather than folded into it, because
   * `react` and `jsx-a11y` genuinely have nothing to say about a file with no
   * JSX in it and would only add noise.
   */
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },

  /*
   * Invariant 1. Core must run in Node for server-side validation, so it takes
   * no React and no component library. Breaking this is not caught by tsc: core
   * would keep compiling and only fail the day someone imports it on a server.
   */
  {
    /*
     * `.tsx` as well, and it was not. Core has no `.tsx` files today, which is
     * the invariant working — but a rule scoped to `*.ts` is a rule that stops
     * applying the moment somebody adds the first one, which is precisely when
     * it is needed. There is nothing in the file extension that makes React
     * acceptable.
     */
    files: ['packages/core/src/**/*.ts', 'packages/core/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          /*
           * `patterns`, not `paths`. `paths` matches a module name exactly, so
           * a rule naming `react-dom` said nothing about `react-dom/client`,
           * `react-dom/server` or `react/jsx-runtime` — and a subpath is how
           * anybody actually imports those two.
           */
          patterns: [
            {
              group: ['react', 'react/*'],
              message:
                'Invariant 1: @formsmith/core runs in Node. Server-side validation depends on it staying React-free.',
            },
            {
              group: ['react-dom', 'react-dom/*'],
              message: 'Invariant 1: @formsmith/core runs in Node and imports no React.',
            },
            ...noComponentLibrary('Invariant 1: @formsmith/core imports no component library.'),
          ],
        },
      ],
    },
  },

  /*
   * Invariant 2. The designer consumes ComponentDef metadata only. The moment it
   * imports a component library, the kit abstraction has leaked and the second
   * kit becomes a rewrite rather than a new package.
   */
  {
    files: ['packages/designer/src/**/*.ts', 'packages/designer/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...noComponentLibrary(
              'Invariant 2: @formsmith/designer consumes ComponentDef metadata only. Importing a component library here leaks the kit abstraction.',
            ),
            {
              group: ['@formsmith/kit-*'],
              message:
                'Invariant 2: the designer must not depend on a specific kit. Take a Kit and a RendererKit as props instead.',
            },
          ],
        },
      ],
    },
  },

  // Build scripts report to stdout; that is their only output channel.
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },

  // The demo server is a CLI process; a startup line on stdout is the point.
  {
    files: ['apps/demo-server/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  /*
   * End-to-end specs. They are tests, but not vitest ones: the vitest plugin's
   * rules would flag Playwright's own expect and test helpers as misuse.
   */
  {
    files: ['e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  /*
   * Tests. No `ignores` for `e2e/**`: the specs there are `*.spec.ts`, so the
   * `files` above never matched them and the exclusion had nothing to exclude --
   * configuration that reads as a decision and is a no-op, which is worse than
   * either having it or not.
   */
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'test/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // vitest's expect takes an optional message as a second argument, which
      // the jest-shaped default rule rejects. The kit contract test leans on it
      // so a failure explains which obligation was missed.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Plain JavaScript cannot carry a return type annotation, so the rule that
  // demands one has nothing to ask for here.
  {
    files: ['**/*.js', '**/*.mjs'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },

  // Config and script files run outside the type-checked project graph.
  {
    files: ['*.config.js', 'scripts/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
)
