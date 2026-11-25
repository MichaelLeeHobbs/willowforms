# Pattern census

No check failed. The user confirmed the pattern list after the run, not at the gate, and changed nothing in it, so the numbers are unchanged. The spending cap was approved through the session that launched this one.

```
Pattern census: willowforms (whole repo, scope .)  commit 8e92d4cdbf476b77b614611d869ec24e35919337  2026-11-25  definitions e66b4a14fa6c519206fc1ed52441c45ce9b4c47d61ca60c746fde7b4a573e0f2
Catalog: .claude/clean-code/pattern-census/   Work folder: session scratch folder, outside the repo
Jobs: 5 (docload, evalcode, kitprops, log, safeurl; 1 closed, 4 partial)   Patterns: confirmed
Scanner cases: 11 of 11 (all 12 expected sites)   PASS
Sites: 257 (17 same_as, 9 inside conduits)   Blocked: 0   Opaque: 132
Off-pattern families: 2
Audit: 206 sampled, 0 scanner errors upheld   PASS
Escape sample: 174 files read over 2 rounds, 3 escapes   PASS
Canaries: 5 of 5 behaved as planted   PASS
Known sites: none given
Spend: $16.68 of $20.00 cap (estimated from tokens)
Since last run: first run
```

Read these with it:
- **No percentage is shown for any rule, and more reading would not change that.** The escape bound charges each stratum about three times the sites per file even when every file was read, as here (17 of 17 files with a hit, 70 of 70 without). On counts this small every range is wider than 20 points. Use the plain counts.
- **The 87 files in the escape population were all read in both rounds.** Round one found wrappers and one private reader; the fix declared 8 conduits and 1 sink. The 3 round-two escapes are in partial jobs: `packages/renderer/src/index.tsx:788` (a hand-written root check) and `packages/designer/src/store.ts:296` (the host's document used before it is checked) in docload, and `packages/kit-mui/src/renderers.tsx:391` and `:660` (`optionEntry`, one file) in kitprops.
- **Audit.** All 16 disagreements were one question, whether `changed(onChange, ...)` ends in `onChange`. A fresh reader on the most capable model ruled for the scanner on every one. The audit brief described the `onChange` marker as "called directly", which is the likely cause.
- **Canaries** are pipeline canaries: one per recipe, drawn one per job, in round one. The evalcode source site later became the inside of a declared conduit; its copies still behaved as planted.
- **The type checker** was read from an installed sibling worktree with the same lockfile, because the links in the main checkout's `node_modules` are dangling. One type error was reported, in `FormSettings.tsx:242`, unrelated to any site.
- **Spend** counts subagent tokens at list input price (Opus 5.5 $4, Sonnet 5.5 $2, Fable 5.2 $8 per million). It leaves out the coordinating session and caching discounts.

## taking a form document into use (docload, partial): 5 families, 10 sites, at most 28 missed (95%)

- docload-1 docs/spec/01-document-model.md:50 (2026-09-04) "`loadDocument(unknown)` is the boundary for stored and imported values.": 3 of 10 found sites; no percentage: range 74 points wide
- docload-2 CLAUDE.md:34 (2026-09-04) "Imported documents cross one validation and normalization boundary before normal runtime use.": no percentage: the convention is vague
- docload-3 docs/spec/10-interchange.md:56 (2026-09-05) "Apply first parses JSON, then passes the result to `loadDocument`, the shared normalization and validation ...": 1 of 1 found sites; no percentage: range 97 points wide
- docload-4 docs/spec/12-api.md:313 (2026-08-31) "a host has one boot-time gate to call and `validateDocument` runs this inside it": 2 of 10 found sites; no percentage: range 74 points wide
- docload-5 docs/reinvention-ledger.md:12 (2026-11-15) "`storageFaults` is a stricter storage-envelope check, documented above it.": 5 of 6 found sites; no percentage: range 82 points wide
- docload-6 docs/THREAT_MODEL.md:18 (2026-09-04) "Server code validates the document, validates submitted value types and rules": no percentage: the convention is vague
- Off-pattern families: none

Six of the ten sites are in `apps/demo-server/src/index.ts`, and none of those calls `loadDocument`.

## running author-written code (evalcode, partial): 1 family, 6 sites, at most 12 missed (95%)

- evalcode-1 docs/spec/09-actions.md:9 (2026-09-04) "The source must not be passed to `eval`, `Function`, or an equivalent main-realm executor.": 6 of 6 found sites; no percentage: range 67 points wide
- evalcode-2 CLAUDE.md:32 (2026-09-04) "Core provides no default evaluator for author-controlled code.": 5 of 5 found sites; no percentage: range 71 points wide
- evalcode-3 docs/ARCHITECTURE.md:187 (2026-08-25) "The host injects one and owns the sandbox (worker or iframe with a restricted global).": 6 of 6 found sites; no percentage: range 67 points wide
- Off-pattern families: none

No call of `eval`, `Function` or `node:vm` was found.

## kit prop reading and value reporting (kitprops, partial): 12 families, 191 sites, at most 744 missed (95%)

- kitprops-1 CLAUDE.md:81 (2026-11-15) "`str`, `num`, `bool`, `changed`, `requiredProps` (`@willowforms/renderer`): kit prop readers.": 184 of 191 found sites; no percentage: range 80 points wide
- kitprops-2 docs/spec/02-kit-contract.md:253 (2026-11-15) "`@willowforms/renderer` exports the prop readers both shipped kits use: `str` (display text with a fallback...": 184 of 191 found sites; no percentage: range 80 points wide
- kitprops-3 eslint.config.js:72 (2026-11-15) "'Kit prop helpers (str, num, bool, changed, requiredProps) are exported from @willowforms/renderer. Import ...": 184 of 191 found sites; no percentage: range 80 points wide
- Off-pattern families:
  - `handler:onChange>onChange`  4 sites  2 files  history: Michael Hobbs 100%
  - `render:oneOf>oneOf`  3 sites  1 files  history: Michael Hobbs 100%

kitprops-1, -2 and -3 state the same rule in three places. `handler:onChange` is the two kits' Repeater add and remove buttons; `render:oneOf` is a reader private to kit-html.

## logging (log, closed): 4 families, 18 sites, at most 18 missed (95%)

- log-1 eslint.config.js:124 (2026-08-25) "'no-console': ['error', { allow: ['warn', 'error'] }],": 1 of 1 sites; no percentage: range 95 points wide
- log-2 eslint.config.js:249 (2026-08-25) "Build scripts report to stdout; that is their only output channel.": 4 of 15 sites; no percentage: range 55 points wide
- log-3 eslint.config.js:255 (2026-08-25) "The demo server is a CLI process; a startup line on stdout is the point.": 2 of 2 sites; no percentage: range 90 points wide
- Off-pattern families: none

The three rules cover separate paths, so no site is judged by two. log-2 quotes a comment that says scripts write to stdout only; 11 of their 15 sites are `console.error`.

## document URLs and CSS (safeurl, partial): 11 families, 32 sites, at most 30 missed (95%)

- safeurl-1 docs/spec/03-components.md:126 (2026-08-26) "`safeHref` allows http, https, mailto, tel and relative addresses, and strips nothing": 5 of 32 found sites; no percentage: range 48 points wide
- safeurl-2 docs/spec/06-inspector.md:266 (2026-11-24) "Dedicated image properties permit image fetching through a shared image-source allowlist; raw CSS continues...": 21 of 32 found sites; no percentage: range 48 points wide
- safeurl-3 docs/spec/01-document-model.md:149 (2026-09-01) "The text is **declarations only**. `safeDeclarations` refuses a block holding": 4 of 32 found sites; no percentage: range 48 points wide
- safeurl-4 docs/spec/01-document-model.md:164 (2026-08-31) "A single style _value_ is judged more strictly than a declaration list, by `safeStyleValue` in core.": 1 of 32 found sites; no percentage: range 48 points wide
- safeurl-5 docs/spec/01-document-model.md:143 (2026-08-31) "The Style tab writes it, `styleSheetFor` in core turns the tree's entries into one stylesheet, and the rend...": 1 of 32 found sites; no percentage: range 48 points wide
- safeurl-6 docs/THREAT_MODEL.md:15 (2026-09-04) "Document CSS is limited to declarations that cannot escape the component rule or initiate fetching.": no percentage: the convention is vague
- Off-pattern families: none

Each rule governs one kind of content (a link, an image, a block of CSS, one CSS value, the emitted sheet), so a rule's count is its share of the job and not how well it is followed. Every family follows one of them, and no raw sink was found.

## Decision list

1. Two rules name a different gate for documents: docload-1 (`docs/spec/01-document-model.md:50`, 2026-09-04, `loadDocument` for stored and imported values) and docload-4 (`docs/spec/12-api.md:313`, 2026-08-31, one boot-time gate, `validateDocument`). Default: docload-1, the newer; say in `12-api.md` that the boot-time check is for a document the host already holds.
2. `apps/demo-server` takes PUT bodies and its stored documents into use through `validateDocument` and `storageFaults` (6 sites) and never through `loadDocument`. It answers 422 to a document without `settings` or `actions`, which `loadDocument` would fill in, and it will not migrate a stored document once version 2 exists. `docs/reinvention-ledger.md:12` records `storageFaults` as deliberate, but not this. Default: call `loadDocument` in the PUT route and on read, and keep `storageFaults` for the storage envelope.
3. `useDesigner` puts the host's document into state and only warns about it afterwards (`store.ts:296` and `:312`). `docs/decisions.md` calls recovery an explicit designer state. Default: leave it, and name this path in `01-document-model.md` as the exception to docload-1.
4. `render:oneOf`, 3 sites, kit-html only: a prop reader for enumerated values next to the shared five. kit-mui writes the same check inline. Default: move `oneOf` to `packages/renderer/src/kit-props.ts`, use it in both kits and add it to the CLAUDE.md list.
5. `handler:onChange`, 4 sites: the Repeaters report rows without `changed`. Neither kit declares an `onChange` event on Repeater, and `03-components.md:288` says it reports through "the repeater's ordinary" callback. Default: keep, and say so next to kitprops-1, because adding the event later would make these 4 sites silent.
6. The comment at `eslint.config.js:249` says stdout is the scripts' only output channel, and 11 of 15 sites write `console.error`. Default: correct the comment; error text on stderr is the better behaviour.
7. The five stated safeurl rules share no family, which the census calls a contradiction. Default: none needed; they cover different content.

## Prevention drafts (nothing was edited)

Lint rule for the largest off-pattern family, `handler:onChange` (4 sites), for the `packages/kit-*/src` block of `eslint.config.js`:

```js
const KIT_DIRECT_ONCHANGE = {
  selector: "CallExpression[callee.type='Identifier'][callee.name='onChange']",
  message:
    'Report a value with `changed` from @willowforms/renderer: it calls onChange, then the node\'s onChange event.',
}
```

With decision 5 at its default, the four Repeater lines each carry a reasoned `eslint-disable-next-line`.

Convention line for docload-2 (vague), in the style of `CLAUDE.md`: "Imported and stored documents reach runtime code through `loadDocument` (`@willowforms/core`); `validateDocument` alone is for a document the host already holds."

Convention line for safeurl-6 (vague), for `docs/THREAT_MODEL.md`: "Document CSS passes `safeDeclarations` for a block and `safeStyleValue` for one value, and reaches the page only through `styleSheetFor`."

Convention line for docload-6 (vague), for `docs/THREAT_MODEL.md`: "Server code loads a submitted or stored document with `loadDocument` before it validates answers against it."

## Scope

The scan covers 93 source files: the seven workspace packages, `examples/`, `scripts/` and the root configuration. Tests, `test/`, `e2e/` and `e2e-dist/` are skipped, and 6 files are opaque because they implement a named module. The five jobs are those whose rules name modules a scan can count; the readers also found rules for validation, visibility, tree edits, storage, announcements, clipboard, patterns and others, which were not counted. `JSON.parse` is not a docload sink, because most of its calls parse something else. Rules that no call can break (a property access, a type, a CSS selector) are out of reach.
