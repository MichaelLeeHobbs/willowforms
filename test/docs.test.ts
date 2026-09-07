/** Documentation contracts that can be checked without interpreting prose. */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isFixture } from './fixtures.js'

const root = new URL('../', import.meta.url)
const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, root)), 'utf8')

/*
 * A link that names any scheme, or a network path, is somebody else's. The
 * check used to exclude only http and https, so a `mailto:` or `tel:` link
 * would have been chased as a relative file path and reported broken. None
 * exists yet, which is exactly when a rule like this is cheap to get right.
 */

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
 * What the kit contract claims the suite enforces, against the suite.
 *
 * `02-kit-contract.md` listed five accessibility obligations and said which of
 * them a test executed. Both halves were wrong: it said no test checks
 * `aria-invalid` and one does, against every kit, and it omitted `aria-required`
 * entirely, which is also checked. Understating enforcement is the dangerous
 * direction -- a kit author budgets against the document and meets a red build.
 *
 * The claim is a column now, and this is what reads it. Both directions, because
 * a check that only confirms the `yes` rows would let the document go on
 * claiming something is unchecked while a test quietly enforces it, which is the
 * half that was wrong.
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
    // The control. A table this could not parse would make every row below pass
    // over nothing, which is the shape the rule-count guard above already had.
    const found = rows()
    expect(found.length, 'the obligations table could not be read').toBeGreaterThan(4)
    expect(found.filter((row) => row.enforced === 'yes').length).toBeGreaterThan(2)
    expect(found.filter((row) => row.enforced === 'no').length).toBeGreaterThan(0)
  })

  it('claims enforcement only where the contract suite enforces it', () => {
    const suite = read('test/kit-contract.test.tsx')
    const wrong: string[] = []

    for (const row of rows()) {
      // A row with no attribute is an obligation no attribute expresses -- a
      // label pointing at its control, a focus indicator surviving -- and both
      // are marked `no` for the honest reason that they need a browser.
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
    // A package nobody can find in the README may as well not be published.
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
    // A contract nobody can find from the index may as well not be written.
    expect(index).toContain('(' + name + ')')
  })

  /**
   * The field names an `interface` block declares, comments and types dropped.
   *
   * Brace-matched from the opening line rather than read to the first `}`,
   * because a field can be a function type or an object literal and take a
   * brace with it. `defaultRenderWhen` is one, which is the field this was
   * written to catch.
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
    /*
     * `12-api.md` is the contract a consumer reads, and it published
     * `RESERVED_KEYS` as three names where the export has thirteen, with no
     * length bound mentioned at all.
     *
     * The ten missing names are not incidental. The list's own docblock records
     * a required field keyed `toString` having its error merged with
     * `merged[key] ??= message`, compared against `Object.prototype.toString`,
     * found not nullish and dropped -- a form with a missing required answer
     * submitting clean. A consumer generating documents checks against what the
     * contract publishes, emits `toString` as a `dataKey`, and is refused by
     * `validateDocument` with nothing in the specification to explain it.
     *
     * Read out of the fenced block rather than out of the prose around it, and
     * compared as sets: this is the block a reader copies.
     */
    const keys = read('packages/core/src/keys.ts')
    const spec = read('docs/spec/12-api.md')

    /*
     * From the end of the line that opens the array to the `]` that closes it.
     *
     * Not from the first `[` after the name: the export is typed
     * `readonly string[]`, so that bracket belongs to the type, and reading from
     * it produced an empty list. It failed loudly only because the other side
     * was full, which is luck rather than design -- hence the emptiness check on
     * both sides below.
     */
    const namesIn = (text: string): string[] => {
      const at = text.search(/^.*RESERVED_KEYS[^\n]*\[\s*$/m)
      expect(at, 'no RESERVED_KEYS array to read').toBeGreaterThan(-1)

      const from = text.indexOf('\n', at)

      /*
       * The bracket that closes a multi-line array is the first one standing at
       * the start of a line. Plain `indexOf(']')` finds the next bracket
       * anywhere -- including one belonging to something else further down the
       * file, which is what made deleting this array's own `]` invisible to an
       * earlier version of this check.
       */
      const found = /^\s*\]/m.exec(text.slice(from))
      const close = found ? from + found.index : -1

      /*
       * A missing `]` is a broken read, not an empty list.
       *
       * `indexOf` answers -1, and `slice(from, -1)` is the rest of the file
       * short one character -- so this would have returned every quoted string
       * below the array and reported a difference that is not there, or, worse,
       * matched by accident. A guard that cannot find what it is reading has to
       * say so.
       */
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

    /*
     * And the two figures beside it. `MAX_KEY_LENGTH` was in neither the block
     * nor the prose, so a host importing generated documents met `invalid-key`
     * on a name satisfying every rule the contract stated.
     */
    /*
     * Read both sides first, then check each is there, then compare.
     *
     * `exec(...)?.[1]` is `undefined` when the pattern stops matching, and
     * `undefined === undefined` passes -- so a whitespace change in either file
     * would have turned both of these into assertions that compare nothing and
     * report success. That is the failure this whole test exists to prevent,
     * one level up.
     */
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
    /*
     * A code block in the specification is read as the thing itself.
     *
     * `ComponentDef` omitted `root` and `defaultRenderWhen`. Both are
     * load-bearing: `02-kit-contract.md` makes "exactly one component is the
     * root, and it is not in the palette" a rule the contract suite enforces,
     * and this block gave a kit author no field to declare one with -- so a
     * third-party kit written against the specification failed a rule whose
     * mechanism appeared nowhere. `ComponentNode` omitted `dataKey`, which the
     * same file documents as Built eleven lines further down.
     *
     * Names only, not types. A block that renamed `icon`'s type to something
     * shorter for a reader is fine; a block missing a field is not, and the
     * missing field is the failure both of these were.
     */
    expect(fieldsOf(read('docs/spec/' + file), name)).toEqual(fieldsOf(read(source), name))
  })

  it.each(files)('%s opens with the status the index gives it', (name) => {
    /*
     * The index and the file, in both directions.
     *
     * `README.md` states the rule -- a file's status "has to match what the
     * file itself opens with" -- and nothing held anything to it. The index
     * gave `03-components.md` **Partial** while that file opened **Built** over
     * two `### Still to build` lists, and the index went further and named `03`
     * among the files that "read Partial ... and each of those files says which
     * one in its own preamble", which 03's preamble did not.
     *
     * The direction matters. A reader scanning the index is asking the
     * pessimistic question and gets Partial; the file, which is the copy that
     * gets edited as work lands, is the one that overstates. So the check is an
     * equality rather than a "no worse than".
     *
     * `00-product.md` is exempt in both places at once: the index gives it a
     * dash and the file says it carries no status, for the same reason.
     */
    if (name === '00-product.md') return

    const text = read('docs/spec/' + name)
    const end = text.indexOf('\n## ')
    const preamble = end === -1 ? text : text.slice(0, end)
    const opens = /\*\*Status: (built|partial|planned|undecided)/i.exec(preamble)

    expect(opens, name + ' has no status before its first section').toBeTruthy()

    /*
     * The row for this file in the index table, read by the link rather than by
     * position: the table has a Covers column full of prose, and a column index
     * would move the first time somebody adds one.
     */
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
    /*
     * The status is what makes this document also the roadmap. A section with
     * none is a claim with no accountability. 00-product is a statement of
     * intent with no code to match, so it deliberately carries none.
     *
     * Only the preamble counts, meaning everything before the first H2. The
     * regex used to run against the whole file, so a status buried in the last
     * section satisfied a test named "opens with a status".
     */
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

  /*
   * Cross-references between spec files went unchecked: only the index's links
   * were, and only those naming a numbered file. Twelve files pointing at each
   * other's headings could all rot without a test noticing.
   */
  it.each([...files, 'README.md'])('%s links only to files and headings that exist', (name) => {
    /*
     * The index included, which it was not. It is the file with the most links
     * in it and the one every reader starts from, and it was excluded from the
     * only check that follows a link anywhere -- its own check reads the link
     * text and ignores anchors entirely.
     */
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

/** How many obligations the kit contract states. See the assertion that uses it. */
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

/**
 * The describes that are about this repository rather than about a kit.
 *
 * `the two kits in this repository agree` is a courtesy these two keep, not a
 * contract; `a default copied between kits` is the same. Neither belongs in a
 * document a third-party kit author reads as their obligations.
 */
const NOT_OBLIGATIONS = ['the two kits in this repository agree', 'a default copied between kits']

describe('the kit contract table', () => {
  it('has one row for every rule the contract suite runs', () => {
    /*
     * The table said twelve while the suite ran thirteen. Nothing compared the
     * two, so the missing rule was invisible to anyone deciding what their own
     * kit had to satisfy.
     */
    const spec = read('docs/spec/02-kit-contract.md')
    /*
     * The rule table, and only it. This sliced to the end of the file and
     * counted every row of every table after it -- so adding the accessibility
     * obligations table below made the count 28 against 21, for a reason that
     * had nothing to do with the rules. A guard that reads "everything after a
     * marker" is a guard that changes meaning when somebody writes prose.
     */
    const fromRules = spec.slice(spec.indexOf('| Rule'))
    const afterTable = fromRules.search(/\n[ \t]*\n/)
    const table = afterTable === -1 ? fromRules : fromRules.slice(0, afterTable)
    /*
     * Any first character, not a capital letter. A row beginning with a
     * backtick -- `nodeProps`, which is how half the obligations in this table
     * would naturally be written -- was silently uncounted, so adding one made
     * the two numbers disagree for a reason nobody would guess from the message.
     * The separator row is dropped by matching the dashes rather than by
     * subtracting one.
     */
    const rows = [...table.matchAll(/^\|(?! *-)[^|\n]+\|/gm)].length - 1

    /*
     * Only the rules, meaning the tests inside the per-kit block. The file also
     * holds checks that are not obligations on a kit at all, such as the two
     * kits in this repository agreeing with each other, and counting those
     * would demand rows for rules that do not exist.
     */
    const suite = read('test/kit-contract.test.tsx')
    /*
     * From the per-kit block to the next top-level `describe`, not to the end of
     * the file. Everything written after that block was counted too -- the
     * "a default copied between kits" case is about these two kits agreeing with
     * each other, not an obligation any third-party kit has -- so the table
     * needed a row for a rule that does not exist. The counts matched today by
     * the coincidence of such a row having been added.
     */
    const fromKits = suite.slice(suite.indexOf('describe.each(KITS)'))
    const nextBlock = fromKits.indexOf('\ndescribe(')
    const rules = nextBlock === -1 ? fromKits : fromKits.slice(0, nextBlock)
    const cases = [...rules.matchAll(/^\s+it(?:\.each)?\(/gm)].length

    expect(rows, 'the rule table and the contract suite disagree').toBe(cases)
    expect(rows, 'a contract rule was added or removed; say so here as well').toBe(CONTRACT_RULES)
  })

  it('has a second row for every rule driven per kit outside that block', () => {
    /*
     * The other half, and the half nothing checked. `it.each(KITS)` outside the
     * per-kit block is a rule that runs against every registered kit and fails
     * it by name -- the same consequence as a row in the first table, and until
     * now none of them was written down.
     */
    const suite = read('test/kit-contract.test.tsx')

    // Everything but the describes that are about these two kits rather than
    // about kits, so a courtesy is not read as an obligation.
    /*
     * The whole file with the per-kit block cut out, not just what precedes it.
     *
     * This sliced to the start of that block, so a per-kit rule written *after*
     * it was counted by nothing -- and one was, the day this guard was added.
     * A guard that reads "everything before a marker" has the same weakness as
     * one that reads "everything after" it.
     */
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

    /*
     * And both against a number stated here, because the comparison above is
     * two integers and nothing else. Deleting a test *and* an unrelated table
     * row leaves them equal to each other while the table documents a rule
     * nothing runs — which is the Trap 7 condition this guard exists to prevent,
     * reached through the guard itself.
     *
     * One number to maintain rather than thirty-eight strings, and adding a rule
     * is meant to be a deliberate act in three places: the spec, the suite, and
     * here.
     */
  })
})

/**
 * The events table in `03-components.md`, against what the kits declare.
 *
 * Its own preamble says the right-hand column is what the kits declare today,
 * and both of its concrete claims were wrong: `onFocus` was said to be missing
 * from every input but `TextField` while `TextArea` declares it, and
 * `DatePicker`'s `onBlur` was not listed at all. Whoever eventually builds the
 * Actions tab reads this table as the inventory of what needs settling.
 */
describe('the events table', () => {
  /** Every component type in a kit definitions file, with the events it declares. */
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
    // The control for everything below: a reader that matched nothing would
    // make every comparison a comparison of two empty maps.
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
 * The theming document, against the tokens the stylesheets define.
 *
 * `11-theming.md` says a host restyles by overriding tokens rather than
 * fighting specificity, and it is the only place the names are written down --
 * so a token missing from it is a token nobody can override. Four were:
 * `--fs-control-border`, and the kit's `--fsh-success`, `--fsh-warning` and
 * `--fsh-shadow`.
 */
describe('the theming document', () => {
  /** Every custom property a stylesheet declares. */
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

    // The control: a reader that found nothing would document nothing and pass.
    expect(tokens.length, 'no tokens were found in ' + path).toBeGreaterThan(8)

    expect(tokens.filter((token) => !spec.includes(token)).sort()).toEqual([])
  })

  it('documents no token that has since been removed', () => {
    /*
     * The other direction, and the one a reader meets: a name in this table
     * that no stylesheet defines is an override that silently does nothing.
     */
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
    /*
     * `NEEDS_LAYOUT` in `a11y.test.tsx` names the rules turned off because
     * jsdom has no layout engine, and `docs/accessibility.md` lists the same
     * three for a reader deciding how much the audit is worth. Nothing compared
     * them, so disabling a fourth rule would have gone unmentioned in the one
     * document that says what is checked.
     */
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
     * Counted inside the axe describe, so a helper or an unrelated test in the
     * same file cannot inflate it.
     */
    const suite = read('test/a11y.test.tsx')
    const audits = suite.slice(suite.indexOf("describe('axe audit of the designer'"))
    const states = [...audits.matchAll(/^\s+it\(/gm)].length

    /*
     * Every document that states the figure, found rather than listed.
     *
     * Three were compared by name and two more said it in prose that no check
     * read -- `docs/ROADMAP.md` and `docs/spec/00-product.md`. A list of the
     * documents that happen to mention a number is the same shape as the
     * hand-written file list this suite already replaced once: it covers what
     * somebody remembered.
     *
     * The pattern is deliberately loose about the verb, because the five sites
     * word it four different ways, and exact about the shape "<number> states"
     * so a sentence about something else cannot be swept in.
     */
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
    // A table of guarantees pointing at a file nobody has is worse than no
    // table: it reads as enforcement and is prose.
    expect(() => read(path)).not.toThrow()
  })
})

/**
 * Whether a document is a dated record rather than live documentation.
 *
 * A review states what was true on the day it was written, and a report states
 * what a run did. Correcting a figure in one to match today would falsify the
 * record -- the deep review really did say eleven, because the suite really did
 * report eleven before the count that produced it was fixed.
 *
 * The same boundary `.prettierignore` draws for `docs/reviews`, and for the same
 * reason it gives: these are artefacts, not repo prose. `docs/reports` is
 * included here because it is the same kind of thing, which the ignore file did
 * not say.
 *
 * Link checking still applies to all of them: a dead link is wrong whenever it
 * was written.
 */
function isDatedRecord(file: string): boolean {
  return file.startsWith('docs/reviews/') || file.startsWith('docs/reports/')
}

/** Every markdown file under a directory, repository-relative, sorted. */
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

  /*
   * Anchors included. This used to exclude any link containing a `#`, so every
   * link that named a heading was unchecked, which is the half most likely to
   * rot: a heading gets reworded and the link still resolves to a file.
   */
  it.each(files)('%s links only to files and headings that exist', (file) => {
    const text = read(file)
    const base = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
    const broken: string[] = []

    /*
     * `](target)` and `](target "title")` both. The pattern refused anything
     * with a space in it, so a link carrying a title was skipped in silence --
     * and a check that quietly declines to look is worse than no check, because
     * the file reads as covered.
     */
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
 * Every file in the repository, repository-relative, skipping what is generated.
 *
 * `sourceFiles` below is deliberately narrower -- it answers "does the product
 * do this", so it drops tests and fixtures. A pointer at a test file is a
 * different question and has to see all of them.
 */
function everyFile(dir = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(fileURLToPath(new URL(dir || '.', root)), {
    withFileTypes: true,
  })) {
    const path = dir + entry.name
    if (entry.isDirectory()) {
      // `tmp` is in `.gitignore` and holds a copy of a review, which an earlier
      // draft of this read and then failed on.
      if (['node_modules', 'dist', '.git', 'coverage', 'test-results', 'tmp'].includes(entry.name))
        continue
      found.push(...everyFile(path + '/'))
      continue
    }

    /*
     * Not the guardrail fixtures. `eslint.config.test.ts` writes those into
     * `packages/core/src` and `packages/designer/src`, lints them and deletes
     * them, and vitest runs test files in parallel -- so this walk could list
     * one and then find it gone before `read` opens it, failing with an
     * `ENOENT` on a run where nothing changed. `sourceFiles` skips them for the
     * same reason and says so at more length.
     */
    if (isFixture(entry.name)) continue

    found.push(path)
  }
  return found
}

describe('a pointer at a test file', () => {
  it('names one that exists', () => {
    /*
     * A comment in `Canvas.tsx` sent a reader to a `Canvas.data` variant for
     * the assertion behind a rule axe cannot check without a layout engine.
     * There is no such file; the assertion is in `Canvas.test.tsx`. The comment
     * was true when it was written and a rename made it a dead end, which is
     * the only kind of stale comment that costs real time: the reader goes
     * looking, finds nothing, and cannot tell whether the check was moved or
     * deleted.
     *
     * Comments are not compiled and nothing else in this repository reads them,
     * so the pointer decays silently.
     *
     * Code only, and this is the line worth being exact about. Markdown names
     * test files it does not have: the write-tests skill teaches with an
     * invented `thing`, and `docs/reviews` asks for tests that were never
     * written, which is what a review is for. Both are correct prose and
     * neither is a broken pointer. A comment beside the code is a different
     * promise -- it says "the check is over there" about a repository the
     * reader is already standing in.
     *
     * Matched by basename, so moving a test between packages does not fail
     * this. A pointer at a directory or a symbol is a wider problem and this
     * does not pretend to solve it.
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

/*
 * Everything below is one kind of drift: the specification saying a thing does
 * not exist while the repository holds it. That is the direction that matters.
 * A document overstating what is built is caught by anybody who tries the
 * feature; a document understating it is read as a to-do list, and the work
 * gets scheduled twice.
 *
 * Every one of these guards was written against a drift that was live in this
 * repository on 2026-08-30, and each was watched failing before the prose was
 * corrected.
 */

/** The source a claim about "nothing does this" is checked against. */
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

      /*
       * And not the guardrail fixtures either. `eslint.config.test.ts` writes
       * those into `packages/core/src` and `packages/designer/src`, lints them
       * and deletes them, and vitest runs test files in parallel -- so this walk
       * could list one and then find it gone before reading it, and every
       * DISPROOF case below would fail on a run where nothing changed.
       *
       * Skipped by the name they share with the file that writes them, rather
       * than by catching the `ENOENT`: a file that vanishes mid-walk is a race
       * worth not having, not an error worth swallowing.
       */
      if (isFixture(entry.name)) continue

      found.push({ path, text: read(path) })
    }
  }

  for (const pkg of ['core', 'renderer', 'designer', 'kit-mui', 'kit-html']) {
    walk('packages/' + pkg + '/src/')
  }
  return found
}

/** Where a string appears in the product, if anywhere. */
function mentions(needle: string): string[] {
  return sourceFiles()
    .filter((file) => file.text.includes(needle))
    .map((file) => file.path)
}

describe('the component catalogue and the kits agree', () => {
  /*
   * The catalogue's preamble carried "Eight of the twenty-six below are built"
   * long after all twenty-seven were, because the number is prose and the table
   * beneath it is where the work actually lands. Both are now read from the
   * kits, which are the thing the sentence is about.
   */
  const catalogue = read('docs/spec/03-components.md')

  /** Component types a kit declares, read out of its definitions. */
  const typesIn = (kit: string): string[] =>
    [...read('packages/' + kit + '/src/definitions.ts').matchAll(/^ {6}type: '(\w+)',$/gm)]
      .map((match) => match[1] ?? '')
      .sort()

  /** Every row of the catalogue tables, as name and status. */
  const rows = [...catalogue.matchAll(/^\| `(\w+)`\s*\| (Built|Planned)\s*\|/gm)].map((match) => ({
    name: match[1] ?? '',
    status: match[2] ?? '',
  }))

  it('lists exactly the components both kits implement', () => {
    const built = rows
      .filter((row) => row.status === 'Built')
      .map((row) => row.name)
      .sort()

    /*
     * Both sides come out of a regex over a file this test does not control the
     * formatting of. A regex that stopped matching would leave both lists empty
     * and the comparison would pass, having read nothing.
     */
    expect(built.length, 'no Built rows were parsed out of the catalogue').toBeGreaterThan(0)
    expect(typesIn('kit-mui').length, 'no types were parsed out of kit-mui').toBeGreaterThan(0)

    // "Built means both kits implement it and the contract test passes", which
    // makes this the same sentence, executed.
    expect(built).toEqual(typesIn('kit-mui'))
    expect(built).toEqual(typesIn('kit-html'))
  })

  it('states a built count that matches the table', () => {
    /*
     * Digits, not words. The count is a guarded number like the test totals
     * above, and "twenty-six" is a number no regex should have to read.
     */
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
  /*
   * "**Steps.** _Decided, and the core is built._ No Step component" sat in the
   * roadmap after `Step` shipped in both kits. The roadmap is the first thing
   * anybody reads to decide what to work on, so a stale absence there is a
   * feature built twice.
   */
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
   * The general shape of the two drifts above. A `Status: planned` heading, or
   * a `**Planned:**` paragraph, is a claim that something is absent — and
   * nothing re-reads it once the thing arrives. `ComponentNode.css` was called
   * planned with "nothing writes it and nothing reads it" while the Style tab
   * wrote it and `styleSheetFor` read it; a language selector was called
   * planned while the toolbar drew one.
   *
   * So each claim names a string whose presence in the product disproves it.
   * The table is keyed by the claim, and a claim with no entry fails, which is
   * what stops the table going stale as sections are added.
   *
   * `null` means there is nothing to look for yet, and it has to say why. That
   * is an honest answer for a feature with no named surface — it is not an
   * excuse, because the next guard rejects a `null` with no reason.
   */
  const DISPROOF: Record<string, { needle: string | null; because: string }> = {}

  /** Every planned claim in the specification, named the way the table names it. */
  function claims(): string[] {
    const found: string[] = []
    for (const file of readdirSync(fileURLToPath(new URL('docs/spec/', root)))) {
      if (!file.endsWith('.md')) continue
      const text = read('docs/spec/' + file)

      /*
       * A `Status: planned` marker belongs to the heading above it; a
       * `**Planned:**` paragraph is named by its own first few words. Both are
       * claims of absence and both are checked.
       */
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

  /** A `**Planned:**` paragraph, shortened to the phrase the table keys on. */
  function summarise(rest: string): string {
    const words = rest.trim().replace(/[`*]/g, '').split(/\s+/)
    if (words.join(' ').startsWith('a language selector')) return 'a language selector'
    if (words.join(' ').startsWith('a way to try an expression')) return 'try an expression'
    if (words.join(' ').startsWith('they should be')) return 'message as a PropValue'
    return words.slice(0, 4).join(' ')
  }

  it('has an entry for every planned claim, and no entry without one', () => {
    // Both directions. An unlisted claim goes unchecked; a listed one that no
    // longer exists is a guard nobody is maintaining.
    expect([...claims()].sort()).toEqual(Object.keys(DISPROOF).sort())
  })

  it.each(Object.entries(DISPROOF))('%s is not disproved by the source', (name, entry) => {
    /*
     * `null` means there is nothing to look for, which is a decision and not a
     * shrug — so the reason is checked for every entry, not only those ones.
     */
    expect(entry.because.length, name + ' gives no reason').toBeGreaterThan(20)

    const found = entry.needle === null ? [] : mentions(entry.needle)
    expect(found, name + ' says planned, but ' + entry.because).toEqual([])
  })
})

/**
 * The parity contract against the server it points at.
 *
 * `08-validation.md`'s "Server parity" section is marked built and said the
 * demo server's "only purpose is to prove that `validateForm` is the same
 * function in both places". The demo server does not import `validateForm`. It
 * uses `validateAcross` and `submittedAcross`, once per step scope, and a host
 * copying the documented snippet onto a wizard document got `{}` back for a
 * submission missing every required answer -- every `Step` is hidden by a
 * context the snippet never builds.
 *
 * Checked against the import block rather than against a hand-kept list,
 * because a hand-kept list is what drifted. The section is the reference a
 * server implementer reads, and the reference server is the thing it describes,
 * so if they stop naming the same functions one of the two is wrong.
 */
describe('the server parity section and the server it cites', () => {
  /** Everything the demo server imports from core, from the import block. */
  /*
   * Parsed once per describe rather than per call. Four assertions each
   * re-reading and re-scanning the same file is work with one answer, and the
   * answer cannot change inside a run.
   */
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

  /** The "Server parity" section of the validation contract, on its own. */
  const parity = (): string => {
    const text = read('docs/spec/08-validation.md')
    const from = text.indexOf('## Server parity')
    expect(from, 'the Server parity section is gone or renamed').toBeGreaterThan(-1)
    const next = text.indexOf('\n## ', from + 1)
    return text.slice(from, next === -1 ? text.length : next)
  }

  it('reads the demo server import block at all', () => {
    // The control. An empty set would satisfy every assertion below by having
    // nothing to disagree with -- the same vacuous green this run keeps finding.
    const names = imported()

    expect(names.size).toBeGreaterThan(3)
    expect([...names]).toContain('validateDocument')
  })

  /*
   * The per-scope half of the contract, named once. Both directions below are
   * about these four.
   */
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
    /*
     * The other direction, which the check above does not cover.
     *
     * It asserts only that an imported name is mentioned, so the spec could get
     * *ahead* of the server -- keep teaching `validateAcross` after the route
     * stopped calling it -- and nothing would fail. That is the same drift this
     * whole item is about, pointing the other way: the section claimed
     * `validateForm` was what the server used long after it was not.
     *
     * Raised in review on PR #37.
     */
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
    /*
     * The direction that actually bit. `validateForm` is a real export and a
     * correct call for a single-scope form, so the section may still teach it
     * -- but it may not do so while claiming the demo server is the proof, and
     * the wizard half has to be there beside it.
     */
    const section = parity()
    const teachesSingleScope = section.includes('validateForm')
    const teachesPerScope = section.includes('validateAcross')

    /*
     * Stated as one unconditional expectation rather than as an `if` around an
     * `expect`. `vitest/no-conditional-expect` refuses that shape and is right
     * to: a guarded assertion passes having asserted nothing the moment the
     * guard stops holding, which is this run's whole subject.
     */
    expect(
      teachesSingleScope && !teachesPerScope,
      'the section teaches validateForm as the parity example while the server it cites validates per scope',
    ).toBe(false)
  })
})
