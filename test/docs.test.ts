import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isFixture } from './fixtures.js'

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

/**
 * Both directions: understating enforcement misleads a kit author, who budgets
 * against the document and meets a red build.
 */
describe('the accessibility obligations table', () => {
  const rows = (): { obligation: string; attribute: string; enforced: string }[] => {
    const spec = read('docs/spec/02-kit-contract.md')
    const from = spec.indexOf('| Obligation')
    const rest = spec.slice(from)
    const end = rest.search(/\n[ \t]*\n/)
    const table = end === -1 ? rest : rest.slice(0, end)

    return [...table.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|$/gm)]
      .map((match) => ({
        obligation: (match[1] ?? '').trim(),
        attribute: (match[2] ?? '').trim().replace(/`/g, ''),
        enforced: (match[3] ?? '').trim(),
      }))
      .filter((row) => row.enforced === 'yes' || row.enforced === 'no')
  }

  it('was read, and says something', () => {
    const found = rows()
    expect(found.length, 'the obligations table could not be read').toBeGreaterThan(4)
    expect(found.filter((row) => row.enforced === 'yes').length).toBeGreaterThan(2)
    expect(found.filter((row) => row.enforced === 'no').length).toBeGreaterThan(0)
  })

  it('claims enforcement only where the contract suite enforces it', () => {
    const suite = read('test/kit-contract.test.tsx')
    const wrong: string[] = []

    for (const row of rows()) {
      // A row with no attribute (a label pointing at its control, a focus
      // indicator surviving) needs a browser, so it cannot be marked enforced.
      if (row.attribute === '' || row.attribute === '—') {
        if (row.enforced === 'yes')
          wrong.push(row.obligation + ' claims enforcement and names no attribute')
        continue
      }

      const asserted = suite.includes(row.attribute)
      if (row.enforced === 'yes' && !asserted) {
        wrong.push(row.attribute + ' is marked enforced and the contract suite never mentions it')
      }
      if (row.enforced === 'no' && asserted) {
        wrong.push(row.attribute + ' is marked unenforced and the contract suite asserts it')
      }
    }

    expect(wrong, 'docs/spec/02-kit-contract.md disagrees with the contract suite').toEqual([])
  })
})

describe('the README package table', () => {
  const readme = read('README.md')

  const published = readdirSync(fileURLToPath(new URL('packages', root)), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => '@willowforms/' + entry.name)

  it('finds the packages to check', () => {
    expect(published.length).toBeGreaterThan(3)
  })

  it.each(published)('lists %s', (name) => {
    expect(readme).toContain(name)
  })

  it('names no package that does not exist', () => {
    const mentioned = [...readme.matchAll(/@willowforms\/([a-z-]+)/g)].map(
      (m) => '@willowforms/' + m[1],
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
    expect(index).toContain('(' + name + ')')
  })

  /**
   * Brace-matched rather than read to the first `}`, because a field can be a
   * function type or an object literal and take a brace with it.
   */
  const fieldsOf = (text: string, name: string): string[] => {
    const open = text.indexOf('interface ' + name)
    expect(open, 'no interface ' + name + ' to read').toBeGreaterThan(-1)

    let depth = 0
    let end = open
    for (let at = text.indexOf('{', open); at < text.length; at += 1) {
      if (text[at] === '{') depth += 1
      if (text[at] === '}') depth -= 1
      if (depth === 0) {
        end = at
        break
      }
    }

    const body = text
      .slice(text.indexOf('{', open) + 1, end)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1] ?? '').sort()
  }

  it('publishes the key grammar core actually enforces', () => {
    const keys = read('packages/core/src/keys.ts')
    const spec = read('docs/spec/12-api.md')

    /*
     * From the end of the line that opens the array, not from the first `[`
     * after the name: the export is typed `readonly string[]`, so that bracket
     * belongs to the type.
     */
    const namesIn = (text: string): string[] => {
      const at = text.search(/^.*RESERVED_KEYS[^\n]*\[\s*$/m)
      expect(at, 'no RESERVED_KEYS array to read').toBeGreaterThan(-1)

      const from = text.indexOf('\n', at)

      // The first `]` at the start of a line, not the next `]` anywhere, which
      // may belong to something further down the file.
      const found = /^\s*\]/m.exec(text.slice(from))
      const close = found ? from + found.index : -1

      expect(close, 'the RESERVED_KEYS array is not closed').toBeGreaterThan(from)

      const list = text.slice(from, close)
      return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '').sort()
    }

    const published = namesIn(spec)
    const exported = namesIn(keys)

    expect(
      published.length,
      'the published list is empty, so this compared nothing',
    ).toBeGreaterThan(0)
    expect(published, 'the specification publishes a different reserved list').toEqual(exported)
    expect(exported.length, 'the exported list is empty, so this compared nothing').toBeGreaterThan(
      0,
    )

    // Each side is checked present first: `exec(...)?.[1]` is `undefined` on a
    // miss, and `undefined === undefined` passes.
    const figure = (expression: RegExp, text: string, what: string): string => {
      const found = expression.exec(text)?.[1]
      expect(found, 'no ' + what + ' to read, so this compared nothing').toBeDefined()
      return found ?? ''
    }

    const pattern = /KEY_PATTERN = (\S+)/
    expect(
      figure(pattern, spec, 'published KEY_PATTERN'),
      'the published pattern is not the exported one',
    ).toBe(figure(pattern, keys, 'exported KEY_PATTERN'))

    const bound = /MAX_KEY_LENGTH = (\d+)/
    expect(
      figure(bound, spec, 'published MAX_KEY_LENGTH'),
      'the published length bound is not the exported one',
    ).toBe(figure(bound, keys, 'exported MAX_KEY_LENGTH'))
  })

  it.each([
    ['03-components.md', 'ComponentDef', 'packages/core/src/kit.ts'],
    ['01-document-model.md', 'ComponentNode', 'packages/core/src/types.ts'],
  ])('%s declares the same fields as %s in core', (file, name, source) => {
    // Names only, not types: a spec block may shorten a type for a reader, but
    // it may not miss a field.
    expect(fieldsOf(read('docs/spec/' + file), name)).toEqual(fieldsOf(read(source), name))
  })

  it.each(files)('%s opens with the status the index gives it', (name) => {
    /*
     * An equality, not "no worse than": the file is the copy edited as work
     * lands, so it is the one that overstates. `00-product.md` carries no
     * status in either place.
     */
    if (name === '00-product.md') return

    const text = read('docs/spec/' + name)
    const end = text.indexOf('\n## ')
    const preamble = end === -1 ? text : text.slice(0, end)
    const opens = /\*\*Status: (built|partial|planned|undecided)/i.exec(preamble)

    expect(opens, name + ' has no status before its first section').toBeTruthy()

    // Found by its link, not by position: the Covers column is prose, and a
    // column index would move when a column is added.
    const row = index
      .split('\n')
      .find((line) => line.startsWith('|') && line.includes('(' + name + ')'))

    expect(row, name + ' has no row in the index table').toBeTruthy()

    const cells = (row ?? '').split('|').map((cell) => cell.trim())
    const state = cells[cells.length - 2] ?? ''

    expect(
      state.toLowerCase(),
      name + ' opens ' + (opens?.[1] ?? '') + ' and the index says ' + state,
    ).toBe((opens?.[1] ?? '').toLowerCase())
  })

  it.each(files)('%s opens with a status', (name) => {
    // 00-product is a statement of intent with no code to match, so it carries no status.
    if (name === '00-product.md') return
    const text = read('docs/spec/' + name)
    const end = text.indexOf('\n## ')
    const preamble = end === -1 ? text : text.slice(0, end)

    expect(preamble, name + ' has no status before its first section').toMatch(
      /\*\*Status: (built|partial|planned|undecided)/i,
    )
  })

  it('links to no specification file that does not exist', () => {
    const linked = [...index.matchAll(/\]\((\d\d-[a-z-]+\.md)\)/g)].map((match) => match[1])
    const missing = [...new Set(linked)].filter((name) => !files.includes(name as string))
    expect(missing).toEqual([])
  })

  it.each([...files, 'README.md'])('%s links only to files and headings that exist', (name) => {
    const text = read('docs/spec/' + name)
    const broken: string[] = []

    for (const match of text.matchAll(/\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)([^)\s]+)\)/g)) {
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

const CONTRACT_RULES = 27

/**
 * And how many are driven per kit from outside the per-kit block.
 *
 * The guard below counted only the `describe.each(KITS)` block, on purpose --
 * the file also holds checks that are not obligations on a kit at all. But
 * twenty-one cases outside that block *are*: they run against every registered
 * kit -- directly through `KITS`, or through a table built from `KITS` and a
 * list of component types -- and fail a kit by name. They were written down
 * nowhere, so the spec presented the first table as the whole obligation set
 * while the suite ran nearly twice that.
 *
 * The `_CASES` naming is load-bearing, not a style: a rule written as
 * `it.each(KITS.flatMap(...))` inline matches neither half of the pattern
 * below, so it would be an obligation this count never sees.
 */
const CONTRACT_RULES_PER_KIT = 23

/** Courtesies these two kits keep, not obligations on a third-party kit. */
const NOT_OBLIGATIONS = ['the two kits in this repository agree', 'a default copied between kits']

describe('the kit contract table', () => {
  it('has one row for every rule the contract suite runs', () => {
    const spec = read('docs/spec/02-kit-contract.md')
    // The rule table only, not every table after it.
    const fromRules = spec.slice(spec.indexOf('| Rule'))
    const afterTable = fromRules.search(/\n[ \t]*\n/)
    const table = afterTable === -1 ? fromRules : fromRules.slice(0, afterTable)
    // Any first character, since a row may open with a backtick.
    const rows = [...table.matchAll(/^\|(?! *-)[^|\n]+\|/gm)].length - 1

    const suite = read('test/kit-contract.test.tsx')
    // To the next top-level `describe`, not the end of the file: the describes
    // after the per-kit block are not obligations on a kit.
    const fromKits = suite.slice(suite.indexOf('describe.each(KITS)'))
    const nextBlock = fromKits.indexOf('\ndescribe(')
    const rules = nextBlock === -1 ? fromKits : fromKits.slice(0, nextBlock)
    const cases = [...rules.matchAll(/^\s+it(?:\.each)?\(/gm)].length

    expect(rows, 'the rule table and the contract suite disagree').toBe(cases)
    expect(rows, 'a contract rule was added or removed; say so here as well').toBe(CONTRACT_RULES)
  })

  it('has a second row for every rule driven per kit outside that block', () => {
    const suite = read('test/kit-contract.test.tsx')

    const blockAt = suite.indexOf('describe.each(KITS)')
    const blockEnds = suite.indexOf('\ndescribe(', blockAt)
    let outside = suite.slice(0, blockAt) + (blockEnds === -1 ? '' : suite.slice(blockEnds))
    for (const name of NOT_OBLIGATIONS) {
      const at = outside.indexOf("describe('" + name)
      if (at === -1) continue
      const next = outside.indexOf('\ndescribe(', at)
      outside = outside.slice(0, at) + (next === -1 ? '' : outside.slice(next))
    }

    // `KITS` directly, or a table built from it: `LIST_CASES` and `VALUE_CASES`
    // are `KITS.flatMap(...)`, so each of their rows is a kit failing by name.
    const cases = [...outside.matchAll(/it\.each\((?:KITS|[A-Z_]+_CASES)\)\(/g)].length
    expect(cases, 'no per-kit rules were found outside the block').toBeGreaterThan(0)
    expect(
      cases,
      'a rule driven per kit was added or removed; say so in 02-kit-contract.md as well',
    ).toBe(CONTRACT_RULES_PER_KIT)

    const spec = read('docs/spec/02-kit-contract.md')
    const heading = spec.indexOf('### And the rules driven per kit from outside that block')
    expect(heading, 'the second obligation table is gone from the spec').toBeGreaterThan(-1)

    const fromRules = spec.slice(spec.indexOf('| Rule', heading))
    const afterTable = fromRules.search(/\n[ \t]*\n/)
    const table = afterTable === -1 ? fromRules : fromRules.slice(0, afterTable)
    const rows = [...table.matchAll(/^\|(?! *-)[^|\n]+\|/gm)].length - 1

    expect(rows, 'the second table and the suite disagree').toBe(cases)

    // The fixed counts catch a test and an unrelated table row deleted
    // together, which leaves the table and the suite equal to each other.
  })
})

describe('the events table', () => {
  const declared = (path: string): Map<string, string[]> => {
    const source = read(path)
    const found = new Map<string, string[]>()

    for (const match of source.matchAll(/type: '(\w+)'/g)) {
      const after = source.slice(match.index + match[0].length, match.index + 2500)
      const events = /events: \[([^\]]*)\]/.exec(after)
      if (!events) continue
      found.set(
        match[1] ?? '',
        [...(events[1] ?? '').matchAll(/'(\w+)'/g)].map((event) => event[1] ?? ''),
      )
    }

    return found
  }

  const mui = declared('packages/kit-mui/src/definitions.ts')
  const html = declared('packages/kit-html/src/definitions.ts')

  it('found the declarations to check against', () => {
    expect(mui.size).toBeGreaterThan(15)
    expect([...mui.keys()].sort()).toEqual([...html.keys()].sort())
  })

  it('the two kits declare the same events for the same component', () => {
    const differing = [...mui.entries()]
      .filter(([type, events]) => (html.get(type) ?? []).join() !== events.join())
      .map(([type]) => type)

    expect(differing).toEqual([])
  })

  it.each(['onChange', 'onClick', 'onBlur', 'onFocus'])(
    'lists every component that raises %s',
    (event) => {
      const raising = [...mui.entries()]
        .filter(([, events]) => events.includes(event))
        .map(([type]) => type)
        .sort()

      const spec = read('docs/spec/03-components.md')
      const row = new RegExp('^\\| `' + event + '`[^|]*\\|([^|]*)\\|', 'm').exec(spec)
      expect(row, event + ' has no row in the events table').not.toBeNull()

      const listed = [...(row?.[1] ?? '').matchAll(/`(\w+)`/g)]
        .map((match) => match[1] ?? '')
        .sort()
      expect(listed, 'the events table and the kits disagree about ' + event).toEqual(raising)
    },
  )
})

/**
 * `11-theming.md` is the only place token names are written down, so a token
 * missing from it is one no host can override.
 */
describe('the theming document', () => {
  const tokensIn = (path: string): string[] => {
    const css = read(path).replace(/\/\*[\s\S]*?\*\//g, '')
    return [
      ...new Set([...css.matchAll(/(--fsh?-[a-z0-9-]+)\s*:/g)].map((match) => match[1] ?? '')),
    ]
  }

  const spec = read('docs/spec/11-theming.md')

  it.each([
    ['the designer', 'packages/designer/src/designer.css'],
    ['the HTML kit', 'packages/kit-html/src/kit-html.css'],
  ])('documents every token %s defines', (_what, path) => {
    const tokens = tokensIn(path)

    expect(tokens.length, 'no tokens were found in ' + path).toBeGreaterThan(8)

    expect(tokens.filter((token) => !spec.includes(token)).sort()).toEqual([])
  })

  it('documents no token that has since been removed', () => {
    const defined = new Set([
      ...tokensIn('packages/designer/src/designer.css'),
      ...tokensIn('packages/kit-html/src/kit-html.css'),
    ])

    const mentioned = [
      ...new Set([...spec.matchAll(/`(--fsh?-[a-z0-9-]+)`/g)].map((m) => m[1] ?? '')),
    ]
    expect(mentioned.length).toBeGreaterThan(8)
    expect(mentioned.filter((token) => !defined.has(token)).sort()).toEqual([])
  })
})

describe('the accessibility document', () => {
  it('lists exactly the axe rules the suite disables', () => {
    const suite = read('test/a11y.test.tsx')
    const declared = [
      ...(/const NEEDS_LAYOUT = \[([^\]]*)\]/.exec(suite)?.[1] ?? '').matchAll(/'([\w-]+)'/g),
    ].map((match) => match[1] ?? '')

    expect(declared.length, 'the disabled-rule list was not found').toBeGreaterThan(0)

    const document = read('docs/accessibility.md')
    expect(declared.filter((rule) => !document.includes(rule))).toEqual([])
  })

  it('quotes the number of states axe actually audits', () => {
    /*
     * It said six while the suite ran seven, and nothing compared them: the one
     * document in the repository that exists so a reader does not have to take
     * "we care about accessibility" on trust was itself unchecked.
     *
     * Counted inside the `axe audit` describes, so a helper or an unrelated test
     * in the same file cannot inflate it.
     */
    const suite = read('test/a11y.test.tsx')
    const audits = suite
      .split(/\n(?=describe\b)/)
      .filter((block) => block.startsWith("describe('axe audit"))
    const states = audits.flatMap((block) => [...block.matchAll(/^\s+it\(/gm)]).length

    // Loose about the verb, which the documents word differently, and exact
    // about "<number> states", so a sentence about something else is not swept in.
    const SAYS_STATES = /(?:axe(?:-core)?[^.\n]*?) in (\w+) states\b/g

    const stated: { file: string; word: string }[] = []
    for (const file of ['README.md', ...markdownUnder('docs')]) {
      if (isDatedRecord(file)) continue
      for (const match of read(file).matchAll(SAYS_STATES)) {
        stated.push({ file, word: match[1] ?? '' })
      }
    }

    expect(
      stated.length,
      'no document states how many states axe audits, so this compared nothing',
    ).toBeGreaterThan(3)

    const words: Record<string, number> = {
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
    }

    const wrong = stated
      .filter((entry) => words[entry.word] !== states)
      .map((entry) => entry.file + ' says ' + entry.word)

    expect(wrong, 'the suite audits ' + String(states) + ' states').toEqual([])
  })

  it.each([
    ['test/contrast.test.ts'],
    ['packages/designer/src/panels/Tree.test.tsx'],
    ['packages/designer/src/keyboard.test.ts'],
    ['packages/designer/src/panels/Rules.test.tsx'],
    ['test/a11y.test.tsx'],
    ['e2e/keyboard.spec.ts'],
  ])('%s, which the table names as the enforcement, exists', (path) => {
    expect(() => read(path)).not.toThrow()
  })
})

/**
 * Reviews and reports state what was true on the day they were written, so a
 * figure in one is not corrected to match today. Link checking still applies.
 */
function isDatedRecord(file: string): boolean {
  return file.startsWith('docs/reviews/') || file.startsWith('docs/reports/')
}

function markdownUnder(directory: string): string[] {
  const found: string[] = []

  const walk = (relative: string): void => {
    for (const entry of readdirSync(fileURLToPath(new URL(relative, root)), {
      withFileTypes: true,
    })) {
      const path = relative + '/' + entry.name
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.md')) found.push(path)
    }
  }

  walk(directory)
  return found.sort()
}

describe('documentation links', () => {
  const files = [
    'README.md',
    'CLAUDE.md',
    'docs/ROADMAP.md',
    'docs/ARCHITECTURE.md',
    'docs/accessibility.md',
    'docs/prior-art/README.md',
    'docs/ideas.md',
    '.claude/skills/write-tests/SKILL.md',
  ]

  it.each(files)('%s links only to files and headings that exist', (file) => {
    const text = read(file)
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
    const broken: string[] = []

    for (const match of text.matchAll(
      /\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)([^)\s]+)(?:\s+"[^"]*")?\)/g,
    )) {
      const target = (match[1] ?? '').trim()
      const [file_, anchor] = target.split('#')

      // A bare "#anchor" points inside this same document.
      let body = text
      if (file_) {
        const path = file_.startsWith('docs/') || base === '' ? file_ : base + file_
        try {
          body = read(path)
        } catch {
          broken.push(target + ' (no such file)')
          continue
        }
      }
      if (anchor && !headings(body).includes(anchor)) broken.push(target + ' (no such heading)')
    }

    expect(broken).toEqual([])
  })
})

/**
 * Not `sourceFiles`, which drops tests: a pointer at a test file has to see
 * every file.
 */
function everyFile(dir = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(fileURLToPath(new URL(dir || '.', root)), {
    withFileTypes: true,
  })) {
    const path = dir + entry.name
    if (entry.isDirectory()) {
      // `tmp` is git-ignored scratch space.
      if (['node_modules', 'dist', '.git', 'coverage', 'test-results', 'tmp'].includes(entry.name))
        continue
      found.push(...everyFile(path + '/'))
      continue
    }

    // A guardrail fixture can vanish mid-walk: vitest runs test files in parallel.
    if (isFixture(entry.name)) continue

    found.push(path)
  }
  return found
}

describe('a pointer at a test file', () => {
  it('names one that exists', () => {
    /*
     * Code only: markdown may name test files that do not exist, such as the
     * write-tests skill's examples and the tests a review asks for. Matched by
     * basename, so moving a test between packages does not fail this.
     */
    const files = everyFile()
    const tests = new Set(
      files.filter((file) => /\.test\.tsx?$/.test(file)).map((file) => file.split('/').pop()),
    )

    expect(tests.size, 'no test files were found, so this compared nothing').toBeGreaterThan(20)

    const code = files.filter((file) => /\.(?:tsx?|css|mjs)$/.test(file))
    expect(code.length, 'no code was read, so this compared nothing').toBeGreaterThan(50)

    const dead: string[] = []
    for (const file of code) {
      for (const match of read(file).matchAll(/[A-Za-z0-9_][A-Za-z0-9_.-]*\.test\.tsx?\b/g)) {
        if (!tests.has(match[0])) dead.push(file + ' points at ' + match[0])
      }
    }

    expect(dead, 'a comment sends a reader to a file that is not there').toEqual([])
  })
})

function sourceFiles(): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(fileURLToPath(new URL(dir, root)), { withFileTypes: true })) {
      const path = dir + entry.name
      if (entry.isDirectory()) {
        walk(path + '/')
        continue
      }
      // Tests are not the product. A fixture may mention a field the product
      // never touches, which is exactly what a "nothing reads it" claim means.
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue

      // Guardrail fixtures are skipped by name rather than by catching the
      // `ENOENT` of one that vanished mid-walk: the race is avoided, not swallowed.
      if (isFixture(entry.name)) continue

      found.push({ path, text: read(path) })
    }
  }

  for (const pkg of ['core', 'renderer', 'designer', 'kit-mui', 'kit-html']) {
    walk('packages/' + pkg + '/src/')
  }
  return found
}

function mentions(needle: string): string[] {
  return sourceFiles()
    .filter((file) => file.text.includes(needle))
    .map((file) => file.path)
}

describe('the component catalogue and the kits agree', () => {
  const catalogue = read('docs/spec/03-components.md')

  const typesIn = (kit: string): string[] =>
    [...read('packages/' + kit + '/src/definitions.ts').matchAll(/^ {6}type: '(\w+)',$/gm)]
      .map((match) => match[1] ?? '')
      .sort()

  const rows = [...catalogue.matchAll(/^\| `(\w+)`\s*\| (Built|Planned)\s*\|/gm)].map((match) => ({
    name: match[1] ?? '',
    status: match[2] ?? '',
  }))

  it('lists exactly the components both kits implement', () => {
    const built = rows
      .filter((row) => row.status === 'Built')
      .map((row) => row.name)
      .sort()

    expect(built.length, 'no Built rows were parsed out of the catalogue').toBeGreaterThan(0)
    expect(typesIn('kit-mui').length, 'no types were parsed out of kit-mui').toBeGreaterThan(0)

    // "Built means both kits implement it and the contract test passes", which
    // makes this the same sentence, executed.
    expect(built).toEqual(typesIn('kit-mui'))
    expect(built).toEqual(typesIn('kit-html'))
  })

  it('states a built count that matches the table', () => {
    const claim = /(\d+) of the (\d+) below are built/.exec(catalogue)
    expect(claim, 'the preamble no longer states a built count in digits').toBeTruthy()

    expect(Number(claim?.[1])).toBe(rows.filter((row) => row.status === 'Built').length)
    expect(Number(claim?.[2])).toBe(rows.length)
  })

  it('states a total that matches the table', () => {
    const total = /(\d+) components\. \*\*Built\*\* means/.exec(catalogue)
    expect(total, 'the catalogue no longer states its size in digits').toBeTruthy()
    expect(Number(total?.[1])).toBe(rows.length)
  })
})

describe('the roadmap does not deny a component that exists', () => {
  it.each(['kit-mui', 'kit-html'])('%s implements nothing the roadmap calls missing', (kit) => {
    const declared = new Set(
      [...read('packages/' + kit + '/src/definitions.ts').matchAll(/^ {6}type: '(\w+)',$/gm)].map(
        (match) => match[1],
      ),
    )

    const denied = [...read('docs/ROADMAP.md').matchAll(/No `?([A-Z]\w+)`? component/g)].map(
      (match) => match[1] ?? '',
    )

    expect(denied.filter((type) => declared.has(type))).toEqual([])
  })
})

describe('a section that calls itself planned is still planned', () => {
  /*
   * Keyed by each `Status: planned` heading or `**Planned:**` paragraph; the
   * needle is a string whose presence in the product disproves the claim. `null`
   * means there is nothing to look for yet, and `because` must say why.
   */
  const DISPROOF: Record<string, { needle: string | null; because: string }> = {}

  function claims(): string[] {
    const found: string[] = []
    for (const file of readdirSync(fileURLToPath(new URL('docs/spec/', root)))) {
      if (!file.endsWith('.md')) continue
      const text = read('docs/spec/' + file)

      for (const match of text.matchAll(/\*\*Status: planned\.?\*\*|\*\*Planned:\*\*([^\n]*)/g)) {
        const before = text.slice(0, match.index ?? 0)
        const heading = [...before.matchAll(/^#{2,3} +(.+?)\s*$/gm)].at(-1)?.[1]
        found.push(
          match[0].startsWith('**Planned:**')
            ? file + ': ' + summarise(match[1] ?? '')
            : file + ': ' + (heading ?? 'the whole file'),
        )
      }
    }
    return found
  }

  function summarise(rest: string): string {
    const words = rest.trim().replace(/[`*]/g, '').split(/\s+/)
    if (words.join(' ').startsWith('a language selector')) return 'a language selector'
    if (words.join(' ').startsWith('a way to try an expression')) return 'try an expression'
    if (words.join(' ').startsWith('they should be')) return 'message as a PropValue'
    return words.slice(0, 4).join(' ')
  }

  it('has an entry for every planned claim, and no entry without one', () => {
    expect([...claims()].sort()).toEqual(Object.keys(DISPROOF).sort())
  })

  it.each(Object.entries(DISPROOF))('%s is not disproved by the source', (name, entry) => {
    expect(entry.because.length, name + ' gives no reason').toBeGreaterThan(20)

    const found = entry.needle === null ? [] : mentions(entry.needle)
    expect(found, name + ' says planned, but ' + entry.because).toEqual([])
  })
})

describe('the server parity section and the server it cites', () => {
  let cached: Set<string> | undefined
  const imported = (): Set<string> => {
    if (cached) return cached
    const source = read('apps/demo-server/src/index.ts')
    const names = new Set<string>()
    for (const block of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@willowforms\/core'/g)) {
      for (const name of (block[1] ?? '').split(',')) {
        const trimmed = name.replace(/^type\s+/, '').trim()
        if (trimmed) names.add(trimmed)
      }
    }
    cached = names
    return names
  }

  const parity = (): string => {
    const text = read('docs/spec/08-validation.md')
    const from = text.indexOf('## Server parity')
    expect(from, 'the Server parity section is gone or renamed').toBeGreaterThan(-1)
    const next = text.indexOf('\n## ', from + 1)
    return text.slice(from, next === -1 ? text.length : next)
  }

  it('reads the demo server import block at all', () => {
    const names = imported()

    expect(names.size).toBeGreaterThan(3)
    expect([...names]).toContain('validateDocument')
  })

  const PER_SCOPE = ['validateAcross', 'submittedAcross', 'contextValues', 'missingContext']

  it('names the functions the reference server actually calls', () => {
    const section = parity()
    const names = imported()
    const missing = PER_SCOPE.filter((name) => names.has(name)).filter(
      (name) => !section.includes(name),
    )

    expect(missing, 'the parity section does not mention these, and the server calls them').toEqual(
      [],
    )
  })

  it('does not name one the reference server has stopped calling', () => {
    const section = parity()
    const names = imported()
    const stale = PER_SCOPE.filter((name) => section.includes(name)).filter(
      (name) => !names.has(name),
    )

    expect(stale, 'the parity section teaches these and the server no longer imports them').toEqual(
      [],
    )
  })

  it('does not offer a function the reference server does not import', () => {
    // `validateForm` is correct for a single-scope form, so the section may
    // teach it, but only beside the per-scope functions.
    const section = parity()
    const teachesSingleScope = section.includes('validateForm')
    const teachesPerScope = section.includes('validateAcross')

    expect(
      teachesSingleScope && !teachesPerScope,
      'the section teaches validateForm as the parity example while the server it cites validates per scope',
    ).toBe(false)
  })
})
