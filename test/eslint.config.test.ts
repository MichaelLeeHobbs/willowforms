/**
 * The guardrails, run rather than read.
 *
 * Invariants 1 and 2 in CLAUDE.md are the two rules that decide whether this
 * project can ever ship a second kit, and both live in `eslint.config.js`
 * precisely so that a markdown file is not the only thing enforcing them. But a
 * lint block is code, and this file is the answer to Trap 8: a guard nobody has
 * broken on purpose is a guard nobody knows the shape of.
 *
 * All three holes below were live. The invariant 1 block was scoped to `*.ts`
 * and said nothing about `.tsx`; `no-restricted-imports` used `paths`, which
 * matches a module name exactly, so `react-dom/client` walked straight through
 * a rule that named `react-dom`; and the react-hooks rules were `.tsx`-only, so
 * `store.ts` — which is where every hook in the designer actually lives — was
 * never checked for a dependency array at all.
 *
 * Fixtures are written to disk rather than linted as text, because the config
 * is type-aware and typescript-eslint refuses a path its tsconfig has never
 * heard of. They are removed in a `finally`, and named so that a stray one is
 * obvious.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'
import { FIXTURE_PREFIX } from './fixtures.js'

const root = new URL('../', import.meta.url)
const abs = (path: string): string => fileURLToPath(new URL(path, root))

/** A fixture, named so nobody mistakes one for source if a run is killed. */
const fixture = (pkg: string, name: string, ext: 'ts' | 'tsx'): string =>
  'packages/' + pkg + '/src/' + FIXTURE_PREFIX + name + '__.' + ext

interface Case {
  /** What the guardrail is supposed to stop. */
  what: string
  path: string
  code: string
  /** The rule that has to fire, or none for a control. */
  rule: string | null
  /**
   * Part of the message the contributor is supposed to read, when it matters.
   *
   * `README.md:137-143` promises a contributor a message explaining why the
   * rule exists before they silence it, and the assertions here were on rule id
   * alone -- so every message could have been emptied, or made to name the
   * wrong invariant, with nothing going red. Only set where the wording is the
   * deliverable; a rule id is enough for the rest.
   */
  says?: string
}

/** One reported problem, with the field the guard used to throw away. */
interface Reported {
  rule: string
  /** 2 is an error, 1 is a warning. See the severity assertion below. */
  severity: number
  message: string
}

const CASES: Case[] = [
  {
    what: 'a .tsx file in core importing React',
    path: fixture('core', 'core_tsx_react', 'tsx'),
    code: "import { useState } from 'react'\nexport function A(): number {\n  return useState(1)[0]\n}\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'core reaching react-dom through a subpath',
    path: fixture('core', 'core_react_dom_client', 'ts'),
    code: "import { createRoot } from 'react-dom/client'\nexport const mount = createRoot\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'core reaching React through the JSX runtime',
    path: fixture('core', 'core_jsx_runtime', 'ts'),
    code: "import { jsx } from 'react/jsx-runtime'\nexport const j = jsx\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'a .tsx file in core importing a component library',
    path: fixture('core', 'core_tsx_mui', 'tsx'),
    code: "import Box from '@mui/material/Box'\nexport const B = Box\n",
    rule: 'no-restricted-imports',
    says: 'Invariant 1',
  },
  /*
   * The other four names in COMPONENT_LIBRARIES.
   *
   * Only `@mui` was ever exercised. Deleting `antd` and `@chakra-ui` from the
   * list left every case in this file passing while the designer could import
   * Ant Design -- and this file's own opening argument is that fixing one side
   * of a symmetry is the failure the remediation run exists to stop. Four
   * fifths of the symmetry was untested.
   *
   * Spread across both invariants rather than piled onto one, so the list is
   * proved to reach core and the designer alike.
   */
  {
    what: 'core importing emotion',
    path: fixture('core', 'core_emotion', 'ts'),
    code: "import styled from '@emotion/styled'\nexport const s = styled\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'core importing Ant Design',
    path: fixture('core', 'core_antd', 'ts'),
    code: "import { Button } from 'antd'\nexport const b = Button\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'the designer importing Chakra',
    path: fixture('designer', 'designer_chakra', 'ts'),
    code: "import { Box } from '@chakra-ui/react'\nexport const B = Box\n",
    rule: 'no-restricted-imports',
    says: 'Invariant 2',
  },
  {
    what: 'the designer importing Radix',
    path: fixture('designer', 'designer_radix', 'ts'),
    code: "import * as Dialog from '@radix-ui/react-dialog'\nexport const D = Dialog\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'the designer importing a component library from a .ts file',
    path: fixture('designer', 'designer_ts_mui', 'ts'),
    code: "import Box from '@mui/material/Box'\nexport const B = Box\n",
    rule: 'no-restricted-imports',
  },
  {
    /*
     * And from a `.tsx` file, which is where the designer actually lives: 16 of
     * its 22 non-test sources are `.tsx`, and every invariant 2 case here
     * exercised a `.ts`. The block covers both extensions and always did.
     * Nothing proved it, which is the same gap the invariant 1 cases at the top
     * of this list were written for after it turned out not to.
     */
    what: 'the designer importing a component library from a .tsx file',
    path: fixture('designer', 'designer_tsx_mui', 'tsx'),
    code: "import Box from '@mui/material/Box'\nexport const B = Box\n",
    rule: 'no-restricted-imports',
  },
  {
    what: 'the designer depending on a specific kit',
    path: fixture('designer', 'designer_kit', 'ts'),
    code: "import { muiKit } from '@willowforms/kit-mui'\nexport const k = muiKit\n",
    rule: 'no-restricted-imports',
  },
  {
    /*
     * The import form the restriction could not see.
     *
     * `no-restricted-imports` visits `ImportDeclaration` and the two export
     * forms and nothing else, so a dynamic import walked straight through both
     * invariants. And a dynamic import is what somebody writes precisely when
     * they are working around a restriction, so the one form that mattered most
     * was the one form not covered. Measured before the fix: this fixture
     * reported only an unrelated `no-unsafe-assignment`.
     */
    what: 'the designer reaching a component library through a dynamic import',
    path: fixture('designer', 'designer_tsx_dynamic_mui', 'tsx'),
    code: "export const load = (): Promise<unknown> => import('@mui/material')\n",
    rule: 'no-restricted-syntax',
  },
  {
    what: 'the designer reaching a specific kit through a dynamic import',
    path: fixture('designer', 'designer_dynamic_kit', 'ts'),
    code: "export const load = (): Promise<unknown> => import('@willowforms/kit-mui')\n",
    rule: 'no-restricted-syntax',
  },
  {
    /*
     * The twin, and the reason it is here. The review found the hole in the
     * designer; the identical hole in core is the same rule with the same
     * mechanism, and fixing one side of a symmetry is the failure this whole
     * remediation run exists to stop.
     */
    what: 'core reaching React through a dynamic import',
    path: fixture('core', 'core_dynamic_react', 'ts'),
    code: "export const load = (): Promise<unknown> => import('react')\n",
    rule: 'no-restricted-syntax',
  },
  {
    what: 'core reaching a component library through a dynamic import',
    path: fixture('core', 'core_dynamic_mui', 'ts'),
    code: "export const load = (): Promise<unknown> => import('@mui/material/Box')\n",
    rule: 'no-restricted-syntax',
  },
  /*
   * The backtick, and the three spellings beside it.
   *
   * `dynamicImportOf` builds `ImportExpression[source.value=/…/]`, and only a
   * `Literal` node has a `source.value` -- a `TemplateLiteral` has none at all,
   * so the attribute test cannot match and every dynamic-import restriction
   * above was one keystroke from silent. Measured with `Linter.verify` before
   * the fix: the string literal reported and all four of these did not.
   *
   * They are covered by restricting the shape rather than by four more name
   * lists, so all four cases name the same rule and the same selector.
   */
  {
    what: 'the designer reaching a component library through a template literal',
    path: fixture('designer', 'designer_template_mui', 'ts'),
    code: 'export const load = (): Promise<unknown> => import(`@mui/material`)\n',
    rule: 'no-restricted-syntax',
    says: 'plain string',
  },
  {
    what: 'the designer building a specifier with an interpolation',
    path: fixture('designer', 'designer_template_expr', 'ts'),
    code:
      'export const load = (name: string): Promise<unknown> =>\n' + '  import(`@mui/${name}`)\n',
    rule: 'no-restricted-syntax',
  },
  {
    what: 'core importing a specifier held in a variable',
    path: fixture('core', 'core_dynamic_variable', 'ts'),
    code: 'export const load = (path: string): Promise<unknown> => import(path)\n',
    rule: 'no-restricted-syntax',
  },
  {
    what: 'core concatenating a specifier',
    path: fixture('core', 'core_dynamic_concat', 'ts'),
    code: "export const load = (): Promise<unknown> => import('react' + '-dom')\n",
    rule: 'no-restricted-syntax',
  },
  {
    what: 'a hook in a .ts file with a dependency it does not declare',
    path: fixture('designer', 'designer_hook_deps', 'ts'),
    code:
      "import { useCallback } from 'react'\n" +
      'export function useThing(value: number): () => number {\n' +
      '  return useCallback(() => value, [])\n' +
      '}\n',
    rule: 'react-hooks/exhaustive-deps',
  },
  {
    /*
     * The control, and it is not decoration. Every assertion above is "this
     * reports something"; without one that reports nothing, a config that
     * errored on every file would pass the lot.
     */
    what: 'core importing something it is allowed to import',
    path: fixture('core', 'core_allowed', 'ts'),
    code: "import { readFileSync } from 'node:fs'\nexport const r = readFileSync\n",
    rule: null,
  },
  {
    /*
     * The second control, for the selector rather than for the config. A rule
     * written as a bare `ImportExpression` with no test on the source would
     * refuse every dynamic import in the repository, and every case above would
     * still pass. This one says the restriction is about which package rather
     * than about the syntax.
     */
    what: 'core dynamically importing something it is allowed to import',
    path: fixture('core', 'core_dynamic_allowed', 'ts'),
    code: "export const load = (): Promise<unknown> => import('node:fs')\n",
    rule: null,
  },
  {
    /*
     * The near miss, which is what says the kit selector is a prefix on the kit
     * packages and not on the scope. `@willowforms/core` shares five sixths of its
     * name with `@willowforms/kit-mui` and is the package the designer is built
     * on; a selector one character too loose would refuse the designer's own
     * dependency, which is a failure nobody would call a false positive because
     * the build would simply stop.
     */
    what: 'the designer dynamically importing the core it is built on',
    path: fixture('designer', 'designer_dynamic_core', 'ts'),
    code: "export const load = (): Promise<unknown> => import('@willowforms/core')\n",
    rule: null,
  },
]

function cleanUp(): void {
  for (const each of CASES) rmSync(abs(each.path), { force: true })
}

/** Every case linted in one pass, because a type-aware run is not cheap. */
async function lintAll(): Promise<Map<string, Reported[]>> {
  for (const each of CASES) writeFileSync(abs(each.path), each.code)

  try {
    const eslint = new ESLint({ cwd: fileURLToPath(root) })
    const results = await eslint.lintFiles(CASES.map((each) => abs(each.path)))

    const byPath = new Map<string, Reported[]>()
    for (const result of results) {
      byPath.set(
        result.filePath,
        /*
         * `severity` is kept, and it was thrown away.
         *
         * This mapping was `message.ruleId ?? …` and nothing else, so a warning
         * and an error were the same result to every assertion below. A rule
         * turned fully `off` would have been caught; one downgraded from
         * `error` to `warn` would not -- and `pnpm lint` was `eslint .` with no
         * `--max-warnings`, which exits 0 on warnings. Both invariants could
         * have been switched off at the gate while this file stayed green.
         */
        result.messages.map((message) => ({
          rule: message.ruleId ?? 'parse error: ' + message.message,
          severity: message.severity,
          message: message.message,
        })),
      )
    }
    return byPath
  } finally {
    cleanUp()
  }
}

describe('the invariants are enforced by the linter, not only by CLAUDE.md', () => {
  afterAll(cleanUp)

  it.concurrent(
    'reports what it is supposed to report, and nothing on what is allowed',
    async () => {
      const byPath = await lintAll()

      /*
       * Every fixture was linted at all.
       *
       * `byPath.get(...) ?? []` reads a file ESLint declined to lint -- one
       * outside every `files` pattern, or in an ignored directory -- as a clean
       * result, which is indistinguishable from a passing control and hides a
       * failing case. If the config's scoping ever stops matching these
       * fixtures, every "did not report" assertion below becomes vacuous at
       * once.
       */
      const unlinted = CASES.filter((each) => !byPath.has(abs(each.path))).map((each) => each.what)
      expect(unlinted, 'ESLint did not lint these fixtures at all').toEqual([])

      const wrong: string[] = []
      for (const each of CASES) {
        const reported = byPath.get(abs(each.path)) ?? []
        const rules = reported.map((one) => one.rule)

        // A parse error would make every "did not report" assertion below pass
        // for the wrong reason, so it is called out as its own failure.
        const parseErrors = rules.filter((rule) => rule.startsWith('parse error'))
        if (parseErrors.length > 0) {
          wrong.push(each.what + ' could not be parsed: ' + parseErrors.join(', '))
          continue
        }

        if (each.rule === null) {
          if (rules.length > 0) wrong.push(each.what + ' was reported for ' + rules.join(', '))
          continue
        }

        const hits = reported.filter((one) => one.rule === each.rule)
        if (hits.length === 0) {
          wrong.push(
            each.what +
              ' was not reported by ' +
              each.rule +
              ' (got ' +
              (rules.join(', ') || 'nothing') +
              ')',
          )
          continue
        }

        /*
         * An invariant that only warns is not an invariant. `--max-warnings 0`
         * on the lint script is what makes a warning fail CI today, and the
         * test below holds that flag in place -- but a rule declared `error`
         * here says so in the config a reader opens, rather than in a flag in a
         * sibling file, so both are checked.
         */
        const warnings = hits.filter((one) => one.severity !== 2)
        if (warnings.length > 0) {
          wrong.push(
            each.what +
              ' was reported by ' +
              each.rule +
              ' at warning severity, which does not fail the build',
          )
          continue
        }

        if (each.says !== undefined && !hits.some((one) => one.message.includes(each.says ?? ''))) {
          wrong.push(
            each.what +
              ' was reported, but no message said "' +
              each.says +
              '" (got ' +
              hits.map((one) => one.message).join(' | ') +
              ')',
          )
        }
      }

      expect(wrong).toEqual([])
    },
    120_000,
  )

  /*
   * The gate, not the config.
   *
   * `eslint` exits 0 on warnings. Three of the sixteen rules in
   * `react-hooks`'s recommended preset ship as `"warn"` --
   * `exhaustive-deps`, `incompatible-library` and `unsupported-syntax` -- and
   * the config spreads that preset without overriding severity, so the rule the
   * hooks block was widened to reach `store.ts` for reported in yellow and CI
   * went green. Every hook in the designer lives in that file.
   *
   * `--max-warnings 0` closes that and every future one: a plugin upgrade that
   * adds a fourth warn-severity rule cannot reopen it. Which is exactly why the
   * flag needs a test -- it is one word in a sibling file, it looks like noise
   * in a diff, and nothing else in the repository would notice it going away.
   */
  it('fails the build on a warning, not only on an error', () => {
    const manifest: unknown = JSON.parse(readFileSync(abs('package.json'), 'utf8'))
    const scripts = (manifest as { scripts?: Record<string, string> }).scripts ?? {}
    const lint = scripts['lint'] ?? ''

    expect(lint, 'the lint script is gone or renamed').toContain('eslint')
    expect(
      lint,
      '`eslint` exits 0 on warnings, so without --max-warnings 0 any rule at warn severity is unenforced',
    ).toContain('--max-warnings 0')

    /*
     * `lint:fix` too, or the two scripts disagree about what clean means. A
     * contributor who runs the fixer, sees it exit 0 and pushes gets the
     * failure from CI instead -- which is the same "the guard and the gate
     * disagree, and the one that cannot fail is the one you ran" shape this
     * whole item is about, one script over.
     */
    expect(
      scripts['lint:fix'] ?? '',
      'lint:fix exits 0 on warnings that pnpm lint and CI both refuse',
    ).toContain('--max-warnings 0')
  })

  /*
   * And the reason the flag is load-bearing rather than belt-and-braces: this
   * asserts the three rules really do arrive at warn severity, so if a future
   * plugin release promotes them the comment above stops being true and this
   * test says so rather than quietly describing history.
   */
  it('still needs that flag, because the hooks preset still ships warn-severity rules', async () => {
    const plugin = await import('eslint-plugin-react-hooks')
    const rules = (
      plugin.default as unknown as {
        configs: { recommended: { rules: Record<string, unknown> } }
      }
    ).configs.recommended.rules

    /*
     * An entry may be a bare level or `[level, { ...options }]`. Reading only
     * the scalar form would report "no rule warns" for a preset whose
     * warn-severity rules had gained options -- concluding the flag was
     * unnecessary at exactly the moment it still was.
     */
    const severityOf = (level: unknown): unknown => (Array.isArray(level) ? level[0] : level)

    const warned = Object.entries(rules)
      .filter(([, level]) => severityOf(level) === 'warn' || severityOf(level) === 1)
      .map(([name]) => name)

    expect(
      warned.length,
      'no rule in the preset warns any more; --max-warnings 0 may now be the only thing this comment is about',
    ).toBeGreaterThan(0)
  })
})
