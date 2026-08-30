# Build-out queue — remediating the 2026-08-30 deep review

Paste this to start or resume the run:

```
/goal Every item in docs/build-out/queue.md is checked off with its stated check passing. Print the
full queue state and the current time at the end of every turn so this is judgeable from the
transcript. Finishing an item means starting the next one, never stopping. Do not open background
shells or subagents that outlive a turn. Follow docs/build-out/RUN.md.
```

## Run status

The mutable half of the resume pointer. `CLAUDE.md` carries only a stable pointer at this file, because
a status line in a file that calls itself repo facts only is a status line nobody updates.

- **Started:** 2026-08-30
- **Last completed:** item 2 — the condition picker writes `scope`, by grouping the field list
- **Work list:** `tmp/formsmith-review-2026-08-30.md`, gitignored, in one working copy only

Keep these three current as items are ticked off.

---

**Frozen 2026-08-30.** Nothing may be added to this queue or dropped from it during the run. Work
discovered along the way goes to `docs/build-out/found.md`, which does not gate completion. A review
finding judged not worth fixing goes to `docs/build-out/triage.md` with a one-line reason, which counts
as handled.

**Source:** `tmp/formsmith-review-2026-08-30.md` — 428 findings, 3 CRITICAL / 57 HIGH / 168 MEDIUM /
121 LOW / 79 NOTE. That file is deliberately outside git, so it exists only in this working copy. A
worktree or a fresh clone will not have it. Copy it before working anywhere else.

## The standing gate

Every item's check includes all six, from the repository root, all passing:

```
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

Plus, for every behavioural fix, **a test that fails against the code as it stands and passes after**.
Run it against the unfixed code first and say so in the transcript. Read
`.claude/skills/write-tests/SKILL.md` before writing one; twelve traps in it came from this repository.

---

## Stage 0 — clear the base

- [x] **0. Land PR #21 and PR #22, then cut the branch for this run from an updated main.**
      #21 is the steps work; #22 is this queue and the run contract. Wait for Copilot on each, answer every
      finding, merge both. They touch `CLAUDE.md` in different places and merge cleanly in either order.
      _Check:_ `gh pr view 21 --json state --jq .state` and the same for 22 both print `MERGED`, and the
      branch for this run is cut from a main that contains both.

## Stage 1 — the three CRITICALs and the four decisions already logged

These have a decided design in `docs/decisions.md`. Implement what is written there; do not re-litigate.

- [x] **1. Refuse hostile CSS values in core, and call it from both kit sinks.** CRITICAL C1.
      `docs/decisions.md` — _A document CSS value is refused in core, not made safe by the rendering shape_.
      _Check:_ a core test proving `background: red}html{display:none}.x{` is refused; a kit-mui test that
      serialises the emitted stylesheet and asserts one rule, not two; a matching kit-html test. Standing gate.

- [x] **2. The condition picker writes `scope`, and stops discarding it.** CRITICAL C10,
      `ConditionEditor.tsx:181`. Changing which field a condition tests must not silently re-point a
      row-scoped condition at the form.
      _Check:_ a designer test that authors a row-scoped ref, changes the field, and asserts `scope: 'row'`
      survives; a second proving the picker can author row scope at all. Standing gate.

- [ ] **3. `documentProblems` checks `translations`.** CRITICAL C11. A document that passes the gate can
      still take the React root down through an unguarded `document.translations[...]`.
      _Check:_ a core test where a malformed `translations` is rejected by the gate, and a component test
      proving the render path survives one that gets through. Standing gate.

- [ ] **4. A row frame carries the repeater data key, not its node key.** HIGH C2, theme 2.
      `docs/decisions.md` — _A row frame carries the repeater data key, not its node key_. `rows.ts` already
      holds the correct mapper, `rowValue`, with no caller anywhere.
      _Check:_ every repeater fixture in the suite gains a sibling where `key !== dataKey` — the report proves
      there is not one today, which is why the suite could not tell the two designs apart. Keystrokes in such
      a repeater must land. Standing gate, e2e included.

- [ ] **5. Ignore `apps/demo-server/forms.json`, on main.** `docs/decisions.md` — _The demo store stays in
      the repo; the ignore line has to land on main_. The earlier fix went to a branch that was later deleted.
      _Check:_ on main, `git check-ignore -v apps/demo-server/forms.json` exits 0.

- [ ] **6. Fix the MUI corner radius.** HIGH, addendum. `docs/decisions.md` — _The MUI kit halves every
      corner radius_. It divides by 8 where MUI multiplies by 4.
      _Check:_ a kit contract test that renders the same authored `radius` through both kits and asserts the
      same computed pixel value. Standing gate.

## Stage 2 — the cross-cutting themes

Root causes. Each collapses several individual findings, so these come before the per-area sweeps.

- [ ] **7. An unknown union tag must never read as "skip it".** Theme 1. `isVisible` and `guardPasses`
      both fall off an exhaustive switch and return `undefined`, which is read as _hidden_ and as _guard not
      satisfied_. A one-character typo in a document reaches this.
      _Check:_ a test per switch feeding an unrecognised tag, asserting the safe reading rather than silent
      omission, and asserting the document gate rejects the tag up front. Standing gate.

- [ ] **8. `validateDocument` inspects the whole document, and a hostile one cannot crash React.** Theme 3.
      It checks none of `renderWhen`, `props`, `schema.validations`, `translations`, `version`, `settings`,
      `css`, and there is no error boundary anywhere in the repository.
      _Check:_ a test per unchecked branch; a component test proving a document that passes the gate cannot
      take the root down. Standing gate.

- [ ] **9. A control must not re-derive its text from its own parsed value.** Theme 5, and Trap 10 in the
      repository own skill. `8px auto` stores as `8pxauto`; `1px solid #ccc` stores as `1pxsolid#ccc`; the
      condition editor options box commits on every blur, so tabbing through rewrites it.
      _Check:_ both literal placeholder strings survive a round trip through the Style tab; tabbing through a
      membership condition leaves its stored options byte-identical. Standing gate.

- [ ] **10. The documentation states what is actually built.** Theme 6, and the 11 HIGH findings in area 11.
      `01-document-model.md` on `ComponentNode.css`, `ROADMAP.md` on the Step component, `03-components.md`
      on the built count, `07-bindings.md` on the language selector.
      _Check:_ `docs.test.ts` is tightened so each of those four drifts fails it, then all pass. Standing gate.

- [ ] **11. Close the holes in the guards.** Theme 7. The eslint block for invariant 1 is scoped to `*.ts`
      and exempts `.tsx`; `no-restricted-imports` uses `paths`, which matches exactly, so `react-dom/client`
      slips through; the react-hooks rules are `.tsx`-only, so `store.ts` gets no `exhaustive-deps` at all.
      _Check:_ a `.tsx` file in core importing React fails `pnpm lint`; so does `react-dom/client`; `store.ts`
      is covered, and whatever `exhaustive-deps` then reports is fixed. Standing gate.

- [ ] **12. Decide what `data-fs-row` means, and give the other one a different name.** MEDIUM, addendum.
      Two meanings in one DOM: the row coordinate in the renderer and the row key in the Tree panel.
      _Check:_ a test asserting the two attributes are distinct names, and that no selector reads the wrong
      one. Standing gate, e2e included.

## Stage 3 — the remaining HIGH findings, by area

Everything at HIGH in `tmp/formsmith-review-2026-08-30.md` not already covered above. The check for each
item: **every HIGH in these areas is fixed, or recorded in `triage.md` with a one-line reason**; print
`fixed N / triaged M / total T`, and T must match the count given. Standing gate on each.

- [ ] **13. Core — areas 1 and 2.** T = 14.
- [ ] **14. Renderer and both kits — areas 3 and 4.** T = 5.
- [ ] **15. Designer shell, canvas and panels — areas 5, 6, 7.** T = 14.
- [ ] **16. Apps, configuration, e2e — area 8.** T = 2.
- [ ] **17. The test suites themselves — areas 9 and 10.** T = 9.
- [ ] **18. Documentation — area 11.** T = 11.

## Stage 4 — the MEDIUM findings, by area

Same rule and same reporting as stage 3.

- [ ] **19. Core — areas 1 and 2.** T = 20.
- [ ] **20. Renderer and both kits — areas 3, 4, addendum.** T = 22.
- [ ] **21. Designer shell, canvas and panels — areas 5, 6, 7.** T = 41.
- [ ] **22. Apps, configuration, e2e — area 8.** T = 19.
- [ ] **23. The test suites themselves — areas 9 and 10.** T = 42.
- [ ] **24. Documentation — area 11.** T = 24.

## Stage 5 — LOW and NOTE

200 findings, mostly dead code, drift, naming and cosmetics. The review skill own filter applies here: a
finding that is a style preference wearing the clothes of a bug gets triaged, not applied. Rejecting one
is a real outcome, but it has to be written down.

- [ ] **25. Core, renderer, both kits — areas 1, 2, 3, 4.** T = 69.
- [ ] **26. Designer shell, canvas, panels — areas 5, 6, 7.** T = 70.
- [ ] **27. Apps, tests, docs — areas 8, 9, 10, 11, addendum.** T = 61.

---

**Arithmetic, so the run can check itself:** stages 1 to 3 cover 3 CRITICAL and 57 HIGH; stage 4 covers
168 MEDIUM; stage 5 covers 121 LOW and 79 NOTE. 3 + 57 + 168 + 200 = 428, the total in the report.
