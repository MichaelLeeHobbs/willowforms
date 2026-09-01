# Build-out queue — remediating the 2026-08-31 deep review

Paste this to start or resume the run:

```
/goal Every item in docs/build-out/queue.md is checked off, with its stated check passing and its pull request merged after a Copilot review was read and answered. At the end of every turn print the current time, the full queue state, and for the item you just finished: its PR number, its `git diff --stat` totals against main, whether Copilot reviewed it, and how each Copilot finding was answered. Finishing an item means starting the next one, never stopping. Do not open background shells or subagents that outlive a turn. Follow docs/build-out/RUN.md.
```

## Run status

The mutable half of the resume pointer. `CLAUDE.md` carries only a stable pointer at this file.

- **Started:** 2026-08-31
- **Last completed:** item 30, merged as #65 on 2026-09-01. Items 1-28 and 30 are merged; 29 and 31
  are in review as #64 and #66; 32-41 are built and waiting for a slot.
- **How to read the ticks:** an item is ticked when its pull request has merged, not when it is
  written. Three may be open at once -- `RUN.md` says why -- so the last ticked item is not always the
  last one worked on.
- **Base:** every item branches from an updated `origin/main` and merges back into it. There is no
  long-lived run branch this time, and that is the point — see **Why this queue is shaped like this**.
- **Open PR:** none
- **Work list:** `docs/reviews/2026-08-31-deep-review.md`, committed by item 0

Keep all five current as items are ticked off.

---

**Frozen 2026-08-31.** Nothing may be added to this queue or dropped from it during the run. Work
discovered along the way goes to `docs/build-out/found.md`, which does not gate completion. A finding
judged not worth fixing goes to `docs/build-out/triage.md` with a one-line reason, which counts as
handling it.

**Source:** `docs/reviews/2026-08-31-deep-review.md` — 416 findings, 0 CRITICAL / 43 HIGH / 129 MEDIUM /
144 LOW / 100 NOTE, across all 179 tracked files. Every item below names the review sections it covers,
and the union of the items is the whole review. Nothing is out of scope by omission.

**The anchor offset.** The review was written against the tree at `56ed72c`. Line numbers in it are that
tree's. Item 0 commits the review unmodified, so every citation stays resolvable; after that, expect
drift and locate findings by their quoted code rather than by line number.

---

## Why this queue is shaped like this

The previous run bundled 33 items into 7 stage pull requests. Copilot reviewed them like this:

| PR  | Size                  | Copilot comments |
| --- | --------------------- | ---------------- |
| #28 | 17 files / 940 lines  | 0                |
| #29 | 54 files / 3342 lines | 0                |
| #30 | 96 files / 5875 lines | 3                |
| #31 | 96 files / 2958 lines | 1                |
| #32 | 7 files / 186 lines   | 3                |

Two of those PRs got no review at all and were merged anyway. A large diff does not get a shallow review
from Copilot, it gets no review, and the PR still looks reviewed from the outside because a bot posted
something. So this run trades stage batching for one pull request per item, sized to be read.

**The size budget, per pull request: at most 12 changed files and at most 500 changed lines.** Check it
with `git diff --stat main...HEAD` before opening the PR. An item over budget is delivered as two or three
pull requests instead — splitting how an item ships is not editing the queue, and the item is not ticked
until all of its PRs are merged. The queue may never be delivered in **fewer** PRs than it has items.

A within-budget PR that Copilot reviews with zero comments is a real result; tick it. An over-budget PR
with zero comments is not evidence of anything, and the fix is to split it and re-open, not to merge it.

Item 0 is the one exemption, and it is stated rather than assumed: it commits the 1229-line review
verbatim, which cannot be split and is not code anybody should review line by line. Every other item is
in the budget or ships as more than one pull request. No later item may claim this exemption.

---

## Per-item procedure

Every item, without exception:

1. `git fetch origin && git switch -c build-out/c/<nn>-<slug> origin/main`
2. Write the failing test first wherever the finding is a source defect. A test-gap finding is itself a
   test to write. Several findings say in as many words that deleting a guard leaves the suite green;
   that sentence is the test's specification.
3. Fix. Run the gates the item names.
4. `git diff --stat main...HEAD` — under budget, or split.
5. Push, `gh pr create`, wait for CI **and** for the Copilot review.
6. Read every Copilot finding. Fix it or refute it in a reply on the thread. Do not merge with an
   unanswered one. After pushing fixes, re-request the review — a comment only re-checks findings already
   open; only `gh api -X POST repos/:owner/:repo/pulls/N/requested_reviewers -f "reviewers[]=copilot-pull-request-reviewer[bot]"`
   looks at the new code.
7. Merge, tick the item here, update **Run status**.

---

## The queue

### Block 0 — the base and the gate that cannot fail

- [ ] **0. The base.** Commit `docs/reviews/2026-08-31-deep-review.md` unmodified, this queue, `RUN.md`,
      the `CLAUDE.md` resume pointer, and archive the previous queue with a "do not run" header
      (`archive/queue-2026-08-30-first-pass.md` NOTE).
      **Check:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && node scripts/check-dist.mjs && pnpm e2e` all green on the base, and the transcript says so. This is the
      only item whose PR may be docs-only, and the only one exempt from the size budget.

- [x] **1. The lint gate, first, because everything after it is gated by it.**
      `eslint.config.js:141` (HIGH, three `react-hooks` rules ship as `warn`), `package.json:15` (HIGH,
      `eslint .` with no `--max-warnings 0`), `test/eslint.config.test.ts:201` (HIGH, records `ruleId` and
      discards `severity`), `eslint.config.js:59-66` (MEDIUM, `ImportExpression[source.value=…]` misses a
      template literal), `eslint.config.test.ts:45-183` (MEDIUM, four of five `COMPONENT_LIBRARIES`
      untested), `eslint.config.js:73` (MEDIUM, `coverage/` missing from `ignores`),
      `eslint.config.js:111,139` (LOW, `test/**/*.tsx` out of reach), `eslint.config.test.ts:247-257`
      (LOW, message text unasserted), `:33` (NOTE, fixture cleanup).
      **Check:** `pnpm lint` fails on a deliberately introduced `exhaustive-deps` warning, then passes with
      it removed; a new case in `eslint.config.test.ts` fails when invariant 1's rule is downgraded to
      `warn`; a new case reports on ``import(`@mui/material`)``.

### Block 1 — the three findings that end in a form reporting success over wrong data

- [x] **2. `validateForm` is the only unbounded walk in core, on the only path that runs server-side.**
      `validation.ts:644` (HIGH) and the false comment at `:806-808`; `depth.test.ts:98` (HIGH, the
      `WALKERS` table states its own completeness rule and omits this walker); `validation.test.ts` whole
      file (HIGH, no test drives either walk deep).
      **Check:** a new `depth.test.ts` row for `validateForm` fails before the fix with `RangeError` and
      passes after; a new `validation.test.ts` case pins that `validateForm` and `submittedData` agree
      about a tree deeper than 500.

- [x] **3. `KeyField` edits the previously selected component.**
      `Properties.tsx:74` (HIGH), `Inspector.tsx:46-50` (MEDIUM, no panel is keyed on the selection and
      the safety of the whole inspector rests on eight independent re-sync guards),
      `Properties.test.tsx:127` (HIGH, no test ever re-renders the panel with a different selected node).
      Decide and log whether the repair is a `key` on the panel, a re-sync guard on `KeyField`, or both;
      the review argues the key is the one that also protects the ninth editor nobody has written yet.
      **Check:** a new test selects `email`, then `phone`, and asserts the Key box reads `phone`; a second
      deletes `email` while `phone` is selected and asserts committing the box does not rename `phone`.
      Both fail before the fix.

- [x] **4. The server-parity section documents a snippet that silently accepts invalid submissions.**
      `docs/spec/08-validation.md:213-241` (HIGH) and the same false claim in the code comment at
      `apps/demo-server/src/index.ts:414`; `08-validation.md:184-190` (LOW, `NOT_A_LIST` undocumented).
      The demo server uses `validateAcross`/`submittedAcross` per scope and the documented snippet returns
      `{}` for a wizard submission missing every required answer.
      **Check:** `pnpm test` (`test/docs.test.ts`), plus a new assertion that the parity section names the
      functions `apps/demo-server/src/index.ts` actually imports.

### Block 2 — core, the submit path

- [x] **5. Totality on the submit walk.** `validation.ts:713` (MEDIUM, `children: 5` is not iterable at
      four sites), `:477` (MEDIUM, `applyRule` dereferences a rule before checking it is one),
      `visibility.ts:60` (LOW, `isVisible` has no node guard and is the first thing the walk calls);
      `validation.test.ts` whole file (HIGH, no malformed-`children` row for either submit function),
      `visibility.test.ts:269-275` (MEDIUM, `{kind:'condition'}` with no `condition`).
      **Check:** new rows drive `validateForm`, `submittedData` and `isVisible` on `children: 7`,
      `children: {}`, `children: [null]` and `validations: [null]`; each fails before the fix.

- [x] **6. Four rules that silently pass when their value is missing.** `validation.ts:504` (MEDIUM,
      `minLength`/`maxLength`/`min`/`max` pass on a valueless rule while `pattern` one line below got the
      guard); `validation.test.ts:102-114` (MEDIUM, invariant-5 table omits `{}` and the `custom` row is
      near-vacuous); `validation.test.ts:1695` (MEDIUM, the row cap is pinned for `validateForm` and not
      for the projection).
      **Check:** a table over the four rules with `{"key":"min"}` and no `value` fails before the fix;
      invariant 5 gains its `{}` row and a live-evaluator `custom` row.

- [x] **7. The ReDoS analysis and the test that cannot notice.** `validation.ts:263` (MEDIUM,
      `nestedUnbounded` misses `(?:(a+))+`), `:218` (MEDIUM, alternation is never inspected — decide and
      log whether to detect it or to document the limit honestly, and say what a deployer should do);
      `validation.test.ts:1181-1189` (MEDIUM, the test named for the hole asserts a benign pattern),
      `:1648-1655` (LOW, `patternProblem` asserts only `toBeDefined`).
      **Check:** `(?:(a+))+` and `((a+))+` are refused; the "does not catch every blowup" test asserts the
      shape its own comment names; the two author-facing sentences are pinned by text.

- [x] **8. `submittedAcross` and the prototype key names.** `validation.test.ts:907` (HIGH, the block
      drives `validateAcross` only and `submittedAcross` has no test of any kind); `validation.ts:670`
      (LOW, `NOT_A_LIST` clobbers the repeater's own rule failure), `:749` (LOW, `autoValidateKeys` walks
      with `flatten`), `:718` (LOW, null-prototype objects returned to a host), `:327` (LOW, full pattern
      re-analysis per value), `:130` (NOTE, stacked JSDoc).
      **Check:** answers keyed `toString`, `valueOf`, `constructor`, `hasOwnProperty` and `isPrototypeOf`
      survive `submittedAcross`; the test fails against `const merged: FormData = {}`.

- [x] **9. `tree.ts` walkers: totality and depth.** `tree.ts:114-127` (HIGH, `flatten` is neither total
      nor bounded and runs in a React render body on a host document core deliberately does not refuse),
      `:64-94, 376, 430, 475` (MEDIUM, `findNode`/`pathTo`/`updateNode`/`removeNode`/`duplicateNode`
      share the gap); `tree.test.ts:2072` (HIGH, the `flatten` describe pins the happy path only).
      **Check:** every one of those six functions is driven on `children: {}`, `children: 5`,
      `children: "ab"` and a 50 000-deep tree; each row fails before the fix.

- [x] **10. `tree.ts` remainder, and the gate's own test gaps.** `:188-198, 322` (LOW, `duplicateNode`
      can return a copy keeping its source's key), `:188-198` (LOW, `copyKey` unbounded by
      `MAX_KEY_LENGTH`), `:511-524` vs `442-464` (LOW, the leaf guard was added to `moveNode` only),
      `:430-436` (LOW, `updateNode` walks each subtree twice), `:42-47, 129-133` (LOW, an array passed to `fn` as a node), `:895-931` (NOTE, layering), `:780-795` (NOTE), `:772…1323` (NOTE, `JSON.stringify`
      breaks "never throws"); `tree.test.ts:1570` (MEDIUM, the `found` flag proof is vacuous), `:1952`
      (MEDIUM, four `malformed` branches untested anywhere), `:786` (LOW), `:184` (LOW, `moveNode` has no
      immutability assertion), `:2035` (NOTE).
      **Check:** deleting any one of the four named `malformed(...)` calls turns a test red; a duplicate-key
      plus no-op-update case pins the `found` flag; `moveNode` gains its invariant-4 assertion.

- [x] **11. `schema.ts`: a depth bound that is defeated.** `:379` (MEDIUM, the schema-carrying branch
      recurses with depth reset to zero and the repeater branch re-enters `objectFor`), `:334` (MEDIUM,
      the walk has none of `walk`'s totality guards while `unexportableRules` in the same file borrows
      them), `:262` (LOW, rootless document), `:198` (LOW, `min`/`max` exported onto any type and reported
      lossless), `:117` and `:272` (NOTE); `schema.test.ts:770-778` (HIGH, the deep fixture takes the one
      bounded branch), `:698` (HIGH, `children` never varied), `:401-425` (MEDIUM, collision check never
      asked about a row), `:725-743` (MEDIUM, mirror keyword cases).
      **Check:** 50 000 nested repeaters and a 50 000-deep chain of schema-carrying nodes both survive
      `toJsonSchema`; a top-level `email` and a row-level `email` are not reported as colliding.

- [x] **12. `rows.ts`, and the two definitions of a repeater.** `:223` (MEDIUM, `keyScopesFor` takes the
      first match _with an enclosing repeater_, not the first match, against its own comment), `:459-461`
      (LOW, `isRowScopeNode` disagrees with `isRowScope` for a truthy non-array `children`), `:308-315`
      (LOW, `formKeys`), `:260` (LOW, `MAX_TREE_DEPTH` redeclared), `:349-449` and `:125-147` (NOTE);
      `rows.test.ts:173` (MEDIUM, the only test of the rule cannot tell the two implementations apart),
      `:975` (LOW), `:27` (NOTE).
      **Check:** a fixture with `schema.type: 'array'` and `children: 5` gets the same answer from both
      predicates; a fixture with a form-level `x` before a row-level `x` pins which one `keyScopesFor`
      resolves.

- [x] **13. `css.ts`: the backslash bypass.** `:71` (HIGH, `FORBIDDEN` does not treat `\` as significant,
      so `background:\75 rl(https://…)` reaches the page — the exfiltration channel the file's own comment
      says was closed), `:118` (MEDIUM, `quotesBalanced` skips the character after a backslash and a
      trailing `\` swallows every later rule), `:251` (MEDIUM, `styleSheetFor` throws on a non-string
      `key` inside the renderer's `useMemo`); `css.test.ts:603-620` (HIGH, the malformed block varies
      `children` and the key is what throws), `:515-529` (HIGH, no fixture puts a backslash in a
      declaration block), `:405-417` (LOW, the `i` flag unasserted), `:456-473` (LOW).
      **Check:** `\75 rl(` and `\5c 75 rl(` are refused; `color:red\` is refused; a node with `key: 42`
      and a `css` block does not throw; each fails before the fix.

- [x] **14. Core's third-party seams and its published surface.** `factory.ts:87` (LOW, `def.type`
      unhardened where its two neighbours are), `:38` (NOTE, argument order); `kit.ts:152,181` (LOW,
      `indexKit`/`groupKit` unguarded inside three render bodies); `index.ts:63, 88-105` (LOW, three
      exports the shipped `.d.ts` tells consumers to use); `types.ts:248-259` (MEDIUM, the comment claims
      a compiler enforcement TypeScript does not provide), `:131-134` (NOTE); `factory.test.ts:17`
      (MEDIUM, the prototype-pollution defence untested), `:18` (LOW); `keys.test.ts:89` (NOTE,
      set-equality); `packages/core/package.json:5,15-21` (LOW, no `LICENSE` in the tarball) and `:9-14`
      (NOTE); `packages/core/tsconfig.json:10` (NOTE, `*.test.tsx` not excluded);
      `packages/core/README.md` ×2 (NOTE).
      **Check:** `instantiate` survives a `defaultProps` key of `__proto__` and a def with no `type`;
      `indexKit`/`groupKit` survive `components: {}`; `npm pack --dry-run` lists a licence file.

- [x] **15. `condition.ts` and `context.ts`.** `condition.ts:25` (LOW, past the bound `same` returns
      `false`, making `ne`/`notIn` true), `:233` (LOW, the four ordering operators answer `false` rather
      than unreadable, so `not(gt(…))` shows a component on a comparison that never happened);
      `context.ts:40` (LOW, `MAX_CONDITION_DEPTH` redeclared), `:258` (LOW, `contextValues` truncates
      silently and `validateAcross` then never runs a pass for the steps beyond the cap);
      `context.test.ts:496-525` (HIGH, the only deep fixture nests through `not`, the branch that never
      had the bug), `:606-615` (LOW), `:638-644` (LOW); `condition.test.ts:166-174` (MEDIUM), `:150-159`
      (LOW), `:188-193` (LOW).
      **Check:** deleting `+ 1` from either `conditions` loop in `context.ts` turns a test red;
      `not(gte(answer, 5))` against `"5"` is pinned.

- [x] **16. `language.ts` and `json.ts`, and the duplicate option value.** `language.ts:26` (LOW, a
      non-string `dialect` validates clean and every translation renders as its raw key); `json.ts:45`
      (LOW, plain lookups where the rest of the package reads own properties) and (NOTE, `?? undefined`);
      `json.test.ts:54` (HIGH — a live source defect: `optionEntry` mints a duplicate `'0'` for
      `[{label:'A'}, {label:'B', value:0}]`, so picking A submits B's answer, and the round-trip test
      never calls the function that produces the spelling), `:210` (NOTE).
      **Check:** a test drives `optionEntry` and `optionValue` as actual inverses over a mixed option
      list; it fails before the fix.

### Block 3 — the designer

- [x] **17. `store.ts`: undo labels that destroy the entry they should stack on.** `:403` (HIGH,
      `setProp`'s label omits the binding kind, so a mode switch or a Reset after typing replaces the
      typed value in `past` and `present` at once — this file has already fixed the same defect twice
      elsewhere), the same shape at `:707` and `:745`; `store.test.ts:23` (MEDIUM, the non-mutation
      assertion exists for `commit` and for neither `undo` nor `redo`).
      **Check:** type a label, switch the binding mode, Ctrl+Z — the typed label comes back. Rewriting
      `undo` to `past.pop()` turns a test red.

- [x] **18. `store.ts`: a rename that re-points nothing that names it.** `:557` (HIGH, `renameKey` moves
      the node's data key and every condition elsewhere testing that field silently stops matching, which
      also stops `validateForm` checking anything under it on the server), `setDataKey` at `:734-746`
      from the other direction, `:536` (LOW, decides against the render closure and writes through
      `apply`). `docs/build-out/found.md` already records this as a product decision with four defensible
      answers — that entry is now in scope; pick one, log the cost, and delete the entry.
      **Check:** a Paragraph whose `renderWhen` reads `email` still renders after `email` is renamed; a
      test pins whichever answer was chosen, including the refusal path if that is the answer.

- [x] **19. `store.ts` remainder and the designer README.** `:333` (MEDIUM, the `[initial]` effect re-runs
      on every keystroke for a host following the documented pattern), `:387` (MEDIUM, a refused insert
      still moves the selection and is announced as a success), `:216-231`, `:268`, `:305` (NOTE);
      `store.regressions.test.ts:481` (LOW, the test passes because the second duplication is refused),
      `:19` (NOTE); `store.test.ts:1` (MEDIUM, the enumerated uncovered list — `duplicateComponent`'s four
      refusals, `setLanguages`' empty guard, `containerFor`, `MAX_HISTORY` at the hook level);
      `packages/designer/README.md:18-23` (MEDIUM, the only example is the controlled-component contract
      the designer does not honour).
      **Check:** a refused insert announces nothing and moves no selection; the four `duplicateComponent`
      refusals each have a test.

- [x] **20. `keyboard.ts`: the `left` branch reverts to the key match the file argues against.**
      `:145` (HIGH — traced on the repo's own `twoStacks()` fixture, `moveTarget(…, 'c', 'left', …)`
      answers `index: 1` where the correct answer is `2`, and `describeMove` announces the move happily),
      `:139` (LOW, the `right` branch asks the kit where `moveNode` asks the node);
      `keyboard.test.ts:204` (HIGH, the duplicate-key describe covers `up` and `down` only), `:97` (LOW).
      **Check:** the traced assertion is added and fails before the fix.

- [x] **21. `Designer.tsx`: the shell's shortcuts.** `:663` (MEDIUM, a native listener on `.fs-shell`
      fires before React's delegated handler, so `Tree.tsx`'s `stopPropagation` cannot suppress it and the
      mitigation everyone credits is incidental), `:638` (MEDIUM, Escape during a drag both abandons and
      clears, against the spec), `:626` (LOW, a non-`HTMLElement` target makes all three guards fail
      open), `:128` (LOW, unconditional announcements), `:245-247` (NOTE);
      `Designer.test.tsx:397` (MEDIUM, the focus early-return is never asserted), `:318` (LOW), `:122`
      (NOTE); `Tree.test.tsx:802` (MEDIUM, the test presented as the control exercises a different
      handler).
      **Check:** deleting the tree-row exemption from `backspaceIsSafe` turns a test red; a test asserts
      `document.activeElement` after clicking chrome; Escape during a drag leaves the selection alone.

- [x] **22. `dnd.ts`: drops resolved on one axis against a two-dimensional layout.** `:223-238` (HIGH —
      both shipped kits render `Grid` as a wrapping `auto-fit` layout, so most of its slots are
      unreachable and the drop bar draws a row away from the pointer), `:272-276` (MEDIUM, `documentIndex`
      returns the filtered slot for a same-parent move — the review left this one BLOCKED, so **work the
      `withHidden()` fixture's indices through `removeNode` then `insertNode` by hand and settle whether
      `dnd.test.ts:302` pins a wrong value** before changing either), `:131` (LOW), `:417-418` (LOW, dead
      fallback), `:202-206` and `:133-146` (NOTE); `dnd.test.ts:643` (MEDIUM, `inOneRow`'s nearest-group
      fallback never runs), `:418` (NOTE).
      **Check:** a 2×2 grid fixture resolves a drop into the bottom-right cell to slot 3, not slot 1;
      replacing the distance loop with `return groups[0]` turns a test red. jsdom has no layout engine, so
      the geometry goes in as a unit test over `resolveDrop` with supplied rectangles.

- [x] **23. `drag.ts` and `geometry.ts`: the pointer lifecycle.** `drag.ts:189, 344-346` (MEDIUM, nothing
      filters by `pointerId` or `isPrimary`, so a second finger's `pointerup` commits the first finger's
      drag at the second finger's coordinates), `:147-160` (LOW, the stated `Map` order invariant is
      false after the first edit), `:138-145` (NOTE); `geometry.ts:193, 105-107` (LOW, O(n·m) measuring,
      twice per gesture), `:157-166` (NOTE, a container that renders fine but carries no `data-fs-key`
      takes its whole visible subtree out of drop resolution); `drag.test.ts:509` (MEDIUM,
      `visibilitychange` is fired by no test), `:469` (LOW), `:244` (NOTE); `geometry.test.ts` ×3 (LOW,
      NOTE).
      **Check:** a two-pointer fixture proves the second pointer's `pointerup` is ignored; deleting the
      `visibilitychange` registration turns a test red.

- [x] **24. `Canvas.tsx`.** `:483-523` (MEDIUM, downgraded — the missing bounds check is a documented
      trade-off; the defect is the contradictory dead comment block still describing the removed check as
      present, and if a guard is added it clamps to the scrollable content box), `:380-396` (MEDIUM,
      `pointerdown` is the one interaction event the canvas does not cancel while editing, and the next
      kit named in `ARCHITECTURE.md` opens on it), `:210-213` (LOW, unmemoized `findParent` on every
      pointer move), `:505-518` (LOW, the snapshot is not released on the four abandon paths), `:393`
      (NOTE); `Canvas.test.tsx:216` (HIGH, `onKeyDownCapture` has no coverage in any suite and the test
      that looks like it does proves focus never arrived), `:306` (MEDIUM, the primary-button guard),
      `:441` (MEDIUM, the drop indicator is asserted in no suite), `:600` (LOW), `:38` (NOTE).
      **Check:** deleting `onKeyDownCapture` from the props spread turns a test red; a right-press plus
      four pixels does not relocate a component; swapping `top` and `left` in the indicator style turns a
      test red.

- [x] **25. `Tree.tsx`, `SelectionLayer.tsx`, `Palette.tsx`.** `Tree.tsx:344-345` (LOW, `flatten` per
      render including every pointer move), `:82-84` (LOW), `:411-487` (LOW, the `role="group"` sublist
      is a sibling of the treeitem so nothing owns the group); `SelectionLayer.tsx:88,143,171` and
      `:149-161` (NOTE); `Palette.tsx:111` (NOTE); `Tree.test.tsx:681` (MEDIUM, the source-scanning guard
      matches a JSX expression attribute and nothing else), `:244` (MEDIUM, Ctrl+D's two refusal
      announcements untested), `:169` ×2 (LOW), `:214` (LOW, `aria-expanded` never asserted).
      **Check:** the row guard also catches a string-literal `data-fs-row=` and a spread; `aria-expanded`
      is asserted; both Ctrl+D refusals are announced and tested.

- [x] **26. `Properties.tsx` remainder, and the editors nothing drives.**
      `Properties.tsx:379-386` (LOW, the Show-when select has no `other` branch and no final guard),
      `:38-39` (NOTE, an unknown `section` vanishes silently while an unknown `editor` degrades
      gracefully); `Properties.test.tsx:62` (HIGH, the number editor is declared and never touched, so
      deleting the `Number.isFinite` arm lets `Infinity` and `NaN` into `node.props`, which
      `JSON.stringify` writes as `null`), `:36` (HIGH, `JsonEditor` is untested by the whole repository),
      `:483` (MEDIUM, Reset is never clicked anywhere), `:608` (MEDIUM), `:111` (MEDIUM), `:1544` (NOTE).
      **Check:** deleting the `Number.isFinite` arm or the `JsonEditor` re-sync block each turn a test
      red; Reset is clicked.

- [x] **27. `ConditionEditor.tsx` and `Rules.tsx`.** `ConditionEditor.tsx:735-738` (MEDIUM, "Add
      condition" mints the empty-`dataKey` shape `switchKind` was changed to stop producing, and core's
      gate accepts it, so the component is permanently hidden and every rule beneath it skipped),
      `:451-455` (LOW, an uncontrolled input that flips to controlled), `:121` (NOTE, shadowing);
      `Rules.tsx:313-427` (LOW, a `when`-guarded rule is drawn as unconditional), `:362-380` (NOTE, four
      `RegExp` compilations per render per keystroke); `Rules.test.tsx:564` (HIGH, the `malformed` table
      blesses `Array.isArray` as sufficient and `validations: [null]` crashes one line later), `:304`
      (MEDIUM, the `007` normalisation-display fix is unpinned), `:604` (MEDIUM, Enter/Escape never
      exercised), `:545` (MEDIUM), `:95` (LOW), `:356` (NOTE).
      **Check:** `validations: [null]` does not take the designer down; deleting `setDraft(String(next))`
      turns a test red.

- [x] **28. `Binding.tsx`.** `:356` (MEDIUM, a nameless language produces an input with no accessible
      name, which `docs/accessibility.md` lists as a build-failing check that no fixture exercises),
      `:251-268` (MEDIUM, renaming onto a key another component uses silently overwrites its text, per
      language), `:317-336` (MEDIUM, one rename produces `1 + 2n` individually-undoable entries),
      `:213, 261, 347` (LOW, `Object.prototype` reachable through a bare lookup — typing `toString` as a
      translation key puts a `Function` in a controlled input); `Binding.test.tsx:616` (HIGH, the only
      rename test uses a dialect-free fixture, so `languageTag(language)` and `language.code` are the same
      string and the real `en-US` document orphans its text), `:608` (MEDIUM), `:57` (MEDIUM), `:99` (LOW).
      **Check:** the rename test moves to an `en-US` fixture and fails against `language.code`; a nameless
      language has a labelled input; a collision is refused or reported.

- [x] **29. `StyleTab.tsx`, `FormSettings.tsx`, `DocumentDialog.tsx`.** `StyleTab.tsx:132-146, 195-199`
      (MEDIUM, a refused structured value snaps back with no message while the raw box beside it
      explains), `:283-291` (LOW, the refusal adds `role="alert"` to a live element);
      `FormSettings.tsx:89, 126, 130` (MEDIUM, `doc.languages` read as an array three times unguarded —
      the shape of each language is defended and the shape of the list is not, and the throw takes the
      JSON dialog down with it), `:156-158` (LOW, a document-global radio `name`);
      `DocumentDialog.tsx:190, 347-353` (MEDIUM, `slugify(doc.name)` throws during render of the repair
      surface), `:174-188` (NOTE, the paste path has no size bound), `:148-151, 180-187` (NOTE).
      **Check:** `languages: {}`, `name: 42` and `css: 5` each leave the designer standing; a refused
      Radius value shows the reason.

- [x] **30. The panel suites for those three.** `StyleTab.test.tsx:210` (HIGH, every refusal test types
      into the raw box and nothing ever types a brace into a structured control, here or in
      `e2e/style.spec.ts`), `:135` ×2 (MEDIUM, LOW), `:322` (MEDIUM), `:388` (NOTE);
      `DocumentDialog.test.tsx:510` (HIGH, "copies the draft and says it did" cannot tell the draft from
      the stored document because it never edits), `:143` (MEDIUM, `download` and `slugify` untested
      anywhere), `:427` (MEDIUM, the lossy note never renders), `:192` (MEDIUM), `:80-99` (NOTE, dead
      jsdom polyfill).
      **Check:** deleting the `safeDeclarations` check in `StyleTab.tsx` turns a test red; reverting
      `copy(draft, …)` to `copy(documentJson, …)` turns a test red.

- [x] **31. `designer.css.test.ts`, the invariant-3 guard, before the stylesheet it guards.**
      `:265` (HIGH, the guard names the form's scopes as two literal strings and misses `.fs-body`, a
      real wrapper — `.fs-body input { … }`, the exact rule that broke MUI's notched outline, passes it),
      `:517` (MEDIUM, the two sanctioned exceptions are pinned by property name only, so
      `pointer-events: auto` can become `none` with the guard green), `:351` (LOW, the allowlist lookup
      consults `Object.prototype`), `:39` (NOTE, the honest parser-edge list).
      **Check:** adding `.fs-body input { padding: 5px 8px }` to `designer.css` fails the guard; inverting
      either sanctioned exception fails it; the scope set is derived rather than listed, or a test proves
      every `fs-` wrapper between `.fs-shell` and `.fs-canvas` is covered.

- [x] **32. `designer.css`.** `:195-231` (MEDIUM, `.fs-panel button` and `.fs-panel input,…` are `(0,1,1)`
      and beat every later single-class rule, so `.fs-tabs__tab`, `.fs-color__swatch`, `.fs-code__area`,
      `.fs-binding__expression` and five more never apply — including the mono font `11-theming.md`
      documents for the raw CSS box), `:384` (MEDIUM, `touch-action: pan-y` disables pinch-zoom over the
      whole form, a WCAG 1.4.4 hazard the selector-parsing guard structurally cannot see), `:10-55, 75-88`
      (MEDIUM, a full dark palette with no `color-scheme`), `:1179-1187` (MEDIUM, a scrollable region with
      no `tabindex`, and the axe rule that would report it is disabled by name), `:829` (LOW, z-index 20
      against the reasoning two rules earlier), `:688-702` (LOW, a byte-identical redundant block),
      `:1215-1217` (LOW), `:534` (LOW), `:725…1335` (LOW, six hardcoded radii), `:880-911` (NOTE, two
      comments contradicting each other).
      **Check:** `pnpm test` including the item-31 guard, and `pnpm e2e` — `e2e/style.spec.ts` and
      `viewport.spec.ts` are what notice a specificity change in a real browser.

### Block 4 — the renderer and the kits

- [x] **33. `renderer/src/index.tsx`.** `:196` (MEDIUM, a `computed` prop is evaluated against top-level
      `data` only, so inside a repeater row it resolves the same wrong value in every row, while the
      `condition` branch twelve lines up passes `options.row` and both other evaluator call sites merge
      and say why), `:340` (MEDIUM, the boundary's retry fires on key or type change only, so the case its
      docblock is written about — fix the prop, the box stays — is still broken), `:811` (MEDIUM,
      `document.root` is the one field not guarded and it throws outside every boundary, so React 19
      unmounts the host's tree), `:458` (LOW), `:480` (LOW), `:637` and `:616-625` (NOTE);
      `packages/renderer/package.json:31` (LOW), `README.md:49` and `:44` (NOTE).
      **Check:** a computed label inside a repeater reads the row's value; an edited prop retries the
      boundary; `root: undefined` renders a message rather than unmounting.

- [ ] **34. `renderer.test.tsx`.** `:396` (HIGH, nothing anywhere renders a repeater inside a repeater, so
      the renderer's only nested-row line is unfailable and an inner-row field would emit a truncated
      address), `:1381` (MEDIUM, `kit.fallback` never exercised), `:146` (MEDIUM, the `device` prop has no
      test anywhere in the repo), `:1551` (LOW, an assertion the boundary guarantees), `:424` (LOW),
      `:1610` (NOTE).
      **Check:** changing `path={row?.path ?? NO_ROWS}` to `path={NO_ROWS}` turns a test red; dropping
      `device` from the options object turns a test red.

- [ ] **35. The MUI gap defaults, 8× too tight since the renderer moved gaps to pixels.**
      `kit-mui/definitions.ts:50` (HIGH, `gap: 2` on `Screen`, `Stack`, `Step` and `Repeater` against
      `kit-html`'s 16, with `Grid` at 16 in the same file, so the kit disagrees with itself),
      `docs/spec/02-kit-contract.md:164-168` (HIGH, the paragraph that says a form which never set a gap
      looks identical), the two false comments at `definitions.ts:244` and in the spec, and
      `apps/playground/src/sample.ts:22`, which ships the demonstration.
      **Check:** a test compares the same prop's default across both kits and fails on 2 vs 16 — this is
      the rule item 38 has to make possible, so if it cannot be written yet, write it as a plain
      cross-kit assertion here and let item 38 generalise it.

- [ ] **36. `kit-mui/renderers.tsx`.** `:708` (HIGH, every `RadioItem` child renders pre-checked while its
      group is unanswered, all at once, because `'' === ''` — `kit-html` fixed exactly this and says so),
      `:820` (MEDIUM, the "too large" notice can never be announced: the message is produced only when
      `error` is undefined and the alert role only when it is set), `:142` and `:459` (LOW, `maxWidth`
      skips `px()` and MUI reads `1` as `100%`), `:700-704` (NOTE, the false "deliberately not wired"
      comment that is plausibly why the guard was never added), `:547`, `:188`, `:492` (NOTE);
      `kit-mui/renderers.test.tsx:88` (MEDIUM, `ButtonGroup`'s `gap={1}` still routes through
      `theme.spacing`), `:83` (LOW), `:89` (NOTE).
      **Check:** an unanswered radio group has no checked item in either kit; `maxWidth: 1` renders `1px`
      in both; the file notice is announced.

- [ ] **37. `kit-html/renderers.tsx`.** `:977` + `definitions.ts:636-643` (MEDIUM, `BreadcrumbsNode` reads
      a `label` prop the kit does not declare, so the localisation fix its comment describes is
      unreachable — and `03-components.md:182` plus `test/docs.test.ts` mean the three move together),
      `:863` (MEDIUM, the only statement of what a `FileUpload` will submit is not in
      `aria-describedby`), `:859` (MEDIUM, a second identical refusal is announced to nobody), `:266` and
      six more (MEDIUM, seven of nine field renderers put `nodeProps` on an unclassed wrapper and two put
      it on `.fsh-field`, so the kit has two DOM shapes at the seam everything external keys off),
      `:692` (LOW, an option declared with an empty value pre-checks), `:44` (LOW), `:89` and six more
      (LOW, inline styles silently beat Style-tab CSS in this kit and not in the other), `:269`, `:511`,
      `:676-677`, `:253` (NOTE).
      **Check:** a French document renders a translated breadcrumb landmark; the two DOM shapes converge
      and `test/kit-contract.test.tsx` pins the seam.

- [ ] **38. The kit conformance suite never checks that a kit collects an answer.**
      `test/kit-contract.test.tsx:18` (HIGH — the file imports `fireEvent` once and uses it once, for a
      radio click; `onChange={() => undefined}` appears 18 times; replace every real `onChange` in
      `kit-html` with a no-op and the kit passes 100% of the suite bar one rule). This is the single
      largest hole in the repository's test architecture and it gets its own pull request.
      **Check:** a rule drives every data-bound component in both kits and asserts `onChange` fired with
      the typed value; stubbing `kit-html`'s handlers turns the suite red.

- [ ] **39. The conformance rules that structurally cannot fail.**
      `:1483` (HIGH, three rules are each built so they cannot see a kit's `defaultProps`, which is why
      the item-35 divergence shipped), `:639` (HIGH, `expect(a.outerHTML).not.toBe(b.outerHTML)` can never
      fail because `useId`-derived `data-fs-scope` differs on every run, and it is the control for the
      rule beside it), `:1045` (MEDIUM, a `LENGTHS` row for a `Container` neither kit ships passes
      silently, and the same `return` turns an obligation off when a prop is renamed), `:1043` (MEDIUM,
      `LENGTHS` is hand-written, so `Screen.maxWidth` escapes by not being listed), `:1245` (NOTE).
      **Check:** collapsing every declared variant to the default in either kit turns the variant rule
      red; the `Container` row either names a real type or fails; `DRIVEN` asserts the prop still exists.

- [ ] **40. `kit-html`'s definitions and stylesheet.** `definitions.ts:193-200` (LOW, `Button.variant`
      is the one vocabulary the two kits do not share, against the README's cross-kit claim), `:86`
      (NOTE, heading rank), `:136` (NOTE); `kit-html.css:156-169` (MEDIUM, `.fsh-field__error` and
      `.fsh-field__hint` are used by the renderer and declared in no stylesheet, so the error renders in
      body colour and keeps the UA's `1em` margin inside a 4px gap), `:361-406` (MEDIUM, the `Switch` has
      no state signal that survives forced-colors mode, and neither does `.fsh-progress__fill`),
      `:110-115` (LOW, `min-width: 0` inert for seven of nine), `:62-89` (NOTE), `:529-533` (NOTE);
      `kit-html/README.md:31` (NOTE); `kit-mui/README.md:24` (NOTE); `kit-mui/package.json:32` (NOTE).
      **Check:** `pnpm test` including `test/contrast.test.ts`; a rule asserts every `fsh-` class the
      renderer emits is declared in the stylesheet.

- [ ] **41. `test/setup.ts` and the CSS-injection suite.** `setup.ts:25` (MEDIUM, `observerCount()` has no
      consumers anywhere — an obligation written down with nothing executing it), `:59-67` (MEDIUM, the
      counter could not come down even if a test read it), `:1` (MEDIUM, no `console.error` gate, so the
      controlled→uncontrolled warning, the duplicate-key warning and `act()` warnings are invisible across
      every jsdom suite, and `renderer.test.tsx:1037` mocks it to a no-op for eight renders), `:20-22`
      (NOTE); `kit-css-injection.test.tsx:189` (MEDIUM, the HTML-kit refusals pass vacuously on an empty
      read and the floor their MUI siblings got was not added), `:5-24` (MEDIUM, the file's premise is a
      hand-maintained claim nothing executes), `:151` (NOTE, MUI checked only on the client path and
      kit-html only on the server one).
      **Check:** turning the `console.error` gate on leaves `pnpm test` green — fix or record every
      warning it surfaces, and do not exempt a file to get there; the injection fixture is derived from
      `kit.components` rather than hardcoded.

### Block 5 — the apps

- [ ] **42. The demo server and the playground.** `demo-server/src/index.ts:341-344, 430-431` (MEDIUM, two
      routes apply no shape guard to what comes out of the store while `GET /api/forms` guards the
      identical hazard with a comment saying why, so a hand-edited `forms.json` gets a submit answered
      `200 {ok:true}` against a document that is not one), `:336` (LOW), `:348, 498` (LOW, one 400 for
      four distinct refusals), `:268-271` (NOTE), `:468-470` (NOTE, 500 for a document-level problem);
      `demo-server/package.json:8-9` (LOW, `pnpm dev:server` fails on a clean checkout with nothing
      saying so) and `:11-15` (NOTE); `playground/src/App.tsx:71, 83-90` (LOW, the kit switch is the
      headline demonstration and does not survive F5), `:83-90` and `:114` (NOTE);
      `playground/package.json:6-22` (LOW, `vite` and its React plugin declared only at the root).
      **Check:** `POST /api/forms/x/submit` against `{"x": 5}` answers 4xx, not 200; the four refusals get
      distinguishable messages and the oversized body gets 413.

- [ ] **43. `apps/demo-server/src/index.test.ts`.** `:374` (HIGH, the describe named for a borrowed
      `Object.prototype` id drives only the submit route, leaving the null-prototype fix on the two
      routes that _write_ the store untested — `PUT /api/forms/__proto__` would answer 200, store nothing,
      and the listing would report a write that never joined), `:74` (MEDIUM, no malformed body anywhere),
      `:1` (MEDIUM, the CORS allowlist has no test at all on a server with no authentication), `:33-34`
      (MEDIUM, the two guards the submit route calls its defence are never executed and the fixture
      comment says so out loud), `:1` (MEDIUM, `readStore`'s refuse-rather-than-rebuild branch), `:156`
      (MEDIUM, both PUT 422 branches), `:350` (LOW, depends on a `PUT` in the previous `it`), `:403`
      (LOW, real timers).
      **Check:** `PUT` and `DELETE` on `__proto__`, a non-JSON body, a cross-origin request, a `computed`
      binding, and a corrupt store each have a test that fails against the un-fixed code.

### Block 6 — the guards that check the documents

- [ ] **44. The count reporter and `test/docs.test.ts`.** `count-reporter.ts:136-152` (HIGH, the liveness
      marker is written in `onInit`, so deleting both finish hooks leaves the guard green and no
      documented count is ever compared again), `:130` + `docs.test.ts:206` (MEDIUM, a fixed path in
      `tmpdir()` breaks watch mode and any two concurrent runs, and the failure message points at vitest's
      API), `:55-64` (LOW, the `>= 100` filter breaks when the browser suite passes 100), `:166` (NOTE,
      vitest 3); `docs.test.ts:743-772` (MEDIUM, the axe-state count is sliced to the end of the file, so
      it counts 11 while claiming it cannot be inflated, and both "nine" sites are unguarded), `:272`
      (MEDIUM, a raw substring search over a whole test file, comments included), `:789-798` (MEDIUM, a
      hardcoded eight-file link list), `:1007-1044` (LOW), `:89-94` (LOW), `:540-555` (LOW), `:867-890`
      (NOTE).
      **Check:** deleting both finish hooks from the reporter turns a test red; the axe-state count is
      taken from the describe rather than the file; the link check enumerates `docs/`.

- [ ] **45. `test/a11y.test.tsx` and `test/contrast.test.ts`.** `a11y.test.tsx:197-296` (MEDIUM, four
      audited states have no anchor proving the state was reached — make the condition editor render
      `null` and the test still passes), `:123-142` (MEDIUM, `results.incomplete` is never read, so a rule
      axe cannot decide in jsdom is reported clean), `:313` (LOW, a pointer at a file that does not
      exist), `:175` (NOTE); `contrast.test.ts:415-462` (MEDIUM, the documentation-figure check has no
      control against an empty `MEASURED`, so a name-filtered run passes having compared nothing),
      `:200-202` (MEDIUM, `--fs-accent` is measured only against the panel and is used as 10px body text
      and over the canvas), `:508-548` (MEDIUM, the no-colour-outside-tokens rule matches `#hex` only and
      `designer.css` writes five `rgb()` literals outside every token block), `:464-492` (MEDIUM, the
      completeness net reads `designerCss` only, so `--fsh-` is outside the check entirely), `:148, 236`
      (NOTE).
      **Check:** `vitest run -t "quotes the lowest pair"` fails rather than passing on zero comparisons;
      every audited state has an anchor; a new `--fsh-` border token is caught by the net.

- [ ] **46. `test/readme.test.ts` and the root README.** `readme.test.ts:58-71` + `190-208` (MEDIUM,
      `READMES` is built from `readdirSync('packages')`, so the most-read file in the repository is
      neither compiled nor checked), `README.md:92-98` (MEDIUM, its runtime example writes an answer
      without `applyChange` and passes a one-name handler to a two-argument callback — exactly what the
      guard forbids, in the one file the guard cannot see), `readme.test.ts:75` (LOW, only `ts` and
      `tsx` fences are seen), `:84` (LOW), `:248-253` (NOTE); `README.md:126` (LOW, eleven axe states
      against two documents saying nine), `:72` (LOW).
      **Check:** the root README is in `READMES`, its examples compile, and the `applyChange` rule fails
      against the current text before it is fixed.

### Block 7 — the browser suite

- [ ] **47. The one-shot reads that race a React passive effect.** `e2e/authoring.spec.ts:50` (MEDIUM, a
      single `localStorage` read taken immediately after a refused rename, expecting the value that was
      already there — it cannot distinguish "refused" from "nothing committed yet"),
      `e2e/canvas.spec.ts:133, 141, 174, 261, 289` (MEDIUM, five more in a file that documents at
      `:196-205` exactly why the read is racy and uses `expect.poll` twice),
      `e2e/keyboard.spec.ts:64, 101, 107, 158, 229, 239` (MEDIUM, six more; 229 and 239 are the worst,
      a `press('Delete')` followed directly by a negative assertion with nothing absorbing the commit),
      `e2e/canvas.spec.ts:151-153` (MEDIUM, a bare `boundingBox()` on a palette entry nothing scrolled
      into view — the repository's own trap 13, still live, and `dragFrom` exists for it).
      **Check:** `pnpm e2e` green, and every read named above goes through `expect.poll` or an awaited
      assertion; grep proves no bare `rootChildren()` follows a gesture.

- [ ] **48. The rest of the browser suite.** `e2e/document.spec.ts:287-317` (MEDIUM, the focus-trap test
      has no positive half and passes for a dialog with nothing focusable in it), `:82-97` (LOW),
      `:176-264` (NOTE, overlap); `e2e/harness.ts:113-116` (LOW, `openTab` waits on the tab rather than
      on anything the panel draws), `:118-120` (LOW, `undo()` waits for no consequence), `:57-59` (NOTE,
      `fullyParallel: false` is justified by a claim the current harness makes untrue);
      `e2e/hidden.spec.ts:62-63` and `:17-19` (LOW); `e2e/keyboard.spec.ts:265-307` (LOW, twelve Tabs
      against a fixture that happens to be large enough); `e2e/repeater.spec.ts:87` (LOW);
      `e2e/style.spec.ts:104-106` (LOW, a comment that would license deleting the two lines the
      assertions depend on) and `:149-150` (LOW, inequality standing in for the property under test);
      `e2e/viewport.spec.ts:33` (LOW, a one-sided bound) and `:44, 48` (NOTE);
      `e2e/canvas.spec.ts:118` (LOW, an MUI-specific selector for canvas behaviour).
      **Check:** `pnpm e2e` green; the focus-trap test asserts focus landed inside the dialog; the
      viewport bound is two-sided.

### Block 8 — build configuration, CI, scripts

- [ ] **49. CI, the build scripts and the remaining configs.** `.github/workflows/ci.yml:78-84` (MEDIUM,
      the failure artifact names `playwright-report/`, which this reporter configuration never produces,
      and `if-no-files-found: warn` means the step succeeds on the other half — while the write-tests
      skill tells the next person to read a screenshot from it), `:41` (LOW, `persist-credentials`),
      `:24-32` (LOW, four actions on a deprecated runtime and no dependabot);
      `scripts/check-dist.mjs:63-83` (MEDIUM, the one thing that claims to read what a consumer installs
      never invokes package-`exports` resolution — repoint `exports["."].default` and every check still
      passes), `:42, 54` (LOW, `existsSync` accepts a directory and a stale artefact), `:116` (NOTE);
      `scripts/copy-assets.mjs:31` (LOW, a bare `ENOENT` at import time, before `check-dist`'s own
      guards can run) and `:21-40` (NOTE); `vitest.config.ts:29` and `:44` (LOW);
      `tsconfig.eslint.json:4-5` + `packages/core/tsconfig.json` (LOW, `*.test.tsx` is not excluded from
      core's build, so the first one anybody writes is compiled into `dist` and published).
      **Check:** repointing `exports["."].default` at a missing file fails `check-dist.mjs`; a
      `packages/scratch/` with no `src/` produces a diagnosis rather than a stack trace.

### Block 9 — the documents

- [x] **50. `CLAUDE.md`, the guides and the working notes.** `CLAUDE.md:74-76` (MEDIUM, the sentence a
      contributor reads before adding a test file is true of four packages of five), `:66-69` (LOW, CI's
      real order and the playground build it does not mention), `:62` (LOW);
      `docs/ARCHITECTURE.md:141-142` (LOW, "about forty" `fs-` classes against 102);
      `docs/ROADMAP.md:62`, `docs/accessibility.md:23` vs `:122` and `docs/spec/00-product.md:91` (LOW,
      nine versus eleven axe states, in three documents and inside one of them twice — the honest repair
      is to say which describe each number refers to); `.claude/skills/write-tests/SKILL.md:174` (LOW,
      911 unit tests against 1967, paired with a live browser figure in one sentence);
      `.prettierignore:11-13` (LOW, `docs/reports/` gets neither half of the rationale that exempts
      `docs/reviews/`); `docs/build-out/RUN.md:161-164`, `queue.md:11-12`, `found.md:159-160` and
      `:77-88`, `triage.md:772` and `:752-756`, `archive/queue-2026-08-30-first-pass.md:6-9` (LOW/NOTE,
      the resume mechanism describing a pointer item 33 deleted, two wrong figures, a provenance line
      pointing at the wrong item, and a live `/goal` block in an archived file);
      `DESIGN-IT-TWICE.md:30` and `codebase-design/SOURCE.md:14-17` (NOTE, two instructions that are not
      followable from a clone).
      **Check:** `pnpm test` (`test/docs.test.ts`, `count-reporter.ts`), and every figure this item
      touches is either guarded by a test or removed.

- [x] **51. The spec index and the contract files.** `docs/spec/README.md:36` (MEDIUM, the index gives
      `03-components.md` **Partial** where the file opens **Built**, which the index's own rule forbids,
      and `:58` compounds it), `:116` (LOW, the section that says which claims are machine-checked names
      the wrong documents); `01-document-model.md:101-102` (MEDIUM, `dataKey` is held to the full key
      grammar and `12-api.md` says the opposite, so two spec files contradict each other),
      `:137-141` (MEDIUM, the `safeDeclarations` refusal list is presented as complete and omits two),
      `:71-82` (LOW); `03-components.md:20-33` (MEDIUM, the `ComponentDef` block omits `root` and
      `defaultRenderWhen` and mistypes `icon`, so a third-party author cannot declare the root the
      contract requires), `:319-323` (MEDIUM, `submittedAcross` is documented in no spec file and a host
      implementing a multi-step submit from the documented pair drops every answer from every step but
      one), `:3` (MEDIUM, **Built** over two "Still to build" lists); `04-shell.md:168-170` (LOW,
      window-level shortcuts the code moved off `window`); `06-inspector.md:159-161` (MEDIUM);
      `10-interchange.md:109-120` (MEDIUM, "four causes" followed by three bullets against five real
      ones).
      **Check:** a new `test/docs.test.ts` rule asserts each spec file's opening status matches the
      index; `pnpm test`.

- [x] **52. `docs/spec/12-api.md`.** `:282-285` (HIGH, the Keys section publishes `RESERVED_KEYS` as three
      names where the export has thirteen, and the ten missing ones include `toString`, whose omission the
      code's own docblock ties to a form with a missing required answer submitting clean),
      `:274-296` (MEDIUM, `MAX_KEY_LENGTH` is never mentioned), whole file (MEDIUM, four exported core
      functions a host is required to call are missing — `submittedAcross` and `evaluatorKeys` appear in
      no spec file at all), `:293-294` (LOW, "both callers" against six call sites, three of which show
      nobody anything), `:74` (LOW, `data` described as keyed by node), `:25` (NOTE).
      **Check:** a new `test/docs.test.ts` rule compares the published `RESERVED_KEYS` list against the
      exported constant and the key-grammar prose against `keys.ts`; it fails against the current text.

### Block 10 — close

- [ ] **53. Reconcile with the previous pass, and close the run.** The review deliberately did not read
      `docs/reports/`, and says reconciling the two is a separate job. It is this one. For every finding
      this pass raised that the 2026-08-30 pass had already triaged, check `triage.md` rather than
      re-litigating, and record which way it went. Then: update `triage.md` and `found.md`, remove the
      resume block from `CLAUDE.md`, and write `docs/reports/2026-08-31-deep-remediation.md` — what was
      fixed, what was triaged and why, what Copilot caught that the review did not, and what the size
      budget did to review quality, with the comment counts.
      **Check:** every item above is ticked; `grep -c build-out CLAUDE.md` returns 0; the full gate
      (`format:check`, `lint`, `typecheck`, `test`, `build`, `check-dist`, `e2e`) is green on `main`.

---

## What is deliberately not here

- Publishing anything to npm. Every manifest stays at `0.0.0`.
- The `docs/prior-art/` study, `docs/ideas.md`, `LICENSE`, `.editorconfig`, `.gitattributes`, `.npmrc`,
  `.gitignore`, `.prettierrc.json`, `playwright.config.ts`, `aliases.ts`, `tsconfig.json`,
  `tsconfig.base.json`, `pnpm-workspace.yaml`, `docs/decisions.md`, `packages/core/src/exhaustive.ts`,
  `packages/core/src/keys.ts` and the other files the review marked "No issues found." They are covered
  by having been read and cleared.
