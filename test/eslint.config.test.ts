/**
 * Fixtures are written to disk rather than linted as text, because the config
 * is type-aware and typescript-eslint refuses a path its tsconfig has never
 * heard of.
 */

import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'
import { FIXTURE_PREFIX } from './fixtures.js'

const root = new URL('../', import.meta.url)
const abs = (path: string): string => fileURLToPath(new URL(path, root))

const fixture = (pkg: string, name: string, ext: 'ts' | 'tsx'): string =>
  'packages/' + pkg + '/src/' + FIXTURE_PREFIX + name + '__.' + ext

interface Case {
  what: string
  path: string
  code: string
  /** null for a control, which must report nothing. */
  rule: string | null
  /** Part of the message; set only where the wording is the deliverable. */
  says?: string
}

interface Reported {
  rule: string
  /** ESLint's numbering: 2 is an error, 1 is a warning. */
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
  // The other COMPONENT_LIBRARIES names, spread across both invariants so the
  // list is proved to reach core and the designer alike.
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
  // The core and designer helper cases also check that the helper selector
  // joins those blocks' invariant lists instead of replacing them.
  {
    what: 'a kit redeclaring a prop helper the renderer exports',
    path: fixture('kit-html', 'kit_str_copy', 'ts'),
    code: 'export const str = (v: unknown): string => String(v)\n',
    rule: 'no-restricted-syntax',
    says: '@willowforms/renderer',
  },
  {
    what: 'core redeclaring the plain-object guard',
    path: fixture('core', 'core_is_record_copy', 'ts'),
    code:
      'export function isRecord(v: unknown): boolean {\n' +
      "  return typeof v === 'object' && v !== null && !Array.isArray(v)\n" +
      '}\n',
    rule: 'no-restricted-syntax',
    says: 'src/guards.ts',
  },
  {
    what: 'the designer redeclaring a panel text helper',
    path: fixture('designer', 'designer_name_of_copy', 'ts'),
    code: 'export const nameOf = (v: { name?: unknown }): string => String(v.name)\n',
    rule: 'no-restricted-syntax',
    says: 'nameOf from designer',
  },
  {
    what: 'the renderer redeclaring a shared helper',
    path: fixture('renderer', 'renderer_params_copy', 'ts'),
    code: 'export const paramsText = (v: unknown): string => JSON.stringify(v)\n',
    rule: 'no-restricted-syntax',
  },
  {
    what: 'a kit exporting a prop helper copy as a function',
    path: fixture('kit-mui', 'kit_num_copy', 'ts'),
    code: 'export function num(v: unknown): number {\n  return Number(v)\n}\n',
    rule: 'no-restricted-syntax',
    says: '@willowforms/renderer',
  },
  {
    what: 'a kit using a prop helper name for a local variable',
    path: fixture('kit-html', 'kit_local_changed', 'ts'),
    code:
      'export function count(values: number[]): boolean {\n' +
      '  let changed = false\n' +
      '  for (const value of values) if (value > 0) changed = true\n' +
      '  return changed\n' +
      '}\n',
    rule: null,
  },
  {
    what: 'a kit importing a prop helper from the renderer',
    path: fixture('kit-html', 'kit_str_import', 'ts'),
    code: "import { str } from '@willowforms/renderer'\nexport const label = str('x', 'y')\n",
    rule: null,
  },
  {
    // Without a case that reports nothing, a config erroring on every file would pass.
    what: 'core importing something it is allowed to import',
    path: fixture('core', 'core_allowed', 'ts'),
    code: "import { readFileSync } from 'node:fs'\nexport const r = readFileSync\n",
    rule: null,
  },
  {
    // A bare `ImportExpression` selector would refuse every dynamic import and
    // still pass every case above.
    what: 'core dynamically importing something it is allowed to import',
    path: fixture('core', 'core_dynamic_allowed', 'ts'),
    code: "export const load = (): Promise<unknown> => import('node:fs')\n",
    rule: null,
  },
  {
    // The near miss: the kit selector must be a prefix on the kit packages, not
    // on the `@willowforms` scope.
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

      // `?? []` below reads a fixture ESLint declined to lint as clean, which
      // would make every "did not report" assertion vacuous.
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

  it('fails the build on a warning, not only on an error', () => {
    const manifest: unknown = JSON.parse(readFileSync(abs('package.json'), 'utf8'))
    const scripts = (manifest as { scripts?: Record<string, string> }).scripts ?? {}
    const lint = scripts['lint'] ?? ''

    expect(lint, 'the lint script is gone or renamed').toContain('eslint')
    expect(
      lint,
      '`eslint` exits 0 on warnings, so without --max-warnings 0 any rule at warn severity is unenforced',
    ).toContain('--max-warnings 0')

    expect(
      scripts['lint:fix'] ?? '',
      'lint:fix exits 0 on warnings that pnpm lint and CI both refuse',
    ).toContain('--max-warnings 0')
  })

  it('still needs that flag, because the hooks preset still ships warn-severity rules', async () => {
    const plugin = await import('eslint-plugin-react-hooks')
    const rules = (
      plugin.default as unknown as {
        configs: { recommended: { rules: Record<string, unknown> } }
      }
    ).configs.recommended.rules

    // An entry may be a bare level or `[level, { ...options }]`.
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
