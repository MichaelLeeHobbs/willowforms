# Build-out queue — remediating the 2026-08-30 second-pass review

Paste this to start or resume the run:

```
/goal Every item in docs/build-out/queue.md is checked off with its stated check passing and its own branch pushed. Print the full queue state, the branch you pushed for the item you just finished, and the current time at the end of every turn so this is judgeable from the transcript. Finishing an item means starting the next one, never stopping. Do not open background shells or subagents that outlive a turn. Follow docs/build-out/RUN.md.
```

## Run status

The mutable half of the resume pointer. `CLAUDE.md` carries only a stable pointer at this file, because
a status line in a file that calls itself repo facts only is a status line nobody updates.

- **Started:** 2026-08-31
- **Last completed:** item 26, the spec and guide MEDIUMs. Stage 4 is done; item 27 is next.
- **Run branch:** `build-out/review-b`, cut from `origin/main` at `a7ada7f`, which contains the prep (PR #25)
- **Last pushed item branch:** `build-out/b/26-spec-guides`
- **Work list:** `docs/reviews/2026-08-30-second-pass.md`, committed, so a worktree or a fresh clone has it

Keep all five current as items are ticked off.

---

**Frozen 2026-08-31.** Nothing may be added to this queue or dropped from it during the run. Work
discovered along the way goes to `docs/build-out/found.md`, which does not gate completion. A review
finding judged not worth fixing goes to `docs/build-out/triage.md` with a one-line reason, which counts
as handling it.

**Source:** `docs/reviews/2026-08-30-second-pass.md` — 542 findings, 4 CRITICAL / 52 HIGH / 174 MEDIUM /
171 LOW / 141 NOTE, across all 176 tracked files. Every item below names the review areas it covers, and
the union of the items is the whole review. Nothing is out of scope by omission.

**The anchor offset.** The review was written against `fd694d6` on `build-out/review-2026-08-30`. This run
is based on `origin/main`, which differs by exactly one hunk: `test/count-reporter.ts` on main walks
`apps/*/src/` and the reviewed tree does not. So the review's MEDIUM about that walker is already fixed on
the base, and every line number in `test/count-reporter.ts` after line 66 is three lower in the review than
in the code. No other file is affected. Verify that before trusting it — `git diff fd694d6 origin/main`.

## The standing gate

Every item's check includes all six, from the repository root, all passing:

```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

Plus, for every behavioural fix, **a test that fails against the code as it stands and passes after**.
Run it against the unfixed code first and say so in the transcript. Read
`.claude/skills/write-tests/SKILL.md` before writing one; twelve traps in it came from this repository,
and this review found four more guards that could not fail.

Plus, for every item, **its own pushed branch**. See the git section of `docs/build-out/RUN.md`.

---

## Stage 0 — the base

- [x] **0. Establish the base and prove the gate is green on it.**
      The prep landed on `build-out/b/00-prep`. Merge it, cut `build-out/review-b` from an updated main,
      and run the standing gate against the untouched base so that every later failure is attributable.
      Confirm the review copy at `docs/reviews/2026-08-30-second-pass.md` matches the source byte for byte
      and that `CLAUDE.md` carries the resume pointer.
      _Check:_ the six gate commands pass on the base with no source change, and
      `git log --oneline -1 build-out/review-b` shows a main that contains the prep.

## Stage 1 — the four CRITICALs

The whole reason this pass exists. All four are in code the first remediation run introduced, and all four
share one shape: **a fix landed on one side of a symmetry, or a guard was not re-checked against the code
the fix changed.** Fix the instance, then look for the twin before ticking the item.

- [x] **1. Close the `validateAcross` fail-open, and rule on the key class.** CRITICAL, review area 3.
      `validation.ts:705,709` merges into a plain object literal with `merged[key] ??= message`, so any
      error keyed with a name inherited from `Object.prototype` is discarded and the form reports as valid.
      `toString`, `valueOf` and `hasOwnProperty` all pass `KEY_PATTERN` and are not in `RESERVED_KEYS`, so
      nothing has to be bypassed. `validateForm` one function above uses `Object.create(null)` and explains
      why. Also the HIGH at `validation.test.ts:830`: the `__proto__` fix is pinned for one twin and not the
      other. **Two separate calls, both yours:** whether `Object.create(null)` alone is the fix, and whether
      the prototype names join `RESERVED_KEYS` — the second closes the class and breaks any document using
      such a key. Log both in `docs/decisions.md` with the compatibility cost stated.
      _Check:_ standing gate, plus a test that submits a document with a required field keyed `toString`
      and asserts `validateAcross` reports it, seen red first.

- [x] **2. Bound every recursive walker, not one of them.** CRITICAL plus four HIGHs, areas 2, 3 and 12.
      `tree.ts:936` (`visitShape`'s `condition()` walker, inside the function documented as total),
      `tree.ts:210` (`repointBinding`'s `inCondition`), `rows.ts:405,433` (`rowScopedRefs`,
      `formScopedRefs`), `condition.ts:33` (`same` drops `depth` through arrays), `condition.ts:280`
      (`evaluate` drops it through `and`/`or`, so `MAX_DEPTH` bounds only chains of `not`). Then the HIGH at
      `condition.test.ts:492`, which nests only `not` — the one recursion that already propagated depth, so
      the test proves the branch that never had the bug.
      _Check:_ standing gate, plus one table-driven test that drives each of the six walkers past its bound
      through the branch that lacks it and asserts a reported problem rather than a `RangeError`, every row
      seen red first. A 200 KB body must not reach `RangeError` on the demo server's submit endpoint.

- [x] **3. Make the kit-contract suite able to fail.** Two CRITICALs plus two HIGHs, area 15.
      `kit-contract.test.tsx:752-784` and `:786-815` read `data-fs-key`, `data-fs-type` and `data-fs-scope`
      off the rendered element, and the renderer's error boundary fallback emits all three
      (`renderer/src/index.tsx:286-296`), with no `onError` passed. A kit renderer replaced with
      `throw new Error()` passes the contract. The same mechanism voids `:849-865`'s
      `expect(...).not.toThrow()`. And `:499-513` asserts no role at all; its only expectation is a
      spelling check on a class name.
      _Check:_ standing gate, plus a mutation proof in the transcript. With one kit renderer replaced by a
      throw, the contract suite must go red, and the diff that proves it must be reverted before commit.

## Stage 2 — the guards that cannot fail

- [x] **4. Repair the designer CSS guard.** HIGH plus the guard hole, areas 13 and 10.
      `designer.css.test.ts:259-288` — the guard-of-the-guard written to stop `declarationsFor` reading only
      a selector's first block never calls `declarationsFor`. It re-implements the scan inline over a
      synthetic sheet with a different algorithm, and its only call site is the other test. And
      `reachesIntoTheForm` matches the `fs-shell` and `fs-canvas` prefixes per compound, so a rule wrapping
      the scope in `:where()` and descending to a bare `input` — the literal rule that broke MUI's notched
      outline — passes both assertions. Trap 12 applies: the guard still names `.fs-shell` and
      `.fs-canvas__surface` while the form renders inside `.fs-canvas__frame`.
      _Check:_ standing gate, plus a mutation proof. Add `:where(.fs-shell) input { border: 0 }` to
      `designer.css`, watch invariant 3 go red, revert.

- [x] **5. Repair the lint and CI guardrails.** HIGH plus MEDIUMs, area 10 and area 15's eslint slice.
      `no-restricted-imports` has no `ImportExpression` visitor, so `await import('@mui/material')` in the
      designer breaks invariant 2 and lints clean. `eslint .` never lints `aliases.ts`, the file `CLAUDE.md`
      calls load-bearing. `eslint.config.test.ts:69-80` exercises invariant 2 only against a `.ts` file
      while 16 of the designer's 22 non-test sources are `.tsx`. `ci.yml:73` omits `kit-html` from the
      "every package emitted `dist`" loop, and line 77 checks only `designer.css` while
      `copy-assets.mjs` also emits `kit-html.css`, which that package's `exports` map publishes.
      _Check:_ standing gate, plus three mutation proofs: a dynamic MUI import in a designer `.tsx` fails
      lint, a deliberate error in `aliases.ts` fails lint, and deleting `packages/kit-html/dist/index.js`
      fails the CI artefact step, run locally.

- [x] **6. Repair the counting, documentation and contrast guards.** HIGHs and MEDIUMs, area 15.
      `test/count-reporter.ts` — the base already walks `apps/`, so confirm rather than re-fix, then handle
      the rest: the `\d{2,4}` capture silently covers nothing past 9 999 tests, `onFinished` is the vitest 2
      API, and `ran === 0` makes the reporter inert on a run that executed nothing.
      `docs.test.ts:39-45,109-121` — two of the five documents in `DOCS_WITH_COUNTS` quote no total and the
      check cannot notice. `contrast.test.ts:152-166` asserts only `--fs-control-border` while real controls
      draw their only boundary with `--fs-border` at 1.39:1. Also the `accessibility.md` lowest-pair row:
      `#b26a00` on `#ffffff` is 4.24:1, documented as 4.83:1, and the pair is asserted at
      `contrast.test.ts:225`.
      _Check:_ standing gate, plus: a document in `DOCS_WITH_COUNTS` that quotes no total fails the run, and
      every border token in `designer.css` is either asserted or listed with a reason.

- [x] **7. The symmetry and guard-recheck audit.** The process finding, and the highest-value item here.
      All four CRITICALs and several HIGHs are the same mistake: a fix applied to one of two twins, or a
      guard not re-checked against the code the fix changed. Cross-cutting theme 1 names ten pairs; theme 2
      names four comments that describe an intent the code does not carry out. Walk the first remediation
      run's 32 commits and, for each fix, name the twin and say whether it was fixed. For each guard that
      run touched or added, prove by mutation that it can still fail.
      _Check:_ standing gate, plus `docs/reports/2026-08-31-symmetry-audit.md` listing every pair examined
      with a verdict, and a mutation result for every guard the first run added. An entry saying "no twin"
      is a legitimate verdict; a pair that was never looked at is not.

## Stage 3 — the remaining HIGHs

- [x] **8. core HIGHs.** Areas 2 and 3. `tree.ts:282` — `duplicateNode` spreads `node.schema.validations`
      unguarded while `validateDocument` allows it to be absent, so the gate passes a document the duplicate
      action then crashes on. `validation.ts:134-140,228` — the ReDoS guard treats a bounded quantifier
      wrapping an unbounded one as safe, so `(a+){10}b` compiles and runs. `validation.ts:322,416` — the host
      evaluator is called with no `try`/`catch` in `guardPasses` and in the `custom` rule, so a throwing
      expression escapes `validateForm`; `visibility.ts` wraps the same call and explains why.
      _Check:_ standing gate, plus a test per finding, each seen red first.

- [x] **9. renderer HIGHs.** Area 4. `renderer/src/index.tsx:459` — `NodeBoundary` wraps only the kit's
      `<Component>`, not `RenderNode`'s own body, so the blast-radius guarantee in its doc comment does not
      hold and the document root has no boundary at all. `:169` — the host evaluator is called with no
      `try`/`catch`, unlike every other render-time evaluator call site in the project.
      _Check:_ standing gate, plus a test that throws from `RenderNode`'s own body and from the evaluator and
      asserts the fallback rather than a blank tree, seen red first. Coordinate with item 3: the boundary
      must stay able to fail the contract suite.

- [x] **10. The designer's keyboard model in the state it is actually in.** HIGH plus two e2e HIGHs,
      areas 6 and 16. `Designer.tsx:219-232` exempts `input, textarea, select, button` from the focus-steal
      guard on the theory that anything taking focus keeps it, while `Canvas.tsx:321-325` deliberately
      `preventDefault`s exactly that. Clicking a field selects the component, leaves the shell unfocused,
      and Delete, Ctrl+Z and Escape all silently do nothing. `e2e/canvas.spec.ts:80` never checks the "type
      into it" half of its own name; `e2e/keyboard.spec.ts:7` claims to check tab order and no spec in
      `e2e/` ever presses Tab.
      _Check:_ standing gate, plus an e2e test that clicks a field on the canvas and then presses Delete,
      with no `.focus()` anywhere in it, seen red first, and a Tab-order spec that walks the shell.

- [x] **11. Carry row identity through the drag pipeline.** Three HIGHs plus theme 3, areas 7 and 16.
      `geometry.ts:30-41,177-189` — `Candidate` carries no row even though `measureTree` emits one candidate
      per drawn element, so every consumer conflates elements from different repeater rows.
      `dnd.ts:138-186` — `resolveDrop` scans a list interleaving children from every drawn row and computes
      the wrong insertion index. The same missing field: the hover frame measures without a row and outlines
      row 0, `selectedRow` is never cleared on a tree selection, and the boundary fallback omits
      `data-fs-row`. `e2e/viewport.spec.ts:82` — the only drop-targeting check at mobile width is satisfied
      by a `resolveDrop` that ignored the pointer entirely.
      _Check:_ standing gate, plus a fixture where `key !== dataKey` and a repeater draws two rows (trap 11)
      asserting the insertion index in row 1 differs from row 0, seen red first.

- [x] **12. The drag lifecycle.** Two HIGHs, area 7. `drag.ts:239-243,216` — the `abandoned` flag raised by
      the window-blur path has no matching `pointerup`, so it survives to the next unrelated gesture and eats
      one click. `Tree.tsx:117-123` — `onRowPointerDown` arms a drag for any pointer button, so a right-press
      plus four pixels reparents the component; both other `begin` call sites guard `event.button` and both
      carry a comment describing this exact bug.
      _Check:_ standing gate, plus a test per finding, each seen red first.

- [x] **13. The inspector panels' HIGHs.** Areas 8 and 9, plus theme 4. `Properties.tsx:661` — the `select`
      editor hands `optionValue` unwrapped values, so its declared-value pass never matches and it returns
      the raw string, the exact bug the comment above it claims to have fixed. `Properties.tsx:344` —
      choosing "Always" after authoring a condition destroys it with no undo path, because both writes carry
      the single `renderWhen:<key>` coalescing label and so replace the entry holding the condition; every
      write on the Rules tab shares one label the same way. `ConditionEditor.tsx:482,531` — the membership
      options box spells lines with `jsonToString`, which returns the empty string for objects, arrays and
      `null`. `Binding.test.tsx:378` — the position-based removal fix is pinned, the "Right to left" checkbox
      on the same row still matches by tag, and the bug is live. `store.ts` — `setDataKey` never calls
      `keyProblem`; its only call site is `renameKey` at :446.
      _Check:_ standing gate, plus a test per finding, each seen red first. The undo one must assert the
      condition is reachable by undo **and** redo.

- [x] **14. demo-server HIGHs.** Area 10. `:207-216` — the lost update the comment at :92-98 claims to have
      fixed is live: the read-modify-write straddles an `await` and only the write half is serialized.
      `:159-167` — `MAX_BODY` is not a body limit; `await c.req.text()` buffers the whole stream before
      `text.length` is compared. `:344` — for a multi-step document the echoed payload drops every step but
      the first, because `submittedData` runs one projection under step one's conditions while
      `validateAcross` validated all scopes.
      _Check:_ standing gate, plus a concurrent-write test that loses no update, a body-limit test that
      rejects before buffering, and a two-step submit whose echo carries both steps, each seen red first.

- [x] **15. Decide what unit a length prop carries, in the kit contract.** The fourth theme of the executive
      summary, areas 4 and 5. `gap` is CSS pixels in `kit-html` and MUI spacing multiples in `kit-mui`, and
      pixels again on `kit-mui`'s own `Grid`, so every gap is eight times larger across kits. The contract
      says a document authored against one kit renders against the other and never says what unit a length
      carries, so neither kit is wrong and the fix belongs in `docs/spec/02-kit-contract.md`. Your call which
      kit's existing documents reflow; log it with the reflow cost stated.
      _Check:_ standing gate, plus a contract test asserting the unit for every length-valued prop in both
      kits, and the spec section that states it.

- [x] **16. Make the four published READMEs work.** HIGHs and MEDIUMs, area 18.
      `packages/renderer/README.md:22` ships `{ ...data, [key]: value }`, the anti-pattern the source warns
      against by name, which inside a repeater creates a literal property called `addresses[1].line1` and
      drops every row answer. The designer and renderer READMEs import `@formsmith/kit-mui` from an install
      line that does not include it and cannot, because the lint config forbids the transitive dependency.
      Both kit READMEs advertise 8 components; both kits ship 27.
      _Check:_ standing gate, plus a test that extracts every fenced `ts`/`tsx` block from every published
      README, typechecks it against the built packages, and fails on an import the install line omits.

- [x] **17. The specification's HIGHs.** Area 17, plus one export and one line of `CLAUDE.md`.
      `docs/spec/12-api.md:239` names `rowScopeProblems` as a boot-time check and it is not exported from
      `@formsmith/core`. Export it, or correct the document, and say which and why.
      `02-kit-contract.md:118,129` understates what is enforced in both directions: it says no test checks
      `aria-invalid` and one does against every kit, and its five accessibility obligations omit a sixth the
      suite enforces. `03-components.md:200` still lists a Step component as absent while the catalogue, the
      Steps section and both kits say it exists. `01-document-model.md:52` says nothing reads `version`,
      contradicted by its own preamble and the code. `README.md:54`'s own status rule is violated by
      `03-components.md`. `CLAUDE.md:66` claims CI checks every package emitted `dist`.
      _Check:_ standing gate, plus `docs.test.ts` extended so that a spec claim about what a test enforces is
      itself checked, at least for the `aria-invalid` and `required` obligations.

- [x] **18. The test suites' remaining HIGHs.** Areas 11, 12, 14 and 16.
      `tree.test.ts:401` (nothing asserts `removeNode` leaves its input unchanged, so invariant 4 is
      undefended for the one operation that deletes), `tree.test.ts:57` (`generateKey` covers only
      `TextField`, so the sanitising branch that exists because of a named incident is untested),
      `rows.test.ts:155` (asserts as correct that a repeater whose value is not a list has every rule inside
      it skipped silently), `validation.test.ts:689` (the collision test's two components are keyed
      `nickname` and `nickname2`, so no collision occurs), `validation.test.ts:53` (invariant 5's enforcement
      covers 6 of 9 rules and one shape of empty), `css.test.ts:140` (refusal tested for the `any` layer
      only), `Properties.test.tsx:308,1044,1082` (no forbidden data key is ever tried; `ConditionEditor`'s
      only suite never clicks "Add condition"; the uncommitted-draft test produces no draft),
      `renderer.test.tsx:678` (cannot fail, for two independent reasons).
      _Check:_ standing gate. Each repaired test seen red against the code as it stands before it is fixed;
      where the repair exposes a product bug, fix the product too.

## Stage 4 — the MEDIUMs

174 findings. Each item is a slice of the review; the check is the standing gate plus every finding in the
slice either fixed or in `triage.md` with a one-line reason.

- [x] **19. core MEDIUMs.** Review areas 1, 2 and 3, 22 findings across `types.ts`, `factory.ts`, `keys.ts`,
      `kit.ts`, `language.ts`, `json.ts`, `schema.ts`, `tree.ts`, `rows.ts`, `validation.ts`, `condition.ts`,
      `visibility.ts`, `context.ts` and `css.ts`. Includes `schema.ts:238`'s `__proto__` accumulator and
      `json.ts:84`'s dropped bare-string labels.
- [x] **20. renderer and both kits, MEDIUMs.** Areas 4 and 5, 17 findings. Includes the unverified
      `inputProps` deprecation on MUI 7, which needs `@mui/material@7` installed and the assertion re-run.
- [x] **21. designer shell, store, left pane, remaining panels and stylesheet, MEDIUMs.** Areas 6 and 9,
      20 findings. Includes `designer.css:855`'s `revert` where `initial` was meant, which needs
      `getComputedStyle` in a real browser to settle, and the duplicate `.fs-tree__row` blocks the file's own
      comment says were eliminated.
- [x] **22. designer drag, canvas, selection, tree and editors, MEDIUMs.** Areas 7 and 8, 15 findings.
- [x] **23. apps, build, lint config and CI, MEDIUMs.** Area 10, 13 findings. Includes nothing in CI ever
      loading a `dist`, and `copy-assets.mjs`'s hand-maintained asset list tied to nothing.
- [x] **24. core and cross-cutting test suites, MEDIUMs.** Areas 11, 12 and 15, 30 findings.
- [x] **25. designer, renderer and Playwright suites, MEDIUMs.** Areas 13, 14 and 16, 34 findings.
- [x] **26. spec and guides, MEDIUMs.** Areas 17 and 18, 23 findings.

## Stage 5 — the LOW and NOTE findings

312 findings. Triage is expected to carry a large share of these, and a triage line with a reason counts as
handling one. It is the only honest way to close out three hundred findings.

- [ ] **27. core and both kits.** Areas 1 to 5, 67 findings.
- [ ] **28. the designer.** Areas 6 to 9, 69 findings.
- [ ] **29. the apps, the build, the lint config and CI.** Area 10, 54 findings. Includes `forms.json.tmp`
      missing from `.gitignore`, `cspell.json` being 40 lines of configuration no script runs, the Node
      engines drift between the root, the five packages and `CLAUDE.md`, and the CI job having no
      `timeout-minutes`.
- [ ] **30. core and cross-cutting test suites.** Areas 11, 12 and 15, 23 findings.
- [ ] **31. designer, renderer and Playwright suites.** Areas 13, 14 and 16, 58 findings.
- [ ] **32. the spec, the guides and the working notes.** Areas 17 and 18, 41 findings. Includes the
      `SKILL.md` e2e count saying 65 against 68 actual, and the policy call already made:
      `apps/playground/src/sample.ts:51-52` loses the competitor's name and keeps the engineering point.

## Stage 6 — close out

- [ ] **33. Close the run.** Remove the resume block from `CLAUDE.md`. Write the digest to
      `docs/reports/2026-08-31-second-pass-remediation.md`: what the findings turned out to be, what a user
      of the designer would notice, which guards can now fail that could not, what was refused and why, and
      what is left. Open the final PR for stage 6 and hand over `found.md`.
      _Check:_ standing gate, `CLAUDE.md` contains no `build-out` pointer, the digest exists, every item
      above is ticked, and every finding in the review is fixed or in `triage.md`.
