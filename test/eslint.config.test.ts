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
    what: 'the designer depending on a specific kit',
    path: fixture('designer', 'designer_kit', 'ts'),
    code: "import { muiKit } from '@formsmith/kit-mui'\nexport const k = muiKit\n",
    rule: 'no-restricted-imports',
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
