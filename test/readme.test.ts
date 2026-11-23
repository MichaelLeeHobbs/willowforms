/**
 * Compiled against the sources the `exports` maps point at, not against `dist`:
 * the gate runs `pnpm test` before `pnpm build`. The `exports` check below
 * covers what a build would have caught.
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
  name: string
  path: string
  text: string
}

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

function blocks(text: string): { lang: 'ts' | 'tsx'; code: string }[] {
  return [...text.matchAll(/^```(ts|tsx)\n([\s\S]*?)^```$/gm)].map((match) => ({
    lang: match[1] as 'ts' | 'tsx',
    code: match[2] ?? '',
  }))
}

function installed(text: string): Set<string> {
  const names = new Set<string>()
  for (const match of text.matchAll(/^(?:npm install|pnpm add|yarn add) (.+)$/gm)) {
    for (const word of (match[1] ?? '').split(/\s+/)) {
      if (word && !word.startsWith('-')) names.add(word)
    }
  }
  return names
}

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
      // The half a typecheck against sources cannot see: a subpath resolves for a
      // consumer only if the `exports` map lists it.
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
 * A text rule: `{ ...data, [address]: value }` is well-typed, so the compile
 * check below cannot catch it.
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

/** One `tsc` for all of them, because a type-aware pass is not cheap. */
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
