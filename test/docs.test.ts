/**
 * Documentation that cannot silently rot.
 *
 * Both checks here are for drift that actually happened while building this
 * repo. The README claimed 52 tests when there were 278, because the number
 * lives in three files and only one of them got updated. A new package can just
 * as easily never reach the README's table, and nothing else would notice.
 *
 * Neither check verifies that the prose is true, only that the facts it states
 * agree with the repo and with each other. That is the part a reader can check
 * for themselves in ten seconds and lose all trust over.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, root)), 'utf8')

/** The anchors a markdown file offers, slugged the way GitHub slugs a heading. */
function headings(text: string): string[] {
  return [...text.matchAll(/^#{1,6} +(.+?)\s*$/gm)].map((match) =>
    (match[1] ?? '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-'),
  )
}

const DOCS_WITH_COUNTS = [
  'README.md',
  'CLAUDE.md',
  'docs/ROADMAP.md',
  'docs/spec/README.md',
  'docs/spec/08-validation.md',
]

/** Every "N tests" figure a document quotes as the size of the whole suite. */
function totals(text: string): number[] {
  const counts: number[] = []
  /*
   * Only the headline totals: "278 tests" preceded by nothing that scopes it to
   * one area, which is how per-feature counts elsewhere in the roadmap read.
   *
   * The optional word before "tests" matters. This matched "345 tests" and not
   * "345 unit tests", so a stale figure sat in the roadmap and in the spec while
   * this test passed over both of them, in the commit that added it.
   */
  for (const match of text.matchAll(
    /(?:vitest, |pnpm test\s+#[^\n]*?|\b)(\d{2,4}) (?:unit |end-to-end )?tests\b/g,
  )) {
    const value = Number(match[1])
    if (value >= 100) counts.push(value)
  }
  return counts
}

describe('documented test counts', () => {
  it('quotes the same total everywhere it is mentioned', () => {
    const quoted = DOCS_WITH_COUNTS.map((path) => ({ path, counts: totals(read(path)) }))

    const found = quoted.flatMap((entry) => entry.counts)
    expect(found.length, 'no test total is quoted in any document').toBeGreaterThan(0)

    const unique = [...new Set(found)]
    expect(
      unique,
      'documents disagree about the suite size: ' +
        quoted.map((e) => e.path + ' says ' + e.counts.join('/')).join(', '),
    ).toHaveLength(1)
  })
})

describe('the README package table', () => {
  const readme = read('README.md')

  const published = readdirSync(fileURLToPath(new URL('packages', root)), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => '@formsmith/' + entry.name)

  it('finds the packages to check', () => {
    expect(published.length).toBeGreaterThan(3)
  })

  it.each(published)('lists %s', (name) => {
    // A package nobody can find in the README may as well not be published.
    expect(readme).toContain(name)
  })

  it('names no package that does not exist', () => {
    const mentioned = [...readme.matchAll(/@formsmith\/([a-z-]+)/g)].map(
      (m) => '@formsmith/' + m[1],
    )
    const ghosts = [...new Set(mentioned)].filter((name) => !published.includes(name))
    expect(ghosts).toEqual([])
  })
})

describe('the specification index', () => {
  const index = read('docs/spec/README.md')

  const files = readdirSync(fileURLToPath(new URL('docs/spec', root)))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()

  it('finds the specification', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('lists %s', (name) => {
    // A contract nobody can find from the index may as well not be written.
    expect(index).toContain('(' + name + ')')
  })

  it.each(files)('%s opens with a status', (name) => {
    // The status is what makes this document also the roadmap. A section with
    // none is a claim with no accountability. 00-product is a statement of
    // intent with no code to match, so it deliberately carries none.
    if (name === '00-product.md') return
    const text = read('docs/spec/' + name)
    expect(text).toMatch(/\*\*Status: (built|partial|planned|undecided)/i)
  })

  it('links to no specification file that does not exist', () => {
    const linked = [...index.matchAll(/\]\((\d\d-[a-z-]+\.md)\)/g)].map((match) => match[1])
    const missing = [...new Set(linked)].filter((name) => !files.includes(name as string))
    expect(missing).toEqual([])
  })

  /*
   * Cross-references between spec files went unchecked: only the index's links
   * were, and only those naming a numbered file. Twelve files pointing at each
   * other's headings could all rot without a test noticing.
   */
  it.each(files)('%s links only to files and headings that exist', (name) => {
    const text = read('docs/spec/' + name)
    const broken: string[] = []

    for (const match of text.matchAll(/\]\((?!https?:)([^)\s]+)\)/g)) {
      const [file, anchor] = (match[1] ?? '').split('#')

      let body = text
      if (file) {
        const path = file.startsWith('../') ? 'docs/' + file.slice(3) : 'docs/spec/' + file
        try {
          body = read(path)
        } catch {
          broken.push(match[1] + ' (no such file)')
          continue
        }
      }
      if (anchor && !headings(body).includes(anchor)) broken.push(match[1] + ' (no such heading)')
    }

    expect(broken).toEqual([])
  })
})

describe('the kit contract table', () => {
  it('has one row for every rule the contract suite runs', () => {
    /*
     * The table said twelve while the suite ran thirteen. Nothing compared the
     * two, so the missing rule was invisible to anyone deciding what their own
     * kit had to satisfy.
     */
    const spec = read('docs/spec/02-kit-contract.md')
    const table = spec.slice(spec.indexOf('| Rule'))
    const rows = [...table.matchAll(/^\| [A-Z][^|]*\|/gm)].length - 1

    const suite = read('test/kit-contract.test.tsx')
    const cases = [...suite.matchAll(/^\s+it(?:\.each)?\(/gm)].length

    expect(rows, 'the rule table and the contract suite disagree').toBe(cases)
  })
})

describe('documentation links', () => {
  const files = [
    'README.md',
    'CLAUDE.md',
    'docs/ROADMAP.md',
    'docs/ARCHITECTURE.md',
    'docs/accessibility.md',
    'docs/prior-art/README.md',
  ]

  it.each(files)('%s links only to files that exist', (file) => {
    const text = read(file)
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''

    const broken = [...text.matchAll(/\]\((?!https?:)([^)#]+)\)/g)]
      .map((match) => (match[1] ?? '').trim())
      .filter((target) => {
        const path = target.startsWith('docs/') || base === '' ? target : base + target
        try {
          readFileSync(fileURLToPath(new URL(path, root)))
          return false
        } catch {
          return true
        }
      })

    expect(broken).toEqual([])
  })
})
