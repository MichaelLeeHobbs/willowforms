# Decisions

Choices made under delegated design authority that would otherwise have been questions. Newest first.

The field that earns this file is **Reversal**: it says which entries deserve a second look.

### Renaming a key re-points the refs that read its answer, when it was the only writer

- **Decided:** `renameKey` rewrites every `renderWhen` ref naming the moved data key, and only when the
  renamed node was the sole writer of that name. `repointDataKey` and `writersOf` are new in
  `@formsmith/core`.
- **Why:** a key is identity _and_, for a node with no explicit `dataKey`, the payload name -- and
  `instantiate` never writes one, so that is every freshly dropped component. The rename moved the answer
  and left every condition reading the old name, which reads an answer nothing writes: the component is
  permanently hidden and, because `renderWhen` gates validation, its rules never run on the server
  either. Silent and permissive, which is the class this project is organised against.
- **Rejected: writing an explicit `dataKey` on rename** so the answer name never moves. Conceptually the
  cleanest -- it makes a key pure identity -- and it breaks the ordinary gesture: an author who renames
  `field1` to `email` early on _wants_ the payload name to change, and this would silently keep
  `field1` in the payload forever.
- **Rejected: refusing the rename** and naming the components that would break. Safest, and hostile:
  renaming is a normal authoring gesture and refusing it because something references the field makes the
  designer feel broken rather than careful.
- **Rejected for now: reporting a dangling ref from `validateDocument`.** It is the right safety net and
  it is a new structural error code, which changes what every host's boot gate says about documents that
  are stored today. That is a separate decision with its own blast radius, and it belongs in its own item
  rather than smuggled into a rename fix. Recorded in `docs/build-out/found.md`.
- **Reversal:** moderate. The two new exports are public, so removing them later is a breaking change,
  and a document renamed under this rule has had its refs rewritten -- undoing the _policy_ does not
  un-rewrite them. What is cheap to revisit is the sole-writer condition, which is one boolean.
- **When:** 2026-09-01, queue item 18.

### `contextValues` exports its cap instead of reporting truncation in its return type

- **Decided:** `MAX_CONTEXT_VALUES` becomes a public export and the docblock shows a host how to detect
  truncation (`values.length >= MAX_CONTEXT_VALUES`). The signature stays `JsonValue[]`.
- **Why:** the failure is real -- a document naming more distinct values than the cap yields a partial
  list, and `validateAcross` runs one pass per scope built from it, so every step past the cap goes
  unvalidated and the submit succeeds with its required fields missing. But reaching it needs a thousand
  distinct literals on one path, which is not a form.
- **Rejected: returning `{ values, truncated }`,** which is the shape `rowScopeProblems` uses and the one
  the review points at. It is the better API and it is a breaking change to a public export, rippling
  through the reference server and its tests, for a shape this severe only in theory. The export makes
  the limit checkable without pretending the API is better than it is.
- **Reversal:** cheap, and the export is forward-compatible with the better shape -- adding
  `contextValuesWithin` or widening the return later does not invalidate a host that compared lengths.
  What would be expensive is doing nothing: an undocumented silent cap is the kind of thing nobody finds
  twice.
- **When:** 2026-09-01, queue item 15.

### The ReDoS guard learns two shapes and documents the rest, rather than guessing at alternation

- **Decided:** `nestedUnbounded` now propagates an unquantified group's finding to its parent (closing
  `(?:(a+))+`, which was a one-token bypass), and refuses a repeated group with a _duplicated_
  alternative (`(a|a)*`). General alternation analysis is not attempted. What is left is written into
  `docs/spec/08-validation.md` as a deployment concern with three concrete things a host can do.
- **Why:** the duplicate-branch rule is the only alternation case that can be refused with **zero** false
  positives -- `(a|a)` matches exactly what `(a)` matches, so no author writes one deliberately and
  refusing it takes nothing away. It also happens to be the exact example the code's own docblock named
  as uncaught.
- **Corrected in review:** the first version of this entry, and the spec paragraph with it, named
  `(a+|b)*` as part of the residual. It is not -- the inner `+` makes the group hold an unbounded
  quantifier and the outer `*` repeats it, so the nesting rule already refuses it. The residual is
  `(a|ab)*`: overlapping branches with no repeat inside either. The same review found that the
  duplicate-branch check sliced the group body from the character after `(`, so `(?:a|a)*` compared
  `?:a` against `a` and escaped it -- in the spelling an author is most likely to write.
- **Rejected: first-character overlap detection.** It would catch `(a|ab)*`, which is the real residual,
  and it would also refuse `(ab|ac)+`, which is perfectly safe and the sort of thing an author writes.
  Refusing a legitimate pattern is a worse failure than missing a dangerous one here: the author gets a
  rule that can never pass and no way to see why, whereas the missed pattern is a deployment risk the
  deployer can mitigate and has now been told how to.
- **Rejected: doing nothing and only documenting.** The plain-group bypass is a plain bug -- the guard
  claimed a family and missed two spellings of it -- and `(a|a)*` costs nothing to close.
- **Reversal:** cheap either way. Both checks are local to one function and each has its own test row and
  its own message. The part that would be expensive to undo is the spec section: a deployer who has read
  it and put a timeout on their submit route is not harmed if the guard later improves.
- **When:** 2026-08-31, queue item 7.

### `KeyField` gets the re-sync guard, not a key on the panel

- **Decided:** `KeyField` carries an `if (value !== committed)` block like its eight siblings, and
  `Inspector` keeps rendering the three panels unkeyed.
- **Why:** a key cannot tell the two cases apart and a guard can. The panel has to reset this field when
  the _selection_ moves and must not reset it when a _rename_ moves the value, because the field is the
  thing performing the rename -- remounting mid-rename takes the focus and discards the refusal alert,
  which the call site's own docblock records as an already-fixed defect. `node.key` and
  `api.selectedKey` both change on a successful rename, so keying on either re-creates it. The guard
  distinguishes them: a refused rename leaves `value` alone, a successful one moves `value` to something
  this field committed, and only a `value` it never wrote resets the draft.
- **Rejected: `key={api.selectedKey}` on the three panels.** The review argues for it, and it is the more
  structural answer -- it would protect the ninth editor added without a guard, which is the real
  weakness here. It loses on the rename case above. The protection it would have given is replaced by a
  test that reads whatever editors the panel renders across a selection change, rather than naming the
  eight, so a ninth without a guard fails it.
- **Reversal:** cheap. The guard is six lines in one function and the sweep test does not depend on it.
  What is not cheap is re-deciding it wrongly: keying the panel looks like a tidy-up and silently
  reintroduces a defect this file has now fixed twice, so the reasoning lives in the code beside both.
- **When:** 2026-08-31, queue item 3.

### One pull request per queue item, capped at 12 files and 500 lines

- **Decided:** the 2026-08-31 remediation run ships one PR per queue item, sized to a hard budget, merged
  into `main` only after a Copilot review has been read and answered. No long-lived run branch, no stage
  batching. `docs/build-out/queue.md` carries the budget and the per-item procedure.
- **Why:** the previous run's stage PRs were reviewed like this -- #28 at 17 files and 940 lines: zero
  Copilot comments; #29 at 54 files and 3342 lines: zero; #30 at 96 files and 5875 lines: three; #31 at
  96 files and 2958 lines: one; #32 at 7 files and 186 lines: three. A large diff does not get a shallow
  review from Copilot, it gets none, and the PR still reads as reviewed from the outside because a bot
  posted something. The smallest PR of the five drew as many comments as the largest.
- **Rejected: stacked branches.** Item N+1 cut from item N's branch with the PR based on it would keep
  each diff small _and_ let work continue while a review is pending. It also gives an unattended run a
  second way to get its git state wrong, and rebasing a stack after a Copilot fix lands mid-chain is
  exactly the operation that goes wrong at 3am. One open PR at a time is slower and has one failure mode.
- **Rejected: keeping stage PRs and asking Copilot to try harder.** There is no such setting. The comment
  form of the re-request only re-checks findings already open, which is the documented behaviour that
  makes a grown PR look clean.
- **What it costs:** about 54 pull requests instead of 7, and a wait for CI plus a review on each. The run
  is several times longer in wall-clock. It buys the only external, objective check on this work that is
  not the same model grading its own homework.
- **Reversal:** cheap and partial. Nothing in the repository depends on the shape, so a later run can go
  back to stage batching by editing `queue.md` and `RUN.md`. What does not come back is the review
  attention on anything already merged: a PR that shipped inside the budget got read, and re-batching it
  afterwards cannot un-read it. So the cost of reversing is paid by the items still ahead of the change,
  never by the ones behind it -- which is the argument for erring towards the smaller PR when an item is
  near the line.
- **When:** 2026-08-31, before the run started.

### `rowScopeProblems` stays internal; the spec names `validateDocument` instead

- **Decided:** the document, not the export. `docs/spec/12-api.md` told hosts to call `rowScopeProblems`
  at boot; it is not exported from `@formsmith/core` and now the page says `validateDocument`, which is
  what actually reports those problems, under the `row-scope` code.
- **Why:** `validateDocument` already calls it. A host has one boot-time gate to call, and exporting a
  second entry point for a subset of what the first one returns is two ways to ask one question -- with
  the usual consequence that one of them drifts.
- **Rejected: exporting it.** It would be a public function whose whole output is a strict subset of
  `validateDocument`'s, and a host that called only it would miss every other structural problem. The
  cheap thing to add is the wrong shape to add.
- **What it costs:** nothing today, because nothing could have called it. If a host ever wants row-scope
  problems without the rest, that is a filter on `validateDocument`'s result by `code`, which is already
  how the errors are typed.
- **Reversal:** one line in `index.ts`.
- **When:** 2026-08-31.

### A length-valued prop is CSS pixels, and kit-mui converts at its edge

- **Decided:** every length a document can author -- `gap`, `padding`, `radius`, `maxWidth`, `width` --
  is a number of CSS pixels in every kit. `@formsmith/kit-mui` converts to its own spacing scale at its
  edge. Written into `docs/spec/02-kit-contract.md` and run as two contract rules against every kit.
- **Why:** the contract's one obligation is that a document authored against one kit renders against the
  other, and it never said what a number means. `kit-html` read `gap` as pixels; `kit-mui` passed it to
  MUI's `gap`, which is a multiple of `theme.spacing` and defaults to 8 -- so an authored `gap: 2` was
  16px in one kit and 2px in the other. Neither kit was wrong. That is what made it a spec defect rather
  than a bug, and why the fix belongs in the document first.
- **Why pixels:** it is the only unit both kits can express without a theme, and it is what the other four
  lengths already meant in both. `kit-mui`'s own `Grid` was already using pixels for the same prop, so
  that kit disagreed with itself -- the choice was not between two coherent positions.
- **Rejected: making `gap` kit-relative and documenting it.** It gives up the claim the contract exists to
  make. A document that lays out differently in each kit is a document that does not travel, and the
  designer would have to stop pretending one number means one thing.
- **Rejected: a spacing unit in core.** A scale is a design-system decision, and core has no design
  system by construction. Converting at the kit's edge puts the knowledge where the scale lives.
- **What it costs:** `kit-mui` reflows. A document that authored `gap: 2` against it rendered 16px and now
  renders 2px. Its _defaults_ do not move: the default was `gap: 2` through MUI's scale, which was 16px,
  and it is `16` pixels now, so a form that never set a gap looks identical. Only an authored value
  changes, onto the meaning every other length already had. Unpublished at `0.0.0`, so the real cost is
  the playground's own sample and nothing else.
- **Reversal:** one constant and five call sites in `kit-mui`, plus the spec section and two contract
  rules. The rules are what would make a silent reversal fail.
- **When:** 2026-08-31.

### A throwing evaluator fails a custom rule and applies a guarded one

- **Decided:** both bare evaluator calls in `validation.ts` are wrapped. A throw in a `custom` rule's
  expression fails the rule; a throw in a rule's `when` guard leaves the rule applying. `validations`
  becomes optional on `FieldSchema`, read everywhere through one `validationsOf` helper.
- **Why the two answers differ:** they are not the same question. `visibility.ts` already wraps the same
  call and says a throw reads as hidden, matching what a missing evaluator gets. Here the missing-evaluator
  answers are deliberate and different from each other -- a `custom` rule passes, a computed guard is
  skipped -- because a host that supplied no evaluator has made a configuration choice that `evaluatorKeys`
  reports at boot. A throw is one broken expression in a document, which is a different thing.
- **Why a throwing `custom` fails:** the same sentence `matchesPattern` makes twenty lines away about a
  pattern it refuses to run. A rule that cannot be run has not been satisfied.
- **Why a throwing guard applies:** the `default` case in `guardPasses` already rules on it -- a guard this
  code cannot read has not said no. The other direction is a required answer quietly becoming optional on
  the server, over a typo in an expression.
- **Rejected: making both answer permissively, to match the no-evaluator path.** That reads the
  configuration choice and the broken expression as one thing, and both of its answers are the silent
  permissive failure.
- **What it costs:** a host whose evaluator throws now sees rules fail rather than a 500. That is a
  behaviour change for anyone relying on the crash, which is nobody.
- **Reversal:** two `catch` bodies.
- **When:** 2026-08-31.

### `FieldSchema.validations` is optional, because the gate always said so

- **Decided:** the field is `validations?: ValidationRule[]`, and every reader goes through
  `validationsOf(node)`, which answers `[]` for absent _and_ for anything that is not an array.
- **Why:** `validateDocument` accepts a schema with no `validations` -- its own check returns early on
  `undefined`, deliberately, because a field with no rules is an ordinary field. The type said the array
  was always there, so three readers were written as though it were: `duplicateNode` spread it, and
  `validateField` and `toJsonSchema` iterated it. A document the gate calls valid threw a `TypeError` out
  of the duplicate action, out of `validateForm` and out of the schema export.
- **Why the type rather than three fixes:** ten other readers already guarded with `Array.isArray`, which
  is what made the class look handled. Ten call sites each deciding for themselves is the shape that
  produces three that decide differently. The type is what turns "remember to guard" into something the
  compiler asks about, and the helper is what makes the answer one answer.
- **Rejected: requiring `validations` in `validateDocument` instead.** It makes the gate refuse
  hand-written documents that are perfectly renderable, to spare three call sites a guard.
- **Rejected: `?? []`.** Absent is not the only thing it can be. A document is data, so `validations` can
  arrive as a string, and `?? []` hands that straight to a `for...of`.
- **What it costs:** nothing at the boundary -- a document with `validations: []` and one without both work
  as before. `duplicateNode` preserves whichever shape it was given rather than normalising.
- **Reversal:** one `?` and thirteen call sites.
- **When:** 2026-08-31.

### The boundary's fallback says it is the fallback

- **Decided:** `NodeBoundary`'s fallback emits `data-fs-failed=""` alongside the three attributes it
  already carried, and every render in `test/kit-contract.test.tsx` goes through one wrapper that records
  what the boundary caught, with an `afterEach` that fails the test if anything was.
- **Why:** the fallback emits `data-fs-key`, `data-fs-type` and `data-fs-scope` so a component that broke
  stays selectable, which is right and stays. The cost was that three contract rules read exactly those
  attributes to prove a kit renders, so the boundary answered for the kit. Measured: with one `kit-html`
  renderer replaced by `throw new Error()`, the contract suite passed 211 of 211.
- **Why both mechanisms:** the wrapper is what makes a rule added next year inherit the check instead of
  having to remember it. The attribute is what lets an individual rule fail on its own, so a rule moved to
  another file does not quietly lose its teeth. Either alone would have been the shape this run is about.
- **Rejected: dropping the attributes from the fallback.** It would make the contract honest by making a
  broken component unselectable in the designer, which is the failure the fallback was written to prevent.
- **Rejected: wiring `onError` per test.** Seventeen call sites, and the rule that needs it most is the
  one somebody adds in a hurry.
- **What it costs:** one attribute on a `div` nobody styles, and a wrapper component in one test file.
- **Reversal:** free.
- **When:** 2026-08-31.

### The demo server refuses a body nested deeper than core reads

- **Decided:** `bodyOf` measures the parsed body's depth with an explicit stack and returns nothing past
  `MAX_CONDITION_DEPTH`, which the existing 400 answers. `MAX_CONDITION_DEPTH` is now exported from
  `@formsmith/core`. `apps/demo-server/src/index.ts` also exports `app` and calls `serve` only when it is
  the file that was run, and takes its store path from `FORMSMITH_DEMO_STORE`.
- **Why:** bounding the six walkers did not close the endpoint. `JSON.parse` takes a hundred thousand
  levels without complaint because V8 parses iteratively; `JSON.stringify` does not, and throws past
  roughly five thousand. So a 12 KB body under a key the form collects validated clean, was projected by
  `submittedData`, and took the process down inside `c.json` — uncaught, a 500 with a stack trace. Size
  was never the thing protecting that route.
- **Why that bound:** an answer nested deeper than the evaluator walks cannot be compared against
  anything, so accepting it is agreeing to do work whose result is already known to be unreadable.
  Refusing at the door is what the rest of this project does with input it cannot honour.
- **Rejected: a `try`/`catch` around the response.** It catches the crash after the work, and it leaves
  the route answering 500 for a request that was never answerable. Refusing costs one pass over a body
  already in memory.
- **Rejected: lowering `MAX_BODY`.** 6 000 levels is 12 KB. No size cap anybody would accept stops this.
- **Rejected: testing the sequence rather than the route.** Reading the store, calling `validateAcross`
  and projecting by hand, in the test file, is a check on a copy of the endpoint — item 4 of the queue is
  a guard whose only call site is itself, and writing another one while fixing that would be absurd.
  Hence the export and the entry guard: `app.request(...)` runs the real handler and binds no port.
- **What it costs:** one exported constant, one env var nothing sets in normal use, and a `serve` that no
  longer runs on import. `node src/index.ts` was run and still answers 200 on `/api/forms`.
- **Reversal:** cheap in code. The behaviour change is a 400 where there was a 500, which nothing can be
  relying on.
- **When:** 2026-08-31.

### The condition walkers all stop where the evaluator stops

- **Decided:** `MAX_CONDITION_DEPTH`, exported from `condition.ts`, bounds all six: `same` through
  arrays, `evaluate` through `and`/`or`, `validateDocument`'s condition walker, `repointBinding`'s
  `inCondition`, and the ref collectors in `rows.ts`. `rowScopedRefs` and `formScopedRefs` are now one
  function taking the scope it wants.
- **Why one number:** `validateDocument` bounded at `MAX_TREE_DEPTH`, 500, would accept a condition
  `evaluate` reads as unreadable at 200 — a gate passing what the renderer cannot answer, which is the
  gate saying the opposite of what it exists to say. Two constants that agree today are the shape this
  run exists to remove.
- **Why merge the two ref collectors:** they were character-identical apart from one predicate reading
  `scope === 'row'` one way in one and the other way in the other. Neither was bounded, and both had to
  be found to know that. A symmetry that cannot be half-fixed is better than a symmetry somebody
  remembers to check.
- **What each answers past the bound:** `same` says not equal, because refusing would make `ne` true and
  show a component whose rule could not be read. `evaluate` says unreadable, which the boundary turns
  into hidden. `validateDocument` and `rowScopeProblems` report a problem, because a check that answers
  "nothing wrong" when what happened was "did not look" is the permissive failure this project is
  organised against. `repointBinding` returns the condition unrewritten, which its own doc comment
  already promised for every other unreadable shape.
- **Rejected: raising the bound instead.** The stack is the constraint, not the number, and 200 is
  already two hundred levels past anything the panel can draw in a 288px pane.
- **Reversal:** one constant and six call sites.
- **When:** 2026-08-31.

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

### A condition follows a copy only when it reads the context

- **Decided:** `repointBinding` rewrites a literal equal to the old key only inside a comparison that
  has a `context` operand in it. Everywhere else the literal is left alone, and the recursion covers
  the boolean operators and the `in`/`notIn` options list.
- **Why:** It rewrote every literal equal to the old key, while `duplicateNode`'s own comment said it
  did not and gave the reason: a condition testing an answer whose value happens to spell the copied key
  is about the answer, not the node. The function had been doing the opposite since it was written and
  the designer's rename inherited it, so renaming a component quietly rewrote conditions about answers.
  A literal names a node when it is compared against the host context, which is the shape a `Step` ships
  with (`context.step == 'welcome'`); it names a value when it is compared against a `ref`.
- **Rejected:** Rewriting nothing, which breaks the case the function exists for -- a duplicated `Step`
  shown by the original's name, so both render at once and the copy can never be reached. Also
  rejected: asking the kit whether a component is a `Step`, which core must not know.
- **Reversal:** Cheap. One predicate in one function, and the tests name both directions.
- **When:** 2026-08-31, on `build-out/review-b`. Found by writing the test the review said was missing,
  which is the second half of the rule failing against the code that claimed to implement it.

### A row-scoped ref to a form-level answer is reported at boot

`rowScopeProblems` reported two mismatches: a form-scoped ref to a key that only exists in a row, and a
row-scoped ref on a node outside every repeater. The third is a row-scoped ref _inside_ a repeater
naming a key no node in that row writes while a node outside every repeater does -- what you get by
dragging a conditional field into a repeater. It reads nothing, the condition is false, the component is
hidden, and its rules never run.

- **Decided:** `rowScopeProblems` reports a third mismatch: a row-scoped ref inside a repeater naming a
  key no node in that row writes while a node outside every repeater does.
- **Why:** It reads nothing, so the condition is false, the component is hidden, and its rules never
  run -- and that is what you get by dragging a conditional field into a repeater, which is an ordinary
  gesture rather than a hand edit.
- **Rejected:** Falling back to the form scope, which is the silent-permissive outcome `rows.test.ts`
  already asserted and stopped at. Also rejected: reporting any row-scoped ref whose key is not written
  in that row -- a row's data can carry keys no component authors, so it is reported only when the key
  demonstrably lives at the other scope.
- **Reversal:** Cheap. One more case in one reporting function; nothing downstream reads it.
- **When:** 2026-08-31, on `build-out/review-b`.

### The documented suite size is enforced by a reporter, not a test

- **Decided:** `test/count-reporter.ts` counts the tests that reported a result and fails the process
  when a document quotes a different figure. It skips itself on a filtered run and says which of the two
  it did.
- **Why:** Three documents quote how many tests there are and `docs.test.ts` compared them with each
  other, which is three files agreeing on a number that can be wrong in all three. No test can count the
  run it belongs to: the total is not known until every file has finished, and that is where a reporter
  stands.
- **Rejected:** A test that counts test files or `it(` occurrences, which counts the source rather than
  the run and cannot see a `describe.each`. Also rejected: silently skipping on a filtered run, because
  a skip that says nothing is indistinguishable from a pass.
- **Reversal:** Cheap. One reporter in `vitest.config.ts`; deleting it leaves the documents unchecked
  rather than wrong.
- **When:** 2026-08-31, on `build-out/review-b`.

### A control border is not a divider

- **Decided:** `--fs-control-border` is a token of its own, used by inputs, selects, textareas and
  buttons, clearing 3:1 on all three surfaces in both themes. `--fs-border` stays what it was.
- **Why:** Measuring the designer's own controls for the first time found them at 1.39:1 light and
  1.41:1 dark against the surfaces they sit on, where WCAG 1.4.11 asks 3:1 -- and a field's background is
  1.08:1 from the panel behind it, so the border is the only thing that says a control is there. A panel
  divider is decoration and 1.4.11 asks nothing of it.
- **Rejected:** Darkening `--fs-border` itself, which clears the ratio and turns the chrome into a grid
  of hard lines: every divider in the shell would carry a contrast meant for a control outline.
- **Reversal:** Cheap. One token, overridable by a host like every other.
- **When:** 2026-08-31, on `build-out/review-b`.

### Refused CSS stays in the box and out of the document

- **Decided:** The Style tab's raw editor keeps refused text in the textarea, flagged, and writes
  nothing to the document.
- **Why:** It told the author a value with a brace in it would not be applied and then committed it
  anyway, so the document carried declarations the renderer drops -- the "worst of both" the row's own
  comment warns about -- and a host reading `node.css` for itself got the unsanitised string.
- **Rejected:** Clearing the box on refusal, which makes the author retype what they wrote to correct
  one character. Also rejected: sanitising on the way in, because silently rewriting what an author
  typed is how a rule ends up meaning something nobody asked for.
- **Reversal:** Cheap, and it is the bargain `KeyField` already makes with a name that is taken: refuse,
  say why, correct in place.
- **When:** 2026-08-31, on `build-out/review-b`.

### The first pass is published, and both 2026-08-30 reviews are renamed

- **Decided:** `tmp/formsmith-review-2026-08-30.md` becomes
  `docs/reviews/2026-08-30-deep-review-a.md`, and `docs/reviews/2026-08-30-second-pass.md` becomes
  `docs/reviews/2026-08-30-deep-review-b.md`. Both are byte-identical, so the content every downstream
  document was written against is unchanged. Nothing downstream depended on the paths either: the
  queues, `triage.md` and `found.md` cite source locations such as `Canvas.tsx:439`, not lines in a
  review, so the rename does not reach them. This reverses **The second review is committed; the first
  one is not**, above.
- **Why:** four reviews now exist and only one of the four names said what it was. The provenance
  argument that kept the first pass in `tmp/` assumed it would stay in one working copy, which stopped
  being true the moment a fourth review compared all of them: a review the repository cannot open is a
  review nobody can check the others against.
- **What it costs:** a 1045-line audit naming three CRITICALs, including a confirmed document-to-CSS
  injection in the MUI kit, is now in the repository's history. All three were fixed by the first
  remediation run. The GitHub repository is private today and `CLAUDE.md` states the intent to publish
  under MIT, so the exposure is deferred rather than immediate: it lands the moment the repository is
  made public, and by then removing it is a history rewrite rather than a delete. That is the real shape
  of this cost and it is why it is worth writing down now rather than at publication. Michael was asked
  and chose to commit it, the same call he made for the second pass and on the same terms.
- **Rejected: renaming without publishing the first pass.** It leaves `triage.md` citing a path that
  exists on one machine, which is the failure the earlier entry was written about.
- **Rejected: rewriting the older records to the new paths.** `docs/decisions.md`, the two archived
  queues and `docs/reports/2026-08-31-symmetry-audit.md` still name the old paths on purpose. A decision
  log that edits itself to look consistent is no longer a record of what was decided, and
  `deep-review-b.md` cites the `tmp/` path twice in its own body, which `RUN.md` forbids editing. This
  entry records the mapping for all of them. Nothing redirects: a link to an old path 404s, and this is
  the page a reader lands on to find out where the file went.
- **Reversal:** two `git mv` commands and this entry, unless the exposure matters, in which case it is a
  history rewrite and expensive.
- **When:** 2026-09-02.
