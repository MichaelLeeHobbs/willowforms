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

/**
 * Packages that must never reach core or the designer, as bare names.
 *
 * Bare, because these are gitignore patterns: `antd` matches `antd/es/button`
 * and does not match `antdesign-clone`, and `@mui` behaves exactly as `@mui/*`
 * does. Measured with the linter rather than assumed, because the two spellings
 * look interchangeable and only one of them can also be turned into the regex
 * below.
 */
const COMPONENT_LIBRARIES = ['@mui', '@emotion', 'antd', '@chakra-ui', '@radix-ui']

/** React and its DOM half, which core may not reach either. */
const REACT = ['react', 'react-dom']

const noComponentLibrary = (why) => [{ group: COMPONENT_LIBRARIES, message: why }]

/**
 * The same names as an `ImportExpression` selector.
 *
 * `no-restricted-imports` visits `ImportDeclaration` and the two export forms
 * and nothing else, so `await import('@mui/material')` in the designer linted
 * clean. Measured before this was written: the static import reported invariant
 * 2, the dynamic one reported only an unrelated `no-unsafe-assignment`. A
 * dynamic import is the form somebody writes precisely when they are working
 * around a restriction, so it was the one form not restricted.
 *
 * Derived from the list above rather than written out again. Two lists naming
 * one rule is how a fix lands on one side of a symmetry, which is the whole
 * subject of the remediation run this came from.
 *
 * `[/]` rather than an escaped slash: a bare `/` ends an esquery regex literal.
 */
const dynamicImportOf = (names) => {
  const alternatives = names.map((name) => name.replace(/\//g, '[/]')).join('|')
  return `ImportExpression[source.value=/^(${alternatives})([/]|$)/]`
}

/** The same, for a prefix rather than a package name. */
const dynamicImportUnder = (prefix) =>
  `ImportExpression[source.value=/^${prefix.replace(/\//g, '[/]')}/]`

/**
 * A dynamic import whose specifier is not a plain string.
 *
 * The two selectors above read `source.value`, which only a `Literal` node has.
 * A `TemplateLiteral` has no `value` at all, so the attribute test cannot match
 * and every restriction above is one backtick away from silent. Measured with
 * `Linter.verify`: `import('@mui/material')` reports and
 * `` import(`@mui/material`) `` does not, nor does `` import(`@mui/${n}`) ``,
 * `import(p)` or `import('@mui/' + 'material')`.
 *
 * Restricting the *shape* rather than adding a second list of names is the
 * point. A selector matching a template literal's first quasi would close the
 * backtick and leave `import(p)`, and a third one for that would leave the
 * concatenation — three lists naming one rule, which is how a fix lands on one
 * side of a symmetry. Inside these two directories there is no legitimate
 * reason for a dynamic import not to name its module outright, and saying so
 * once closes every spelling of the bypass at the same time.
 */
const OPAQUE_DYNAMIC_IMPORT = "ImportExpression:not([source.type='Literal'])"

const OPAQUE_MESSAGE = (invariant, who) =>
  `Invariant ${invariant}: name the module as a plain string. ${who} is checked by a selector that reads the specifier, so a template literal, a variable or a concatenation is unreviewable here — which is exactly the form somebody reaches for to get around the rule.`

const KIT_MESSAGE =
  'Invariant 2: the designer must not depend on a specific kit. Take a Kit and a RendererKit as props instead.'

/**
 * The hooks preset, with every rule at error severity.
 *
 * Three of its sixteen rules ship as `"warn"` -- `exhaustive-deps`,
 * `incompatible-library` and `unsupported-syntax` -- and this config spread the
 * preset unchanged. `pnpm lint` was `eslint .` with no `--max-warnings`, and
 * `eslint` exits 0 on warnings, so the block below was widened to reach
 * `store.ts` (where every hook in the designer actually lives) and then
 * reported there in yellow while CI stayed green. The guard in
 * `test/eslint.config.test.ts` recorded `ruleId` and discarded `severity`, so
 * it could not tell the difference either.
 *
 * Derived from the preset rather than three names written out again: a rule
 * added to it in a later release arrives at error severity without anybody
 * remembering to come back here. `--max-warnings 0` on the lint script is the
 * other half and is not redundant with this -- this one makes an editor agree
 * with CI, that one catches any warn-severity rule from any other plugin. Both
 * are held in place by tests; do not delete either as duplication.
 */
const erroring = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, level]) => [
      name,
      /*
       * Severity only. An entry may be `['warn', { ...options }]`, and mapping
       * it to a bare `'error'` would silently drop the options -- changing what
       * the rule does rather than only whether it fails the build, in a helper
       * whose whole claim is to be derived from the preset. None of the sixteen
       * rules carries options today; the shape is the plugin's to change.
       */
      Array.isArray(level) ? ['error', ...level.slice(1)] : 'error',
    ]),
  )

const HOOKS_RULES = erroring(reactHooks.configs.recommended.rules)

export default tseslint.config(
  {
    /*
     * `coverage/**` because the documented `pnpm test:coverage` writes istanbul's
     * own generated `.js` files there, and they fall under the type-aware block.
     * A `pnpm lint` after a coverage run failed outright with "TSConfig does not
     * include this file" -- a broken gate rather than noise, for anybody whose
     * habit is to run coverage first.
     */
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo', 'docs/**', 'coverage/**'],
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
    files: ['packages/*/src/**/*.tsx', 'apps/playground/src/**/*.tsx', 'test/**/*.tsx'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...HOOKS_RULES,
      ...jsxA11y.flatConfigs.recommended.rules,
      // The new JSX transform is on, so React need not be in scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      /*
       * `role="group"` alongside the default `tabpanel`.
       *
       * The rule's premise -- a non-interactive element should not be a tab
       * stop -- inverts for a scrollable box. axe's
       * `scrollable-region-focusable` requires exactly the `tabIndex` this rule
       * refuses, because a region that scrolls and cannot take focus is content
       * a keyboard user cannot reach. The preview's Data and Errors dumps are
       * capped at 180px by `designer.css` and are that shape.
       *
       * Widened by one role rather than switched off, so a `tabIndex` on a
       * `<div>` with no role at all is still an error.
       */
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'group'] }],
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
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts', 'test/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...HOOKS_RULES },
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
              group: REACT,
              message:
                'Invariant 1: @formsmith/core runs in Node. Server-side validation depends on it staying React-free.',
            },
            ...noComponentLibrary('Invariant 1: @formsmith/core imports no component library.'),
          ],
        },
      ],
      /*
       * The same invariant against the import form the rule above cannot see.
       * Both halves, not one: `await import('react')` in core is the same
       * defect as `await import('@mui/material')` in the designer, and fixing
       * only the one the review named would be this run's own failure mode.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: dynamicImportOf(REACT),
          message:
            'Invariant 1: @formsmith/core runs in Node. A dynamic import of React is still an import.',
        },
        {
          selector: dynamicImportOf(COMPONENT_LIBRARIES),
          message:
            'Invariant 1: @formsmith/core imports no component library, dynamically or otherwise.',
        },
        {
          selector: OPAQUE_DYNAMIC_IMPORT,
          message: OPAQUE_MESSAGE(1, '@formsmith/core'),
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
              message: KIT_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: dynamicImportOf(COMPONENT_LIBRARIES),
          message:
            'Invariant 2: @formsmith/designer consumes ComponentDef metadata only. A dynamic import of a component library leaks the kit abstraction just as a static one does.',
        },
        {
          selector: dynamicImportUnder('@formsmith/kit-'),
          message: KIT_MESSAGE,
        },
        {
          selector: OPAQUE_DYNAMIC_IMPORT,
          message: OPAQUE_MESSAGE(2, '@formsmith/designer'),
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
