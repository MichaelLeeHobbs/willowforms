# Dead CSS audit

```
Dead CSS audit: WillowForms playground  commit 5d2d6dd3f9c6212cf8bb85280d41d0ba5ef988ed  2026-11-25   Mode: crawl
Catalog: .claude/clean-code/find-dead-css/   Work folder: session scratchpad, outside the repo
Inventory: 377 rules, 436 selector members in 1 sheets (2 out of scope: 2 keyframe rules)
Crawl: 140 of 143 cells reached over 11 routes (3 blocked: 3 target-missing)   PASS
Verdicts: DEAD 0  KEEP 13  SEEN 411  UNDECIDABLE 12  UNPROVEN 0
Delete list: 0 rules, 0 trims, 0 whole files   Proof: CONFIRMED (0 removals expected)
Outside use: none (user's answer; not searched; designer and kit-html have public package manifests)
Canaries: 3 of 3 as planted, guard aborted   PASS
Hosts reached: localhost:5190 only   Spend: about $6 of $7.50 cap (estimated, not measured)
Last run: first run
```

DEAD means "never appeared in the reached cells of this crawl, and unreferenced". It holds for the crawled browser (Chromium), role (visitor), seeds and locale, not for every user.

The zero was fixed before the crawl: `refs` over all 244 required tokens found 231 exact, 13 fragment and 0 none, and DEAD needs a token with no reference. With an empty seen set the verdicts are KEEP 411, UNPROVEN fragment 13, UNDECIDABLE 12; the crawl moved rules from those two groups to SEEN.

Read DEAD 0 with care. The corpus holds tests, docs and agent files as well as product source, so a name found only there counts as referenced. It also could not return "none" for most class names: prose in `.claude/skills/write-tests/SKILL.md:211` (`fs-`) and `docs/COMPATIBILITY.md:32` (`fsh-`) counts as a fragment of any `fs-*` or `fsh-*` name, made-up ones included. That covers 189 of the 232 class tokens: an unused one would come out UNPROVEN, never DEAD, and the DEAD canary (`zz-dead-*`) does not exercise it. Two other results carry the finding: UNPROVEN 0, and 234 of the 244 tokens seen on real elements. The other 10 are the KEEP tokens below, and product source names or builds each of them. With only product source and the built JavaScript as the corpus, `refs` gives 226 exact, 18 fragment, 0 none.

No verdict depended on the outside-use answer, because there was no DEAD candidate.

## Delete list

Empty. The proof rebuilt an unmodified fresh clone and compared 436 members before and after: identical, 0 problems. With nothing to remove, that shows only that the rebuild is reproducible. There is no spot-check sample for the same reason.

## Blocked cells

Each was retried once. None decides a verdict: the sheet loaded in all 143 cells, these included, and no unseen token belongs to these screens.

| Cell                  | Reason         | Cause                                                                                                     | Candidates decided |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| `inspect-options-add` | target-missing | the plan names "Add option"; the button's name is "+ Add option"                                          | 0                  |
| `steps-html`          | target-missing | the seed's steps have no `renderWhen` step condition, so no navigation is drawn                           | 0                  |
| `steps-mui`           | target-missing | the same                                                                                                  | 0                  |

Fix these plan steps on the next run; they need a new approval.

## UNPROVEN

None.

## Counts only

- KEEP 13: never appeared in the crawl, but referenced. Two groups:
  - Drag and drop (9 members, `designer.css` lines 901 to 951): `.fs-drop`, `.fs-drop--bar`, `.fs-drop--empty`, `.fs-drag-label`, `.is-drop-before`, `.is-drop-after`, `.is-drop-inside`. The plan's step list has no drag. Product source names the first four in full. `is-drop-*` (5 members) is named in full only in `e2e/tree-drag.spec.ts`; `packages/designer/src/panels/Tree.tsx:355` builds it (`' is-drop-' + drop`), so without the tests in the corpus those 5 would be UNPROVEN fragment.
  - `code` and `icon` property editors (4 members, `designer.css` lines 1335 to 1369): `.fs-icon-picker`, `.fs-icon-picker__preview`, `.fs-code__count`. Neither shipped kit declares a property with those editors, so only a host's own kit can show them.
- SEEN 411.
- UNDECIDABLE 12: `designer.css` lines 262 to 286 and 982 to 992, all `:where(...)` plus element names. Read by hand against the token log: every class inside a `:where` appeared in the crawl.

## Out of scope

| What                                   | Count                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `@keyframes`                           | 1, holding 2 keyframe rules                                                 |
| `@media` conditions                    | 8, ignored by the token test; the rules inside are inventoried              |
| Runtime CSS                            | Material UI's Emotion styles and the renderer's per-form `<style>`; no count, because neither is in a built stylesheet |
| Custom properties                      | 52 declared in the built sheet, all 52 read there                           |
| Cross-origin frames                    | 0                                                                           |
| Closed declarative shadow roots        | 0                                                                           |
| Vendor sheets                          | 0                                                                           |

## How this run was set up

- All 26 tool fixtures passed. The driver self-test matched exactly on logged tokens, stylesheets and blocked requests.
- Build: `vite build --sourcemap --minify false`. Vite writes no source map for CSS, so source lines come from matching each built rule to the four source files in import order: 377 of 377 matched on at-rule chain, selector and declarations.
- Corpus: every tracked file plus the built JavaScript, except stylesheets, `pnpm-lock.yaml` and `.claude/clean-code/`, whose catalogs quote class names.
- Guard canary: the POST was aborted by the method rule and the third-party GET by the host rule. The GET was aborted twice because the pre-page script also runs on `about:blank`; a separate check reproduced that, but its output was not saved. No non-GET request reached the server.
- Plan hash (SHA-256 of `plan.jsonl`): `b88e4a777cada35a3aeb242a32b0344fa32b4fe3d5a10e4721d604344dd6349b`. One `allow`: "Reset example" opens its confirmation.
- Seeds, synthetic documents put in local storage and named by each cell's `seed`: `sample` (none, the app's own), `empty` (no components), `all` (25 of the 26 component types, all but `Step`, with variants and required fields), `bindings` (i18n, computed and condition bindings, 6 of the 13 rule kinds: `required`, `minLength`, `maxLength`, `pattern`, `matches`, `custom`; actions, two languages, an unknown type), `steps` (two steps), `broken` (unreadable JSON). The catalog does not hold them; a re-run writes them again.
- Every document was in standards mode, so `classify` ran with `--fold-case no`.
- Scope: the four tracked stylesheets, all of them in the playground build. The packages' own `dist/*.css` were not built separately.
- What this test cannot find: a selector whose names all exist but never meet on the elements it needs. It also does not test attribute values (`[data-fs-viewport='mobile']`), element names, pseudo-class states, or names inside `:where`, `:is`, `:not` and `:has`, which are not tokens. Two names appear only there: `is-preview` (`designer.css:1150`) and `open` (`designer.css:212`). Both are in use: `Canvas.tsx:535` sets the first, and the second is the native dialog attribute.
- Review: an independent agent recomputed every count from the run's output and found no dead selector. It corrected wording and caveats in this report; no verdict, count or plan hash changed.
