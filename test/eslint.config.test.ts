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

import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const abs = (path: string): string => fileURLToPath(new URL(path, root))

/** A fixture, named so nobody mistakes one for source if a run is killed. */
const fixture = (pkg: string, name: string, ext: 'ts' | 'tsx'): string =>
  'packages/' + pkg + '/src/__guardrail_fixture_' + name + '__.' + ext

interface Case {
  /** What the guardrail is supposed to stop. */
  what: string
  path: string
  code: string
  /** The rule that has to fire, or none for a control. */
  rule: string | null
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
    code: "import { muiKit } from '@formsmith/kit-mui'\nexport const k = muiKit\n",
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
    code: "export const load = (): Promise<unknown> => import('@formsmith/kit-mui')\n",
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
     * packages and not on the scope. `@formsmith/core` shares five sixths of its
     * name with `@formsmith/kit-mui` and is the package the designer is built
     * on; a selector one character too loose would refuse the designer's own
     * dependency, which is a failure nobody would call a false positive because
     * the build would simply stop.
     */
    what: 'the designer dynamically importing the core it is built on',
    path: fixture('designer', 'designer_dynamic_core', 'ts'),
    code: "export const load = (): Promise<unknown> => import('@formsmith/core')\n",
    rule: null,
  },
]

function cleanUp(): void {
  for (const each of CASES) rmSync(abs(each.path), { force: true })
}

/** Every case linted in one pass, because a type-aware run is not cheap. */
async function lintAll(): Promise<Map<string, string[]>> {
  for (const each of CASES) writeFileSync(abs(each.path), each.code)

  try {
    const eslint = new ESLint({ cwd: fileURLToPath(root) })
    const results = await eslint.lintFiles(CASES.map((each) => abs(each.path)))

    const byPath = new Map<string, string[]>()
    for (const result of results) {
      byPath.set(
        result.filePath,
        result.messages.map((message) => message.ruleId ?? 'parse error: ' + message.message),
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

      const wrong: string[] = []
      for (const each of CASES) {
        const rules = byPath.get(abs(each.path)) ?? []

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
        if (!rules.includes(each.rule)) {
          wrong.push(
            each.what +
              ' was not reported by ' +
              each.rule +
              ' (got ' +
              (rules.join(', ') || 'nothing') +
              ')',
          )
        }
      }

      expect(wrong).toEqual([])
    },
    120_000,
  )
})
