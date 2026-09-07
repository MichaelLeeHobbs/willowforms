/**
 * The published READMEs, compiled rather than read.
 *
 * These are the first thing anybody meets and the only documentation that ships
 * inside the package. Every one of them was wrong in a way a reader would hit on
 * their first paste:
 *
 * - `@willowforms/renderer`'s example wrote `{ ...data, [key]: value }`, which is
 *   the anti-pattern `applyChange`'s own doc comment warns against by name.
 *   Inside a repeater the address is `addresses[1].line1`, so that spread
 *   creates a literal property with that name and every row answer is lost.
 * - the designer and renderer examples imported `@willowforms/kit-mui` from an
 *   install line that did not include it, and could not: the lint config forbids
 *   those packages from depending on a kit, so the transitive install a reader
 *   would rely on does not exist.
 * - both kit READMEs advertised eight component types. Both kits ship 27.
 *
 * Nothing checked any of it, because prose is not run. These blocks are compiled
 * now, so an example that would not build fails here instead of in somebody's
 * editor.
 *
 * Against the sources the `exports` maps point at rather than against `dist`,
 * deliberately: the gate runs `pnpm test` before `pnpm build`, so a check that
 * needed `dist` would fail on a clean checkout for a reason that has nothing to
 * do with the READMEs. It is the same public surface either way -- these are the
 * entry files `dist` is built from -- and the `exports` check below is what
 * covers the part a build would have caught.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { htmlKit } from '@willowforms/kit-html'
import { muiKit } from '@willowforms/kit-mui'

const root = new URL('../', import.meta.url)
const at = (path: string): string => fileURLToPath(new URL(path, root))
const read = (path: string): string => readFileSync(at(path), 'utf8')

interface Readme {
  /** The package name, e.g. `@willowforms/core`. */
  name: string
  path: string
  text: string
}

/**
 * Every package that publishes a README.
 *
 * Read off the directory rather than listed, so a sixth package is covered the
 * day it exists. A private package is skipped: its README is not published and
 * nobody installs it.
 */
const READMES: Readme[] = readdirSync(at('packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ dir: entry.name, path: 'packages/' + entry.name + '/README.md' }))
  .filter((entry) => {
    const manifest = JSON.parse(read('packages/' + entry.dir + '/package.json')) as {
      private?: boolean
    }
    return manifest.private !== true
  })
  .map((entry) => ({
    name: (JSON.parse(read('packages/' + entry.dir + '/package.json')) as { name: string }).name,
    path: entry.path,
    text: read(entry.path),
  }))

/** Every fenced `ts` or `tsx` block, with the language it declared. */
function blocks(text: string): { lang: 'ts' | 'tsx'; code: string }[] {
  return [...text.matchAll(/^```(ts|tsx)\n([\s\S]*?)^```$/gm)].map((match) => ({
    lang: match[1] as 'ts' | 'tsx',
    code: match[2] ?? '',
  }))
}

/** Every package name an install line in this README tells the reader to add. */
function installed(text: string): Set<string> {
  const names = new Set<string>()
  for (const match of text.matchAll(/^(?:npm install|pnpm add|yarn add) (.+)$/gm)) {
    for (const word of (match[1] ?? '').split(/\s+/)) {
      if (word && !word.startsWith('-')) names.add(word)
    }
  }
  return names
}

/** The package a bare import specifier belongs to, ignoring any subpath. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

function importsIn(code: string): string[] {
  return [...code.matchAll(/^import\s+(?:[\s\S]*?from\s+)?'([^']+)'/gm)].map(
    (match) => match[1] ?? '',
  )
}

describe('every published README', () => {
  it('was found, and there is more than one', () => {
    // The control for the discovery above. An empty list would make every rule
    // below pass over nothing.
    expect(READMES.length).toBeGreaterThan(3)
    expect(READMES.map((entry) => entry.name)).toContain('@willowforms/core')
  })

  it.each(READMES.map((entry) => [entry.name, entry] as const))(
    '%s shows at least one example',
    (_name, entry) => {
      expect(blocks(entry.text).length, entry.path + ' has no ts or tsx block').toBeGreaterThan(0)
    },
  )

  it.each(READMES.map((entry) => [entry.name, entry] as const))(
    '%s only imports what its install line provides',
    (_name, entry) => {
      const provided = installed(entry.text)
      const missing = new Set<string>()

      for (const block of blocks(entry.text)) {
        for (const specifier of importsIn(block.code)) {
          if (specifier.startsWith('.')) continue
          const pkg = packageOf(specifier)
          // The package's own README need not tell you to install itself twice,
          // and `react` is a peer every consumer of a React library already has.
          if (pkg === entry.name || pkg === 'react') continue
          if (!provided.has(pkg)) missing.add(pkg)
        }
      }

      expect(
        [...missing],
        entry.path + ' imports these and its install line does not mention them',
      ).toEqual([])
    },
  )

  it.each(READMES.map((entry) => [entry.name, entry] as const))(
    '%s imports only subpaths the package publishes',
    (_name, entry) => {
      /*
       * The half a typecheck against sources cannot see. `@willowforms/kit-html/styles.css`
       * resolves for a consumer only if the `exports` map says so, and a README
       * naming a subpath nobody publishes is a paste that fails at install time
       * rather than at compile time.
       */
      const wrong: string[] = []

      for (const block of blocks(entry.text)) {
        for (const specifier of importsIn(block.code)) {
          if (!specifier.startsWith('@willowforms/')) continue
          const pkg = packageOf(specifier)
          const dir = pkg.slice('@willowforms/'.length)
          const manifest = JSON.parse(read('packages/' + dir + '/package.json')) as {
            exports?: Record<string, unknown>
          }
          const subpath = specifier === pkg ? '.' : '.' + specifier.slice(pkg.length)
          if (!manifest.exports || !(subpath in manifest.exports)) {
            wrong.push(specifier + ' (' + pkg + ' publishes no ' + subpath + ')')
          }
        }
      }

      expect(wrong, entry.path + ' imports a subpath that is not published').toEqual([])
    },
  )
})

/**
 * The write an example shows a host doing.
 *
 * `FormRenderer`'s `onChange` hands over an *address*, not a key. Outside a
 * repeater the two are the same string, which is why the wrong version looked
 * right for a year; inside one it is `addresses[1].line1`, and
 * `{ ...data, [address]: value }` then creates a literal property with that name
 * and every row answer is lost. `applyChange` exists in core so no host has to
 * implement array descent, and its doc comment names this exact spread as the
 * anti-pattern it replaces.
 *
 * A text rule rather than a type one, deliberately: the spread is perfectly
 * well-typed. The compile check below cannot see this and never will, which is
 * why it is a rule of its own -- measured, by putting the spread back and
 * watching the suite stay green until this existed.
 */
describe('an example that writes an answer', () => {
  it.each(READMES.map((entry) => [entry.name, entry] as const))(
    '%s uses applyChange rather than spreading the address as a key',
    (_name, entry) => {
      for (const block of blocks(entry.text)) {
        if (!/onChange=\{/.test(block.code)) continue
        if (!/<FormRenderer/.test(block.code)) continue

        expect(
          block.code,
          entry.path + " shows a host writing an answer without core's writer",
        ).toContain('applyChange')
        expect(
          /\{\s*\.\.\.[A-Za-z]+,\s*\[/.test(block.code),
          entry.path + ' spreads a computed key, which loses every repeater row',
        ).toBe(false)
      }
    },
  )
})

/**
 * The counts a kit README states, against the kit.
 *
 * Both said eight. Both ship 27. A number in prose is exactly the kind of fact
 * that is true on the day it is written and never again.
 */
describe('what a kit README claims it ships', () => {
  it.each([
    ['@willowforms/kit-mui', 'packages/kit-mui/README.md', muiKit.components.length],
    ['@willowforms/kit-html', 'packages/kit-html/README.md', htmlKit.components.length],
  ])('%s states the number of components it has', (_name, path, count) => {
    const stated = [...read(path).matchAll(/(\d+) component types/g)].map((match) =>
      Number(match[1]),
    )

    expect(stated.length, path + ' states no component count').toBeGreaterThan(0)
    expect([...new Set(stated)], path + ' disagrees with the kit').toEqual([count])
  })
})

/**
 * And they compile.
 *
 * One `tsc` for all of them, because a type-aware pass is not cheap and the
 * blocks are independent files anyway.
 */
describe('the examples in every published README', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'willowforms-readme-'))

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  it('compile against the packages they import', () => {
    const files: string[] = []

    for (const entry of READMES) {
      blocks(entry.text).forEach((block, index) => {
        const name =
          entry.name.replace('@willowforms/', '') + '-' + String(index) + '.' + block.lang
        writeFileSync(join(workspace, name), block.code, 'utf8')
        files.push(name)
      })
    }

    expect(files.length, 'no example was extracted, so this checked nothing').toBeGreaterThan(4)

    // A stylesheet import is a bundler concern; TypeScript needs telling that
    // it is not a module with types.
    writeFileSync(join(workspace, 'css.d.ts'), "declare module '*.css'\n", 'utf8')

    const paths: Record<string, string[]> = {
      '@willowforms/core': [at('packages/core/src/index.ts')],
      '@willowforms/renderer': [at('packages/renderer/src/index.tsx')],
      '@willowforms/designer': [at('packages/designer/src/index.ts')],
      '@willowforms/kit-mui': [at('packages/kit-mui/src/index.ts')],
      '@willowforms/kit-html': [at('packages/kit-html/src/index.ts')],
    }

    writeFileSync(
      join(workspace, 'tsconfig.json'),
      JSON.stringify({
        extends: at('tsconfig.base.json'),
        compilerOptions: {
          noEmit: true,
          jsx: 'react-jsx',
          module: 'esnext',
          moduleResolution: 'bundler',
          skipLibCheck: true,
          types: [],
          typeRoots: [at('node_modules/@types')],
          baseUrl: '.',
          paths,
        },
        include: ['*.ts', '*.tsx'],
      }),
      'utf8',
    )

    try {
      execFileSync('node', [at('node_modules/typescript/bin/tsc'), '-p', workspace], {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (error) {
      const output = (error as { stdout?: string; stderr?: string }).stdout ?? ''
      throw new Error(
        'A README example does not compile. The file name says which README and which block:\n' +
          output,
      )
    }
  }, 120_000)
})
