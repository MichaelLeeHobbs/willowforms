/**
 * Pinned to eslint 9, the newest major that the peer ranges of eslint-plugin-react and
 * eslint-plugin-jsx-a11y accept.
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
 * Bare names: as gitignore patterns `@mui` matches `@mui/*` and `antd` does not match
 * `antdesign-clone`, and `dynamicImportOf` turns the same list into a regex.
 */
const COMPONENT_LIBRARIES = ['@mui', '@emotion', 'antd', '@chakra-ui', '@radix-ui']

const REACT = ['react', 'react-dom']

const noComponentLibrary = (why) => [{ group: COMPONENT_LIBRARIES, message: why }]

/**
 * `no-restricted-imports` does not visit `import()`, so dynamic imports need a selector.
 *
 * `[/]` rather than an escaped slash: a bare `/` ends an esquery regex literal.
 */
const dynamicImportOf = (names) => {
  const alternatives = names.map((name) => name.replace(/\//g, '[/]')).join('|')
  return `ImportExpression[source.value=/^(${alternatives})([/]|$)/]`
}

const dynamicImportUnder = (prefix) =>
  `ImportExpression[source.value=/^${prefix.replace(/\//g, '[/]')}/]`

/**
 * Only a `Literal` has `source.value`, so the selectors above miss a template literal,
 * a variable or a concatenation. Refusing the shape closes every such spelling at once.
 */
const OPAQUE_DYNAMIC_IMPORT = "ImportExpression:not([source.type='Literal'])"

const OPAQUE_MESSAGE = (invariant, who) =>
  `Invariant ${invariant}: name the module as a plain string. ${who} is checked by a selector that reads the specifier, so a template literal, a variable or a concatenation is unreviewable here — which is exactly the form somebody reaches for to get around the rule.`

const KIT_MESSAGE =
  'Invariant 2: the designer must not depend on a specific kit. Take a Kit and a RendererKit as props instead.'

const declares = (names) =>
  `:matches(FunctionDeclaration, VariableDeclarator)[id.name=/^(${names.join('|')})$/]`

/**
 * Each helper's one definition carries an `eslint-disable-next-line` for this rule.
 *
 * Joins every block's `no-restricted-syntax` list rather than a block of its own: a
 * later flat-config block replaces an earlier block's options for the same rule.
 */
const SHARED_HELPERS = {
  selector: declares(['isRecord', 'paramsText', 'nameOf']),
  message:
    'Import the shared helper instead of redeclaring it: isRecord from core src/guards.ts (core-internal), paramsText from designer src/panels/text.ts, nameOf from designer src/language.ts.',
}

/** Module scope only: the names are generic enough that a local `let changed` is not a copy. */
const KIT_PROP_NAME = '[id.name=/^(str|num|bool|changed|requiredProps)$/]'
const KIT_PROP_HELPERS = {
  selector:
    `:matches(Program, ExportNamedDeclaration) > FunctionDeclaration${KIT_PROP_NAME}, ` +
    `:matches(Program, ExportNamedDeclaration) > VariableDeclaration > VariableDeclarator${KIT_PROP_NAME}`,
  message:
    'Kit prop helpers (str, num, bool, changed, requiredProps) are exported from @willowforms/renderer. Import them instead of redeclaring.',
}

/**
 * The hooks preset ships some rules as `"warn"`; this raises every rule to error so an
 * editor agrees with CI. `--max-warnings 0` on the lint script is not redundant with
 * it: that catches warn-severity rules from any plugin. Tests hold both in place.
 */
const erroring = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([name, level]) => [
      name,
      // Severity only: an entry may be `['warn', { ...options }]`, and its options stay.
      Array.isArray(level) ? ['error', ...level.slice(1)] : 'error',
    ]),
  )

const HOOKS_RULES = erroring(reactHooks.configs.recommended.rules)

export default tseslint.config(
  {
    // `pnpm test:coverage` writes generated `.js` files that the type-aware block rejects.
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
       * `group` is allowed because axe's `scrollable-region-focusable` requires a
       * `tabIndex` on a scrollable region (the preview's Data and Errors dumps). Widened
       * by one role rather than switched off, so a role-less `<div>` is still an error.
       */
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { roles: ['tabpanel', 'group', 'separator'] },
      ],
    },
  },

  /*
   * The hooks rules on every TypeScript file, not only JSX: the designer's hooks live in
   * `store.ts`. Kept out of the React block, whose other plugins have nothing to check
   * in a file without JSX.
   */
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts', 'test/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...HOOKS_RULES },
  },

  {
    // `.tsx` too: core has none yet, and the rule must hold when the first one arrives.
    files: ['packages/core/src/**/*.ts', 'packages/core/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // `patterns`, not `paths`: `paths` matches exactly and misses `react-dom/client`.
          patterns: [
            {
              group: REACT,
              message:
                'Invariant 1: @willowforms/core runs in Node. Server-side validation depends on it staying React-free.',
            },
            ...noComponentLibrary('Invariant 1: @willowforms/core imports no component library.'),
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: dynamicImportOf(REACT),
          message:
            'Invariant 1: @willowforms/core runs in Node. A dynamic import of React is still an import.',
        },
        {
          selector: dynamicImportOf(COMPONENT_LIBRARIES),
          message:
            'Invariant 1: @willowforms/core imports no component library, dynamically or otherwise.',
        },
        {
          selector: OPAQUE_DYNAMIC_IMPORT,
          message: OPAQUE_MESSAGE(1, '@willowforms/core'),
        },
        SHARED_HELPERS,
      ],
    },
  },

  {
    files: ['packages/designer/src/**/*.ts', 'packages/designer/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...noComponentLibrary(
              'Invariant 2: @willowforms/designer consumes ComponentDef metadata only. Importing a component library here leaks the kit abstraction.',
            ),
            {
              group: ['@willowforms/kit-*'],
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
            'Invariant 2: @willowforms/designer consumes ComponentDef metadata only. A dynamic import of a component library leaks the kit abstraction just as a static one does.',
        },
        {
          selector: dynamicImportUnder('@willowforms/kit-'),
          message: KIT_MESSAGE,
        },
        {
          selector: OPAQUE_DYNAMIC_IMPORT,
          message: OPAQUE_MESSAGE(2, '@willowforms/designer'),
        },
        SHARED_HELPERS,
      ],
    },
  },

  {
    files: ['packages/renderer/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', SHARED_HELPERS] },
  },
  {
    files: ['packages/kit-*/src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', SHARED_HELPERS, KIT_PROP_HELPERS] },
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

  // Playwright specs stay out of the vitest block, whose rules misread Playwright's helpers.
  {
    files: ['e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'test/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // vitest's expect takes an optional message as a second argument, which
      // the jest-shaped default rule rejects.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Plain JavaScript cannot carry a return type annotation.
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
