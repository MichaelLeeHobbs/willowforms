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

const DOCS_WITH_COUNTS = ['README.md', 'CLAUDE.md', 'docs/ROADMAP.md']

/** Every "N tests" figure a document quotes as the size of the whole suite. */
function totals(text: string): number[] {
  const counts: number[] = []
  // Only the headline totals: "278 tests" preceded by nothing that scopes it to
  // one area, which is how per-feature counts elsewhere in the roadmap read.
  for (const match of text.matchAll(/(?:vitest, |pnpm test\s+#[^\n]*?|\b)(\d{2,4}) tests\b/g)) {
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

describe('documentation links', () => {
  const files = ['README.md', 'CLAUDE.md', 'docs/ROADMAP.md', 'docs/ARCHITECTURE.md']

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
