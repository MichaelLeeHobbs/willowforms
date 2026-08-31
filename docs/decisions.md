# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

### Every own name on `Object.prototype` is a reserved key

- **Decided:** `RESERVED_KEYS` grows from three names to thirteen: the twelve own properties of
  `Object.prototype` plus `prototype`, which is not on it and is refused for reading as one of the set.
  Written as a literal, not derived from `Object.getOwnPropertyNames`, with `keys.test.ts` asserting the
  literal covers the running engine.
- **Why:** these names pass `KEY_PATTERN` and shadow a builtin everywhere a key is used as a property
  name, and the review found one shadowing live at the submit gate. The rule `keys.ts` already states is
  that a key namespace expressions can name has to be an identifier namespace; a name whose meaning in
  JavaScript is not "the answer to this field" fails that for the same reason a hyphen does.
- **Rejected: deriving the list at runtime.** Self-maintaining, and it makes the format engine-dependent.
  A document authored on Node 22 could stop validating on Node 30 with no change to the document or the
  library. Which keys are legal is part of the format, so it is written down; the test is what keeps the
  written form honest.
- **Rejected: leaving the list at three.** The null prototype closes the vulnerability, so this is only
  the second lock. But a key that resolves to a function in a host evaluator, in exported JSON Schema
  properties, and in host-supplied `FormData` is a hazard in places core does not own, and no null
  prototype of ours reaches those.
- **What it costs:** documents using any of the ten new names as a `key` or `dataKey` are now refused by
  `validateDocument` and by the Properties panel rename, and a row address naming one no longer parses.
  `generateKey` sanitises a component labelled "toString" to `field` instead. Nothing in the repository
  used one. The library is unpublished at `0.0.0`, so the real-world cost is zero today and rises the
  day it is not.
- **Reversal:** delete lines from one array. The staleness test would then need its expectation changed
  too, which is the intended friction.
- **When:** 2026-08-31.

### The merge that gates a submit builds on a null prototype

- **Decided:** `validateAcross` builds `merged` with `Object.create(null)`, matching `validateForm` one
  function above. `??=` stays, so first-message-wins is unchanged.
- **Why:** `validateForm` assigns, so only `__proto__` bit there. The merge _coalesces_, and the read in
  `merged[key] ??= message` finds an inherited value for any of a dozen names. Not nullish, so the write
  never happens: the error is discarded and `Object.keys(merged)` is empty. Empty is what every caller
  reads as valid, and `apps/demo-server` submits on exactly that. A required answer missing and a clean
  submit is the permissive failure this project is organised against.
- **Rejected: `Object.hasOwn(merged, key)` guarding a plain assignment.** It fixes the read and leaves
  `merged['__proto__'] = message` invoking the inherited setter. Two mechanisms to remember instead of
  one; the null prototype removes the whole class.
- **Rejected: relying on the widened `RESERVED_KEYS` alone.** Nothing on the render or validate path
  calls `validateDocument`. That is what made `__proto__` reachable in the first place and it is
  unchanged, so a blocklist cannot be the fix here.
- **Reversal:** one expression. Twelve tests would go red first.
- **When:** 2026-08-31.

### The second review is committed; the first one is not

- **Decided:** `docs/reviews/2026-08-30-second-pass.md` is tracked. The first pass stays gitignored in
  `tmp/`, because moving it now would rewrite the provenance of triage lines that already cite that path.
- **Why:** the first run's own contract said "if you cannot find the work list, stop" — an instruction
  that exists only because the work list lived in one working copy. A worktree, a fresh clone, or a
  machine change lost it. A remediation run whose input is not in the repository cannot be resumed, cannot
  be reviewed, and cannot be checked against later.
- **Rejected: keeping it in `tmp/` again.** It repeats the failure the review named in its own findings
  on `RUN.md`.
- **Rejected: a summary in the repo and the full review outside.** The queue items point at line numbers
  and file paths; a summary is not a work list.
- **What it costs:** this is a public MIT repository, so a 1283-line audit of its own code is now public,
  including four CRITICALs and the fact that all four were introduced by the previous remediation run.
  That is the actual cost and it is not small. Michael was asked and chose to publish.
- **Reversal:** `git rm` plus a history rewrite if the exposure ever matters, which is the expensive kind.
- **When:** 2026-08-31.

### Each queue item ends on its own pushed branch; each stage ends in a pull request

- **Decided:** one accumulating run branch, `build-out/review-b`. After an item's check passes, a
  never-moving pointer branch `build-out/b/NN-slug` is pushed at that commit, so item NN reads as
  `git diff build-out/b/<NN-1>-slug..build-out/b/NN-slug`. Each of the seven stages opens a PR onto the
  previous stage's head.
- **Why:** 34 items is 34 reviewable chunks, and the last run landed as one 32-commit squash that nobody
  could read a slice of. Pointer branches give per-chunk diffs for free. Stages give the automated
  reviewer something the size of a real PR rather than 34 round-trips, which matters because `RUN.md`
  forbids waiting on a review.
- **Rejected: a branch per item cut from `main`.** Items depend on each other — a product fix and the
  test that proves it are usually two different items — and the standing gate is repo-wide, so most such
  branches could not go green on their own.
- **Rejected: one PR per item.** 34 automated-review round-trips against a contract that says never wait
  on one. The reviews would land after the code they describe had already been rewritten twice.
- **Reversal:** free. The pointer branches are deletable and the run branch is the whole history either
  way.
- **When:** 2026-08-31.

### The playground sample keeps its point and loses the competitor's name

- **Decided:** `apps/playground/src/sample.ts:51-52` keeps the comment explaining why the field is
  optional and drops the named product and the asserted defect in its demo.
- **Why:** the file ships in the public bundle, and `CLAUDE.md` confines competitive material to
  `docs/prior-art`. The engineering point — a blank value passes for a url-only field, which is
  invariant 5 — is the part a reader of the sample needs; the comparison is not.
- **Rejected: leaving it.** The claim is measured and `docs/prior-art` names the same subject, so it is
  defensible. It is still a public assertion of a defect in someone else's product sitting in a demo
  fixture, which is not where that belongs.
- **Reversal:** two lines.
- **When:** 2026-08-31. Michael's call, not the run's.

### `data-fs-row` is the canvas coordinate; the tree's rows are `data-fs-tree-row`

- **Decided:** the renderer keeps `data-fs-row`, holding a repeater coordinate like `addresses[1]`. The
  Tree panel's list rows become `data-fs-tree-row`, holding a node key.
- **Why that way round:** the renderer's is the published one. It is a field on `NodeAttributes`, which
  is the type every kit spreads onto its outermost element, so renaming it is a breaking change to the
  kit contract for the benefit of a panel nobody outside this repository can see. And there "row" means
  an actual row of data, while the panel's rows are rows of a list — a different word that happens to be
  spelled the same.
- **The collision was live, and it fails quietly.** `[data-fs-row][tabindex="0"]` is how the keyboard
  specs find the focused tree row, and `Canvas.test.tsx` reads `[data-fs-row]` _specifically_ to get the
  tree's projection rather than the canvas's — the distinction Trap 9 exists for. Both start matching
  canvas elements the moment a document holds a repeater. Neither would throw; they would silently
  measure a longer list.
- **Rejected: renaming the renderer's** to something like `data-fs-row-index` and leaving the panel
  alone. It is the same rename count and it lands on the public half.
- **Rejected: one attribute for both,** distinguished by the value's shape. A coordinate always carries
  an index and a node key never can, so it is _decidable_ — and that is exactly the kind of rule that
  reads plausibly, works, and then does not, which is the argument this project already accepted against
  a path grammar in `Operand`.
- **Reversal:** a rename across nine files, all internal.
- **When:** 2026-08-30.

### The gate refuses what is malformed, not what is unusual; and the boundary is per node

Two decisions from item 8, which are the same decision seen from both ends: what a document has to be
before it renders, and what happens when one that is fine renders anyway and throws.

- **Decided: `validateDocument` now reads the whole document** — `version`, `id`, `name`, `settings`,
  `actions`, every `props` binding and its payload, `renderWhen`, conditions and their operands all the
  way down, `schema.type`, each rule's parameter, `css`, event names and action-reference types.
- **The line it draws:** refuse a shape **no version of this library ever wrote**. Do not refuse a shape
  that is merely unusual. A gate that rejects a document somebody is holding is worse than the render it
  was protecting, and the panel is where a broken document goes to be repaired.
- **Three places that line bites, written down because they look like omissions:**
  `static` bindings hold any JSON at all and only their _presence_ is checked, since a prop can be a
  list of options or a nested object and the kit decides. An empty `name` is accepted, because a form
  nobody has titled yet is a real state. And CSS that `safeDeclarations` will drop is accepted, because
  refusing it here would make the Style tab the one place that document cannot be opened.
- **The vocabularies are literal strings, checked both ways by the compiler.** They have to be literal:
  the question is what an _untrusted_ document holds, and by the time a value is typed as `PropValue`
  the question has been assumed away. `satisfies` refuses a string outside the union and a `Covers`
  conditional type refuses a union member outside the list, so neither can drift.
- **Decided: the error boundary is per node, not per form.** A form-level boundary saves the host's page
  and still throws away every answer already typed into the fields that were fine. On the canvas it is
  worse: the component that broke becomes unselectable, and selecting it is exactly what an author needs
  in order to delete it.
- **The fallback carries `data-fs-key` and `data-fs-type` itself.** The canvas hit-tests with
  `closest('[data-fs-key]')` and nothing else in the DOM identifies a node, so without them a broken
  component is unreachable from the canvas and from the tree at once.
- **Rejected: logging the error.** React has already written its own copy to the console. It goes to an
  `onError` prop instead, so a host that is watching gets it in its own telemetry and nobody gets it
  twice.
- **Reversal:** the boundary is one class and one wrapper. The gate is additive — it reports more, and
  nothing reads its output as a whitelist — so relaxing any single check is deleting the check.
- **When:** 2026-08-30.

### An unreadable tag reads as "no rule", not as "skip it"

- **Decided:** every `switch` over a closed union in the evaluation path gets a `default` that routes
  through `unreadableTag(value, fallback)`. `isVisible` answers **shown**, `guardPasses` answers **the
  rule applies**, `applyRule` answers **a failure**, `resolveProp` answers **null**. `validateDocument`
  refuses the tag up front, so none of those readings should ever be reached.
- **Why shown rather than hidden**, which is the reading this codebase gives elsewhere: `isVisible`
  already answers `true` for `i18n`, on the ground that a translation key expresses no condition. An
  unrecognised kind expresses none either. Hidden means unvalidated, and a required answer that stops
  being required on the server is invisible; a field shown when it should not be is a question the
  person filling in the form can see.
- **This does not reverse `evaluateCondition`,** which is false for a condition it cannot read. That
  function is asked whether a condition _holds_; an unreadable one does not hold. `isVisible` is asked
  whether a rule was expressed at all.
- **`applyRule` checks the key before the empty short-circuit,** and the order is the decision. "Every
  rule but `required` passes on an empty value" is a statement about rules, and an unreadable tag is not
  one — the case that matters is a mistyped `required`, which arrives with an empty value and would have
  gone straight through a check placed after it.
- **Rejected: a bare `default`.** It buys the runtime answer and throws away the compile-time
  exhaustiveness the missing tail return was providing. The `never` parameter keeps both: adding a union
  member without a case stops compiling. Verified by adding one and watching four call sites fail.
- **Rejected: throwing.** A malformed document is the gate's problem to refuse and the panel's to
  report. Taking the form down in front of the person filling it in is not an improvement on either.
- **The gate's two vocabularies are written out, and checked both ways by the compiler.** They have to
  be literal strings, because the question is what an _untrusted_ document holds and a type cannot ask
  that. `satisfies` refuses a string outside the union and a `Covers` conditional type refuses a union
  member outside the list.
- **Reversal:** one helper, four `default` cases, one check in the gate.
- **When:** 2026-08-30.

### A length in the MUI kit is a CSS string, not a theme multiple

A widening of the entry below, which decided only that `borderRadius` must stop being divided by 8.

- **Decided:** `Box`'s `padding` and `radius` and `Grid`'s `gap` are emitted as `px` strings rather than
  as bare numbers. `sx` passes a string through untouched, so the number the document authored is the
  number on the page under every theme.
- **Why more than the radius:** the radius was wrong under the default theme too, and the other two were
  wrong under any other one. Dividing by the scale round-trips only under `spacing: 8` and
  `shape.borderRadius: 4`, and MUI's whole point is that a host replaces them. Measured under
  `createTheme({ spacing: 3 })`: an authored 8px drew at 3px.
- **Rejected:** dividing by the theme's own values read from `useTheme`. It is arithmetic to undo
  arithmetic, it makes every length depend on a hook, and it still cannot express a length the theme has
  no unit for.
- **Not changed: `Stack`'s `gap`,** which is a real MUI spacing-scale prop rather than an `sx` length,
  and which diverges from the HTML kit in a way that needs a decision rather than a fix. Recorded in
  `docs/build-out/found.md`.
- **Reversal:** one helper and four call sites.
- **When:** 2026-08-30.

### The scope is chosen by which group a field is picked from, not by a second control

- **Decided:** inside a repeater the condition picker draws its field list as two `<optgroup>`s, `This
row` and `This form`, and the group an option came from is what writes `scope`. Outside a repeater
  nothing changes: one flat list, no scope written. A fresh condition seeded inside a row starts on the
  row.
- **Why:** the risk the row-addressing design was signed off with is a ref authored inside a row and left
  at the default scope. It reads a key the top level does not hold, resolves to `undefined`, hides its
  component, and `validateForm` then skips every rule beneath it. A separate scope select keeps that
  default and relies on the boot-time check to catch it afterwards; grouping removes the default
  entirely, because there is no way to pick a field without also having said where it lives.
- **The option value carries the scope**, as `row:email` / `form:email`. A data key is a JavaScript
  identifier and cannot hold a `:`, which `keyProblem` enforces on both a paste and a rename, so the
  split is unambiguous. Nothing of this encoding is stored; it exists between the `<option>` and the
  handler.
- **Rejected: a scope `<select>` beside the field select.** Smaller, and it is the shape the type
  suggests, but it ships the wrong default in a 288px pane and answers the failure with a warning
  somewhere else. `rowScopeProblems` stays as the backstop for hand-edited documents; it is not a reason
  to hand an author the mistake.
- **Rejected: inferring the scope from the name.** Already rejected once in this file, for leading-dot
  anchoring. Inference is the same mistake wearing different syntax.
- **Core owns the split.** `keyScopesFor(root, nodeKey)` returns the top-level keys and, when the node is
  inside a repeater, the enclosing row's. Row keys stop at a nested repeater: that repeater's own data
  key is an answer in this row because it holds the inner list, but what is inside it is one row further
  down and no ref from here can name it.
- **Reversal:** cheap. One core function, one prop threaded through the panel, and the grouping in one
  `<select>`. No document changes: `scope` was already in the type and absent already means the form.
- **When:** 2026-08-30.

### The value refusal also refuses a backslash

A refinement to the entry below rather than a reversal of it, recorded because it widens a refusal set
that was settled by measurement.

- **Decided:** `safeStyleValue` refuses `\` alongside the decided set.
- **Why:** the steelman checked backslash escapes against _escaping the class block_, and they did not.
  It did not check them against the fetch refusal, and `\75 rl(https://…)` is a valid CSS escape for
  `url(` in which the three letters never appear, so a substring check for `url(` alone does not see it.
  Nothing legitimate on a prop whose declared editor is `color` needs a backslash.
- **Rejected:** decoding CSS escapes before testing, which is a second parser to get wrong for a value
  that has no use for the syntax.
- **Reversal:** one character in one regex.
- **When:** 2026-08-30.

### A document's CSS values are refused in core, not made safe by the rendering shape

Settled by a steelman: two briefs at full strength against a neutral agent that ran the real
React 19 + MUI + emotion + stylis pipeline, real headless Chromium with request interception, and a
17-payload bypass battery.

- **Decided:** add a value-level refusal to core — a sibling of `safeDeclarations` — and call it from
  both kits at the one sink each has. Refuse `{ } < @ ; !`, `/*`, control characters, and
  `url(` / `image-set(` / `element(` / `cross-fade(`. Keep `sx`.
- **Why the rendering shape is not enough:** a React `style` object is safe only on the client. React's
  server renderer does not validate CSS at all — `renderToStaticMarkup` emits the string verbatim, and
  Chromium renders `red;position:fixed;inset:0;z-index:99999` as a full-viewport overlay that then
  vanishes on hydration. Nothing here server-renders today, but MUI's dominant deployment is Next.js.
  And a `style` object accepts `url(https://…)`, `image-set(…)` and `var(--x, url(…))`: measured with
  request interception, the outbound fetch fires identically from an inline attribute and from an emotion
  class. So the shape closes the injection and leaves the exfiltration untouched, in **both** kits.
- **The refusal set is checked, not assumed:** CSS-escaped braces, backslash escapes, fullwidth `｝`,
  braces inside quoted strings and inside `url()`, unbalanced parens, NUL, tab, CRLF, form feed — none
  escaped the class block, and all ten legitimate colour values passed. `CSS.supports` was rejected as
  the validator: it is browser-only, and core must run in Node.
- **A correction to my own reasoning.** I argued a denylist was impossible because banning `;` would break
  `url(data:image/svg+xml;base64,…)`, which `css.ts` was rewritten to protect. That holds for
  `safeDeclarations`, which validates a declaration _list_. It does not hold for a single **value** on a
  prop whose declared editor is `color` — `url()` is not a colour, so refusing it matches the prop's own
  declared domain. Two sinks, two grammars; I applied one proof to both.
- **The losing case's surviving point, and it should still be done:** `sx` buys almost nothing here.
  Across all five `sx` blocks there are zero theme tokens, zero pseudo-selectors and zero breakpoints —
  only the spacing scale, `shape.borderRadius`, and stylis autoprefixing. The `/8` conversions exist
  purely to undo a theme transform the kit does not want, and one of them undoes the wrong one (see
  below). Moving `Box` to `style` is the right refactor on its own merits; it is just not the security
  fix.
- **Exposure is one prop, not a class.** `background` on `Box` is the only string-typed style value in
  either kit — the same single line in both. Everything else is already `num()` or an enum.
- **A sanitiser must sit at the sink or at resolve time**, not at document load: `resolveProp` evaluates
  a `computed` binding through the host's evaluator at render time.
- **Reversal:** one function in core and one call site per kit.
- **What would change my mind:** a legitimate authored value that needs `url()` on a prop declared as a
  colour. The Style tab remains the channel for real CSS.
- **When:** 2026-08-30.

### The MUI kit halves every corner radius

- **Decided:** `borderRadius` in `kit-mui`'s `Box` must not be divided by 8.
- **Why:** MUI multiplies `borderRadius` by `theme.shape.borderRadius`, which defaults to **4**, while the
  kit divides by 8. Measured: `radius: 8` renders 4px and `radius: 24` renders 12px, against 8px and 24px
  in `kit-html`. `padding: n/8` is separately fragile — it round-trips only under the default
  `spacing: 8` and silently rescales under any host theme.
- **Why it matters beyond the arithmetic:** this is the cross-kit divergence the `Grid` comment two
  functions above it was written to prevent, sitting undetected below it. Nothing catches it because no
  test renders the same document through both kits and compares computed style.
- **Reversal:** trivial. Found by the Q1 ground-truth agent while measuring something else.
- **When:** 2026-08-30.

### A row frame carries the repeater's data key, not its node key

Settled by a steelman: two briefs arguing opposite sides at full strength, against a neutral agent that
built a patched copy of core and ran both designs.

- **Decided:** `RowFrame.key` holds `dataKeyOf(node)`. Three one-token edits — `validation.ts:250`,
  `validation.ts:361`, `renderer/index.tsx:263` — after which `applyChange` is correct as written and
  `rowValue` can be deleted. The **leaf** of an error key stays `node.key`, unchanged.
- **Why:** the coordinate is dereferenced in exactly one place, `applyChange`, and it is dereferenced as
  data. Everywhere else it is a label. `validateForm`, `submittedData` and the renderer all already
  descend with `dataKeyOf(node)`, so the address was the odd one out, not the data path. Under the node
  key, a repeater whose `key` differs from its `dataKey` silently discards every row edit — and worse,
  can write an answer into an _unrelated_ list that happens to share the name, which is the opposite of
  what the "a write that cannot be placed returns the input unchanged" comment promises.
- **The strongest argument against, and why it fell:** data keys may repeat, so an error coordinate built
  from them looked ambiguous. Run against a document with two repeaters legally sharing `dataKey`, both
  visible: four error keys, four distinct, no collision. It is impossible rather than merely unobserved —
  node keys are globally unique, `validateDocument` enforces that with one `seen` set over the tree, so a
  node's chain of enclosing repeaters is fixed and only the indices vary. The prefix disambiguates rows;
  the leaf carries identity. The objection conflated the two.
- **The losing case's surviving point:** `dataKeyOf` is total from identity to name and has no inverse,
  so a data-keyed frame cannot recover which repeater it came from. That is real. It costs
  `data-fs-row` uniqueness when two visible repeaters share a data key — measured as near-worthless: no
  kit reads the attribute, `css.ts` scopes by `data-fs-key` rather than by it, and the one e2e assertion
  passes either way. Note the stated justification for `data-fs-row` in this file was that per-component
  CSS must reach every row; `css.ts` shows `data-fs-key` already does that, so the attribute is close to
  write-only.
- **Rejected:** giving `applyChange` the tree, or a `dataKeyOfRepeater` mapper. `rowValue` already has
  that signature and has been dead since it landed — it has no caller because the caller that needs it
  structurally cannot accept it. `applyChange(data, address, value)` is the signature promised to hosts
  precisely so that no host implements array descent.
- **Prior art:** five of five libraries surveyed name a row coordinate by the storage name, never by a
  component id. The two that maintain parallel identity and data systems (JSONForms, SurveyJS) keep
  identity out of the path and pay a translation cost anyway; SurveyJS, whose `name`/`valueName` split is
  nearly identical to this one, resolved value-addressing toward the data name.
- **Reversal:** three tokens, and nothing persisted changes — no address string appears in a document.
- **What would change my mind:** a consumer that must recover _which repeater_ a coordinate came from
  using only the string. None exists today; `FormErrors` keys have exactly two readers in the repo.
- **When:** 2026-08-30.

### The demo store stays in the repo; the ignore line has to land on main

- **Decided:** keep `apps/demo-server/forms.json` where it is and commit the `.gitignore` hunk from
  `c559676` to `main`. Do not relocate the store.
- **Why:** the repo already ignores eight runtime-generated in-tree paths, and all three commented
  `.gitignore` blocks are "a tool wrote here" — there is no precedent for relocating one. Prior art
  agrees: Strapi's `.tmp/data.db`, Prisma's `dev.db`, json-server's `db.json` are all in-tree and
  ignored, and no widely-used example server moves its store to a temp directory. Two facts retire the
  strongest framing against: `forms.json` has never been committed on any ref, and the submit route never
  persists, so the worst content is a form definition the developer wrote themselves.
- **The losing case's surviving point, and it sets the real task:** a `.gitignore` line is branch-local
  state, and this one is stranded. `git log --all -S` finds it in exactly one commit, on
  `origin/docs/steps-decision` — the only one of twenty-one branches with no PR. `main` does not have it.
  And the accident it prevents already happened here: `.vscode/terminals.json.9516.tmp` was swept in by a
  `git add -A` and pushed to the public remote, with the `.vscode/` ignore line landing only afterwards.
  So the durability objection is answered by _where the line lives_, not by where the store lives.
- **Rejected:** `os.tmpdir()`. The Windows-cleanup counter-argument turned out to be unsupported —
  `%TEMP%` on this machine still holds files from 2018 — but relocation buys nothing the precedent does
  not already cover, and costs the demo the legibility that is most of its job.
- **Reversal:** one line either way.
- **What would change my mind:** the submit route persisting answers. Then the file holds someone else's
  data rather than the developer's own, and it leaves the repository the same day.
- **When:** 2026-08-30.

### Row addressing: rows are a projection, not nodes

Designed four ways in parallel under different constraints — minimal interface, maximal flexibility,
common-case-trivial, ports-and-adapters — then judged, and now built: `rows.ts` in core, the row context
in the renderer, `applyChange` for writes, and a fixture in three suites that keeps `key` and `dataKey`
different so this design and its opposite cannot produce the same output. It is also the newest design
here and the least settled, so the reversal note below is the part to read first.

- **Decided, and unanimous across all four designs:** **rows never mint keys.** The authored subtree
  exists once in the document; rows exist in the DOM, in `FormData` and in `FormErrors`, and never in the
  tree. A `Repeater` is a node whose `schema.type` is `array` and which has children.
- **Decided: the data is nested**, and this was _forced_ rather than chosen. `toJsonSchema` projects for a
  validator that never runs this code, and JSON Schema expresses `{type:'array', items:{type:'object'}}`
  natively while it cannot express an unbounded family of `addresses[0].street` keys without
  `patternProperties`. The same choice keeps `onChange(key, value)` unchanged, because adding a row is one
  write to one top-level key. Flat encoding would have forced a new port on every host.
- **Decided: no path string ever appears in a document.** Addresses are formed at the boundary and
  consumed at the boundary — the DOM, error keys, and the host's writer. An author never types an index.
- **Decided: `Operand.ref` gains an explicit scope discriminant** rather than a path grammar. Absent means
  the form, which is what every existing `ref` already means, so no document migrates.
- **Decided: `data-fs-row` is a separate attribute from `data-fs-key`.** They are wanted in opposite
  directions and one attribute cannot do both: per-component CSS is authored once and must reach every
  row, while a click must land on exactly one. That also leaves `css.ts` and every kit untouched.

**This corrects an entry above.** The steelman recorded, from a measurement, that repeated scope "is a
node-identity change in `tree.ts` first" — `findNode` returning row 3 while `pathTo` returned row 1,
`updateNode` editing every row. That measurement was real but the conclusion does not follow: every one
of those failures needs the same key at three places in the tree, and it never is one. `tree.ts` needs no
changes at all. The finding it did produce was genuine and is fixed separately — the two lookups
disagreeing was a live bug with unique keys too.

A second correction: I repeated JSONForms' maintainer's point that pointer-style addressing cannot
express row-relative and root references at once, and applied it to `Operand`. `Operand` is not
pointer-style. It is a tagged union whose tag _is_ the namespace, and `types.ts` says so. The enhancement
JSONForms had to bolt on is, here, one optional field on one member.

- **Rejected: leading-dot anchoring** in `ref.dataKey` (`.country` for this row). It is the smallest
  possible grammar and it makes the most common authoring mistake silent — writing `country` inside a row
  and getting the root field. That ambiguity is what left Form.io with eight path flavours.
- **Rejected: refusing root access from inside a row entirely.** Safe, and it loses a case every real
  forms product has: "show the VAT field on each line only for a business order". The refusal is cheaper
  than the ambiguity, but an explicit discriminant is cheaper than both.
- **Rejected: a stable row id.** It puts a non-answer inside `data`, which
  [12-api.md](spec/12-api.md#state-that-is-not-an-answer) already refused by name. Rows are addressed by
  index; a reorder rewrites held error keys explicitly at the moment it happens.
- **The risk this carries, and it must be built with the mitigation, not after it:** a condition authored
  inside a row and left at the default scope reads a key that only exists in the row, resolves to
  `undefined`, hides the field, and `validateForm` skips it. That is exactly the quiet failure
  `missingContext` exists to catch — a required answer silently becoming advisory on the server — so it
  takes the same boot-time answer. `validateDocument` must report a form-scoped `ref` naming a data key
  that exists only inside a repeater, and the picker must write the row scope when authoring inside one.
- **Reversal:** the frame-list shape supports nested repeaters and can be narrowed to a single integer if
  nesting is refused, which is a narrowing rather than a rewrite. Everything cut for a first version —
  outward anchors, row offsets, row facts beyond the index — is an additive union member that the
  compiler will point at.
- **When:** 2026-08-29, designed on `feat/steps`. Built 2026-08-30, with the row-scope discriminant and
  its three boot-time checks; what remains unbuilt is any way to _add_ a row, which `found.md` covers.

### The key grammar is the JavaScript identifier subset

- **Decided:** `^[A-Za-z_][A-Za-z0-9_]*$`, plus `__proto__`, `constructor` and `prototype` refused by
  name. Enforced by `keyProblem`, called from both `validateDocument` and the panel's rename, so a paste
  and a rename are judged the same way. Applies to `dataKey` too.
- **Why:** A hyphen is the tempting addition — real forms are full of `first-name` — and it is exactly
  the one that breaks. `computed` bindings are host-evaluated JavaScript, so `first-name` in an
  expression is a subtraction, silently and with no error anywhere. A key namespace expressions can name
  has to be an identifier namespace. `.`, `[` and `]` stay free because row addressing will need them.
- **Rejected:** Allowing hyphens, which reads friendlier and hands every author a silent wrong answer the
  first time they write an expression. Also rejected: reporting a bad key as a warning rather than an
  error, which is how a document that cannot round-trip through JSON Schema ends up in a database.
- **Reversal:** Loosening later is easy and tightening later is not, so this is deliberately the strict
  end. It is a breaking change for a document holding a key outside the grammar, which is free while
  nothing is published and would not be afterwards. That asymmetry is the argument for doing it now.
- **When:** 2026-08-28, on `feat/steps`.

### `missingContext` is checked against the scopes, not the bare context

- **Decided:** A host that evaluates under several environments runs the boot-time check against those
  environments, not against its base context. `apps/demo-server` unions `missingContext` over its scopes.
- **Why:** Found by running it. `step` is a path the server fills in itself, once per scope, so against
  the base session context it reads as missing and every multi-step form is refused for a path that was
  never missing. The question the check is actually asking is whether every path a document reads can be
  read in the environments it will be evaluated in.
- **Rejected:** Teaching `missingContext` about steps, which would put a feature core deliberately does
  not know about into the function that checks wiring. Also rejected: dropping the check for documents
  that read `step`, which trades a false alarm for a silent hole.
- **Reversal:** Trivial, and confined to the host. Core is unchanged.
- **When:** 2026-08-28, on `feat/context`.

### Steps next, then the key grammar, then repeated scope

- **Decided:** Keep the approved order. Build steps, then the key grammar `12-api.md` already calls
  planned, then repeated scope. Settled by a steelman: two briefs arguing opposite sides at full
  strength, tested against an agent with no stake that surveyed six libraries and ran the naive Repeater
  against this core.
- **Why:** The evidence points away from the reversal's central claim. Across react-hook-form, Formik,
  JSON Schema, JSONForms, SurveyJS and Form.io, **four of six needed a breaking change to their row
  addressing after shipping and none ever needed one to add pages.** The mechanism is why: paging
  partitions a form along an axis the data model does not have, so it is a view transform, while
  repetition adds a coordinate to every path beneath it and the setter, getter, validator, error
  reporter, condition evaluator and reconciliation key must all learn it at once. Steps here add
  `validateAcross(root, data, EvalOptions[])`, a container definition and a canvas prop — none of which
  names, addresses or stores a value — so there is no addressing vocabulary for rows to inherit. Five of
  the six libraries also implemented steps exactly as this repo already does, a display flag over an
  existing container, so the shape is convergent rather than naive.
- **Rejected:** Repeated scope first. Its strongest claim, that whoever is second inherits the other's
  idea of scope, is untestable for this repo, and the ground-truth agent warned explicitly against
  reading the library corpus as evidence about ordering: those projects never chose, they all ended up
  with both. What the corpus constrains is risk _within_ the addressing layer, which is orthogonal to
  which feature ships first.
- **The losing case's strongest surviving point**, which changes what repeated scope must include:
  repetition breaks this codebase **silently**, and not only in the DOM. Measured against core with one
  row subtree present three times — `findNode` returns row 3 while `pathTo` returns row 1, `updateNode`
  edits every row, `removeNode` deletes every row, `moveNode` collapses three into one. So repeated
  scope is not "add a component"; it is a node-identity change in `tree.ts` first. Form.io ended with
  eight path flavours because they kept finding they had the wrong one, and JSONForms' maintainer states
  that pointer-style addressing cannot express row-relative and root references at once without a
  special enhancement — and Formsmith's `Operand` is exactly pointer-style. The key grammar goes between
  the two features for that reason: a path grammar on top of a key grammar that does not exist is how
  that mistake gets made here.
- **Reversal:** Cheap, and asymmetric on purpose. Steps add no type, no addressing and no public-API
  change, so if this order is wrong the work is not thrown away — it is a container definition and one
  validation helper that repeated scope neither uses nor contradicts.
- **What would change my mind:** if the goal shifts to publishing the document format and freezing it
  soon, breaking `FormData` and `onChange` before first publish dominates and repeated scope goes first.
  Or a real user needing "add another" before a wizard.
- **When:** 2026-08-28, on `feat/context`.

### Edit mode draws what a condition hides; preview does not

- **Decided:** `FormRenderer` takes `revealHidden`, and the designer passes it while editing and never
  in preview. A revealed node carries `data-fs-hidden="true"`. Validation is untouched: `validateForm`
  calls the same `isVisible`, so this changes what is drawn and never what is checked.
- **Why:** A component with `renderWhen` set was absent from the canvas DOM, so it could not be seen,
  selected there, or dropped into — the tree was the only way to reach it. Arranging a form means
  arranging every component in it, including the ones a given user will not see. Showing what a user
  sees is what Preview is for.
- **Rejected:** A sample-data box on the canvas bar, which makes an author simulate a user to reach
  their own components and cannot help at all with a condition reading host context. Also rejected:
  dimming the revealed node from `designer.css`, which invariant 3's test forbids — its bar is that an
  exception gives a component back something the designer took, never an appearance decision on the
  kit's behalf. The marker is an attribute; what to draw with it is still open.
- **Reversal:** Cheap. One prop, one branch in `RenderNode`, one optional attribute on `NodeAttributes`.
  Kits spread `nodeProps`, so none of them had to change.
- **When:** 2026-08-28, on `feat/context`.

### The context an effect writes is the browser's, never the server's

- **Decided:** `setContext` writes to the browser's copy of `FormContext` only. The server builds its own
  context from its own session and never reads one out of a request body. A rule guarding anything that
  matters must read a path the server can derive for itself.
- **Why:** The spec had said the same rule "evaluates on the server, where the context is whatever the
  request supplied", which reads as an instruction to trust the payload and contradicts the security
  model two files over. An effect is authored in a document, and a document must not be able to grant
  itself privilege on the server.
- **Rejected:** Letting an effect's context travel with the submit. It is convenient and it makes a
  document able to tell the server what to believe about the person filling it in.
- **Reversal:** Free today. `setContext` is a sketch in `09-actions.md`, not code. It gets expensive the
  moment an action vocabulary ships against the looser reading.
- **When:** 2026-08-28, on `feat/context`.

## A condition follows a copy only when it reads the context

`repointBinding` rewrote every literal equal to the old key. `duplicateNode`'s own comment said it did
not, and gave the reason: a condition testing an answer whose value happens to spell the copied key is
about the answer, not the node. The function had been doing the opposite since it was written, and the
designer's rename inherited it, so renaming a component quietly rewrote conditions about answers.

A literal names a node when it is compared against the host context, which is the shape a `Step` ships
with (`context.step == 'welcome'`). It names a value when it is compared against a `ref`. So the rewrite
now happens only inside a comparison with a `context` operand in it.

Found by writing the test the review said was missing, which is the second half of the rule failing
against the code that claimed to implement it.

## A row-scoped ref to a form-level answer is reported at boot

`rowScopeProblems` reported two mismatches: a form-scoped ref to a key that only exists in a row, and a
row-scoped ref on a node outside every repeater. The third is a row-scoped ref _inside_ a repeater
naming a key no node in that row writes while a node outside every repeater does -- what you get by
dragging a conditional field into a repeater. It reads nothing, the condition is false, the component is
hidden, and its rules never run.

Conservative in the same way as the other two: reported only when the key demonstrably lives at the
other scope. A row's data can carry keys no component authors, so a ref naming a key nothing in the
document writes is left alone rather than guessed at.

This closes the loop under `rows.test.ts`'s "does not fall back to the form when the row has no such
field", which asserted the silent-permissive outcome and stopped there.

## The documented suite size is enforced by a reporter, not a test

Three documents quote how many tests there are and `docs.test.ts` compared them with each other, which
is three files agreeing on a number that can be wrong in all three. No test can count the run it belongs
to: the total is not known until every file has finished, and that is where a reporter stands.

`test/count-reporter.ts` runs at the end, counts the tests that reported a result and fails the process
when a document disagrees. It skips itself on a filtered run -- comparing a figure about the whole
repository against `vitest run packages/core` would make the fast loop unusable -- and says which of the
two it did, so a silent skip cannot be mistaken for a pass.

## A control border is not a divider

Measuring the designer's own controls for the first time found them at 1.39:1 light and 1.41:1 dark
against the surfaces they sit on, where WCAG 1.4.11 asks 3:1. A field's background is 1.08:1 from the
panel behind it, so the border is the only thing that says a control is there.

`--fs-border` stays what it was, because a panel divider is decoration and 1.4.11 asks nothing of it.
`--fs-control-border` is the new token, used by inputs, selects, textareas and buttons, clearing 3:1 on
all three surfaces in both themes. Splitting the token rather than darkening the existing one keeps the
chrome from turning into a grid of hard lines.

## Refused CSS stays in the box and out of the document

The Style tab's raw editor told the author a value with a brace in it would not be applied, and then
committed it anyway. So the document carried declarations the renderer drops -- the "worst of both" the
row's own comment warns about -- and a host reading `node.css` for itself got the unsanitised string.

It now keeps the text in the textarea, flagged, and writes nothing. That is the bargain `KeyField`
already makes with a name that is already taken: refuse, say why, and let the mistake be corrected in
place rather than retyped.
