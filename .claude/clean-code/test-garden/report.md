The flaky lane did not run. CI keeps no per-test reports, so there is no evidence for it and the slow lane used local timings (rung b).

```
Test garden: MichaelLeeHobbs/willowforms  commit 5d2d6dd3f9c6212cf8bb85280d41d0ba5ef988ed  2026-11-25
Catalog: .claude/clean-code/test-garden   Work folder: session scratchpad, folder tg (outside the repo, not kept)
Lanes: slow run  flaky not run (no CI test reports)  weak run  dupes run
Inventory: 3139 tests in 107 files; never ran 0, shortfall 0, broken 0, excepted 1   PASS
Evidence: rung b, window 14 days, 12 local runs from 3 job ids, partial: no, retry results visible: no
Slow: 3139 tests and 71 file rows ranked, 0 unseen, 0 orphans (ids unstable: no)
Flaky: not run
Weak: 86 judged of 197 candidate ids (0 cut by budget, 111 unmapped): cannot_fail 0, unreached 0, weak 53, ok 33, blocked 0
Dupes: 93 groups, 30 judged: 46 SAME, 54 VARIANT, 71 DIFFERENT; copied setup blocks not covered
Canaries: 7 of 7 behaved as planted   PASS
Since last run: first run
```

## How to read it

- Costs are machine time, not CI wall time. The whole suite costs 1734 test-seconds a day (about 29 machine-minutes), so no single row is a large win.
- Timing noise: the machine was shared with other sessions' test runs during 27 of 35 checks (20 s apart) during the runs used. Run 1 was the cold run and was dropped.
- `local-unit` counts the CI runs of the unit step (verify + react-18), `local-e2e` and `local-dist` count theirs. The skill assumes one CI job runs the whole suite and none does, so each suite is its own job.
- Weak verdicts are per test. A negative test that survives an inverted guard can still be covered by its neighbours.
- Every row has 4 measurements, so all are flagged `low_n`.

## Do this first

1. 62.3 test-seconds a day: test `test/eslint.config.test.ts > the invariants are enforced by the linter, not only by CLAUDE.md > reports what it is supposed to report, and nothing on what is allowed` (mean 11184 ms, 5.57 runs a day).
2. 39.5 test-seconds a day: test `e2e/font-style.spec.ts > mui: font controls style the D&D heading, preserve decorations, and follow device overrides` (mean 7578 ms, 5.21 runs a day).
3. 38.1 test-seconds a day: test `e2e/examples.spec.ts > previews every example through both kits` (mean 7309 ms, 5.21 runs a day).
4. 34.9 test-seconds a day: test `test/readme.test.ts > the examples in every published README > compile against the packages they import` (mean 6266 ms, 5.57 runs a day).
5. 31.3 test-seconds a day: test `e2e/character-layout.spec.ts > mui character folio uses desktop columns and keeps every page within the desktop canvas` (mean 6010 ms, 5.21 runs a day).

None of the judged tests is `cannot_fail` or `unreached`, so no test costs time while protecting nothing (within the 86 judged).

## Slow table (top 30)

| # | Test or file | kind | test-s/day | runs/day | n | mean ms | median | p90 | basis | flags |
| - | - | - | - | - | - | - | - | - | - | - |
| 1 | test/eslint.config.test.ts > the invariants are enforced by the linter, not only by CLAUDE.md > reports what it is supposed to report, and nothing on what is allowed | test | 62.3 | 5.57 | 4 | 11184 | 10163 | 14307 | local | low_n |
| 2 | e2e/font-style.spec.ts > mui: font controls style the D&D heading, preserve decorations, and follow device overrides | test | 39.5 | 5.21 | 4 | 7578 | 7100 | 8195 | local | low_n |
| 3 | e2e/examples.spec.ts > previews every example through both kits | test | 38.1 | 5.21 | 4 | 7309 | 7044 | 7744 | local | low_n |
| 4 | test/readme.test.ts > the examples in every published README > compile against the packages they import | test | 34.9 | 5.57 | 4 | 6266 | 5914 | 7971 | local | low_n |
| 5 | e2e/character-layout.spec.ts > mui character folio uses desktop columns and keeps every page within the desktop canvas | test | 31.3 | 5.21 | 4 | 6010 | 5880 | 6278 | local | low_n |
| 6 | e2e/friendly-style.spec.ts > mui: center and format the D&D heading without opening CSS | test | 29.8 | 5.21 | 4 | 5724 | 5472 | 6052 | local | low_n |
| 7 | e2e/examples.spec.ts > mui previews the D&D character sheet and retains answers between its pages | test | 20.8 | 5.21 | 4 | 3981 | 3853 | 4236 | local | low_n |
| 8 | e2e/character-layout.spec.ts > html character folio uses desktop columns and keeps every page within the desktop canvas | test | 19.3 | 5.21 | 4 | 3692 | 3559 | 3892 | local | low_n |
| 9 | e2e/friendly-style.spec.ts > html: center and format the D&D heading without opening CSS | test | 16.6 | 5.21 | 4 | 3174 | 3130 | 3281 | local | low_n |
| 10 | e2e/font-style.spec.ts > html: font controls style the D&D heading, preserve decorations, and follow device overrides | test | 16.3 | 5.21 | 4 | 3134 | 3006 | 3388 | local | low_n |
| 11 | e2e/focused-preview.spec.ts > Preview preserves editing panels and keeps diagnostics optional | test | 16.3 | 5.21 | 4 | 3118 | 3094 | 3253 | local | low_n |
| 12 | e2e/preview-navigation.spec.ts > mui starts each preview page at the top and restores keyboard navigation | test | 14.1 | 5.21 | 4 | 2702 | 2642 | 2850 | local | low_n |
| 13 | e2e/examples.spec.ts > html previews the D&D character sheet and retains answers between its pages | test | 13.4 | 5.21 | 4 | 2560 | 2493 | 2691 | local | low_n |
| 14 | e2e/examples.spec.ts > browses examples without losing the original draft or edited examples | test | 12.2 | 5.21 | 4 | 2333 | 2236 | 2504 | local | low_n |
| 15 | e2e/images.spec.ts > html: images and backgrounds load, fit, embed, clear, and undo | test | 11.0 | 5.21 | 4 | 2101 | 2050 | 2218 | local | low_n |
| 16 | e2e/palettes.spec.ts > editing chrome distinguishes fields, selection, hover, and focus in both palettes | test | 10.9 | 5.21 | 4 | 2089 | 2079 | 2126 | local | low_n |
| 17 | e2e/images.spec.ts > mui: images and backgrounds load, fit, embed, clear, and undo | test | 10.8 | 5.21 | 4 | 2074 | 2063 | 2100 | local | low_n |
| 18 | e2e/preview-navigation.spec.ts > html starts each preview page at the top and restores keyboard navigation | test | 10.7 | 5.21 | 4 | 2061 | 2045 | 2127 | local | low_n |
| 19 | e2e/authoring-presets.spec.ts > mui presets are editable, exportable, and usable on a phone | test | 10.3 | 5.21 | 4 | 1978 | 1995 | 2007 | local | low_n |
| 20 | e2e/panel-resize.spec.ts > keyboard resizing, canceled drags, and default reset keep selection and accessible separator values intact | test | 10.1 | 5.21 | 4 | 1939 | 1916 | 2004 | local | low_n |
| 21 | e2e/inline-fields.spec.ts > mui inline fields keep labels, control widths, errors, and keyboard input usable | test | 10.0 | 5.21 | 4 | 1920 | 1905 | 1971 | local | low_n |
| 22 | e2e/palettes.spec.ts > new palettes keep header controls and the gallery accessible on a narrow screen | test | 9.8 | 5.21 | 4 | 1888 | 1863 | 1944 | local | low_n |
| 23 | e2e/authoring-presets.spec.ts > html presets are editable, exportable, and usable on a phone | test | 9.1 | 5.21 | 4 | 1744 | 1692 | 1888 | local | low_n |
| 24 | e2e/density.spec.ts > mui imports density, inherits it, and keeps section overrides and errors usable | test | 9.1 | 5.21 | 4 | 1739 | 1735 | 1773 | local | low_n |
| 25 | e2e/palettes.spec.ts > mui: chrome palettes preserve form styling and answers in explicit and system modes | test | 8.3 | 5.21 | 4 | 1591 | 1565 | 1676 | local | low_n |
| 26 | e2e/tree-drag.spec.ts > the row under the pointer says where a drop would go, and Escape drops nothing | test | 8.3 | 5.21 | 4 | 1590 | 1591 | 1638 | local | low_n |
| 27 | e2e/runtime-accessibility.spec.ts > mui dark runtime catalogue has accessible names, descriptions, and browser markup | test | 8.3 | 5.21 | 4 | 1584 | 1575 | 1623 | local | low_n |
| 28 | e2e/preview-data.spec.ts > mui: Preview exposes answer JSON with data keys, types, rows, and clipboard fallback | test | 8.2 | 5.21 | 4 | 1564 | 1518 | 1654 | local | low_n |
| 29 | e2e/options-editor.spec.ts > mui: authors choice labels, typed values, and order without JSON | test | 7.8 | 5.21 | 4 | 1498 | 1490 | 1532 | local | low_n |
| 30 | e2e/runtime-accessibility.spec.ts > mui light runtime catalogue has accessible names, descriptions, and browser markup | test | 7.7 | 5.21 | 4 | 1485 | 1467 | 1541 | local | low_n |

## Weak

Targets: 25 functions; 41 test declarations (86 ids) were judged, 18 of them weak. Candidates: 87 declarations with a tell plus the 10 slowest tests (one tell I added to the skill list: an assertion only on `toBeDefined`, `toBeTruthy` or `toHaveBeenCalled`); everything not mapped to one directly called function (UI tests through `render`, e2e, config and README tests) is unmapped, so it was not judged.

| Class | ids |
| - | - |
| cannot_fail | 0 |
| unreached | 0 |
| weak | 53 |
| ok | 33 |
| blocked | 0 |

The 10 weak tests with the highest slow cost:

| ms/day | Test | survivors |
| - | - | - |
| 43 | packages/core/src/validation.test.ts > every non-required rule passes on an empty value > still fails each of them on a value that is not empty | 1 |
| 18 | packages/designer/src/drag.test.ts > the drop zone handshake > stops asking a zone once it unregisters | 1 |
| 15 | apps/playground/src/examples/character-sheet.test.ts > includes six abilities, eighteen distinct skills, and all nine spell-slot levels | 1 |
| 15 | packages/core/src/schema.test.ts > the two branches the deep test never took > survives children that are not an array, like unexportableRules does | 1 |
| 15 | packages/designer/src/geometry.test.ts > finding a node in a canvas that repeats one > still finds a node that is in no row | 1 |
| 12 | packages/designer/src/drag.test.ts > the drop zone handshake > commits nothing when no zone claims the release | 1 |
| 9 | packages/designer/src/drag.test.ts > a drag that does not finish normally > commits nothing when the drag was abandoned | 1 |
| 6 | packages/designer/src/store.regressions.test.ts > the store and edits that changed nothing > says nothing about a document that is fine | 2 |
| 5 | packages/designer/src/store.regressions.test.ts > the document a host hands in, checked once > says nothing about a document that validates | 2 |
| 1 | packages/core/src/keys.test.ts > the key grammar > refuses what would break the things a key is used for | 1 |

Most weak ids are parametrised rows of `keyProblem refuses X`, `applyRule ... does not pass` and the empty-value rules. They use a loose `toBeDefined` or `toBeTruthy`, so inverting the first guard still passes (value mutants that change the answer were killed). Fix: assert the message or the exact value (write-tests trap 1.1, "The assertion that cannot fail", in the weaker form "proves the crash, not the answer").

## Dupes

Groups judged: the 30 largest of 93 (1 stop stem, `field`, 28 helpers, not grouped). Every member has 0 importers (nothing here is exported and imported), so "keep" is the one the judge named.
Groups overlap (G0083's SAME cluster is inside G0008; G0001 shares four of its five members with G0080), so a member can be counted twice; distinct members: 34 SAME, 52 VARIANT.
SAME: the harness ran both copies and they agreed (41 confirmed, 5 blocked). VARIANT: 27 confirmed by differing output, 27 blocked (need the repo, a page or a render). Diffs marked predicted are the judge's reading, not run. "!" = an assertion in that test file reads the differing field, so merging changes a result.

| Group | Job | Keep | SAME | VARIANT | DIFFERENT | What varies |
| - | - | - | - | - | - | - |
| G0080 stem: | Wrap a list of child nodes in an empty-props Screen root. | core/src/css.test.ts:21 | 3 (3 run) | 1 (1 run) | - | parameter: one child node instead of a children ar |
| G0080 stem: | An empty Screen root with no children. | core/src/factory.test.ts:106 | 2 (2 run) | 0 | - |  |
| G0080 stem: | A Screen root holding an addressList/addresses Repeater with | core/src/rows.test.ts:883 | 1 (1 run) | 2 (2 run) | - | ! extra row child postal/postcode (no rules); ! repeater schema.validations ([] vs [maxLength 3]) |
| G0084 stem: | Render Designer over a fixture document with the fake kits,  | designer/src/Designer.test.tsx:89 | 0 | 7 (0 run) | 4 | ! document fixture (makeDocument(languages)); ! document fixture (makeDocument()) |
| G0083 stem: | Fake renderer component: a div with nodeProps and its childr | designer/src/Designer.test.tsx:20 | 8 (8 run) | 0 | 1 |  |
| G0041 stem: | Wrap a tree in an otherwise empty FormDocument. | core/src/depth.test.ts:64 | 0 | 5 (0 run) | 1 | id; id |
| G0010 same: | Fake RendererKit 'fake' with Screen and Field renderers. | designer/src/Designer.test.tsx:27 | 1 (1 run) | 3 (3 run) | 0 | renderers.Field (renders an empty div, not the lab; renderers.Field (renders an empty div, not the lab |
| G0066 stem: | A document with a lines repeater nested in an orders repeate | core/src/schema.test.ts:303 | 0 | 1 (0 run) | 3 | ! document id and name |
| G0092 stem: | Form answers with an email and two one-field address rows. | renderer/src/renderer.test.tsx:435 | 1 (1 run) | 0 | 2 |  |
| G0039 stem: | Wrap nodes in an otherwise empty FormDocument. | core/src/rows.test.ts:1155 | 0 | 3 (0 run) | - | ! id; parameter: the root instead of its children |
| G0039 stem: | A document whose row field vat is conditional on the row fie | core/src/rows.test.ts:286 | 0 | 1 (0 run) | - | ! repeater, checkbox and vat keys (orderList/busines |
| G0056 stem: | Fake designer Kit for a panel test, with a data-bound Field  | designer/src/Designer.test.tsx:29 | 0 | 8 (8 run) | 2 | ! no Screen component; component order |
| G0040 stem: | Panel-test document holding one email Field. | designer/src/panels/Binding.test.tsx:47 | 0 | 2 (0 run) | - | ! no languages parameter; ! validations parameter instead of languages |
| G0067 stem: | A string TextField node with validation rules. | core/src/validation.test.ts:306 | 0 | 1 (1 run) | 5 | ! key (parameter vs fixed 'email') |
| G0086 stem: | A Box step shown when the context step equals its name. | apps/demo-server/src/index.test.ts:251 | 2 (2 run) | 1 (1 run) | 2 | key (name is not capitalised) |
| G0026 stem: | A kit Box node 'target' with padding, radius and background  | kit-mui/src/renderers.test.tsx:37 | 1 (0 run) | 0 | 3 |  |
| G0073 stem: | Read a text file by a relative path. | kit-html/src/renderers.test.tsx:6 | 0 | 3 (0 run) | 1 | ! base directory (the file's own import.meta.url); ! base directory (repository root) |
| G0009 same: | Fake renderer component: a div with nodeProps showing its st | designer/src/Designer.test.tsx:23 | 3 (3 run) | 0 | 0 |  |
| G0079 stem: | A string schema with a required rule. | core/src/context.test.ts:16 | 1 (1 run) | 0 | - |  |
| G0079 stem: | A required string TextField node. | core/src/validation.test.ts:872 | 0 | 1 (0 run) | - | ! parameter: label, from which the key is derived |
| G0002 same: | A minimal Field ComponentDef. | core/src/factory.test.ts:97 | 2 (2 run) | 0 | 0 |  |
| G0008 same: | Fake renderer component: a div with nodeProps and its childr | designer/src/Designer.test.tsx:20 | 11 (11 run) | 0 | 0 |  |
| G0075 stem: | Fake RendererKit for a designer panel test. | designer/src/Designer.test.tsx:27 | 1 (1 run) | 8 (8 run) | 0 | id; ! renderers.Field (input, error and render counter) |
| G0069 stem: | Render Designer with the fake kits over a given document. | designer/src/panels/Canvas.test.tsx:410 | 0 | 1 (0 run) | - | ! initialDocument (stepped() vs conditional()) |
| G0069 stem: | Open the Properties harness on a node and select it. | designer/src/panels/Properties.test.tsx:411 | 0 | 1 (0 run) | - | ! literal parameter |
| G0069 stem: | Render Designer with the HTML kit over a document holding th | test/designer-embedding.test.tsx:9 | 1 (0 run) | 0 | - |  |
| G0001 same: | Wrap a list of child nodes in an empty-props Screen root. | core/src/context.test.ts:312 | 4 (4 run) | 0 | 0 |  |
| G0027 stem: | A Screen root with malformed contents. | core/src/context.test.ts:413 | 0 | 1 (1 run) | 3 | parameter: the children value instead of a patch o |
| G0077 stem: | Build a Repeater node. | core/src/rows.test.ts:1146 | 0 | 1 (0 run) | - | ! key and dataKey (fixed vs parameters) |
| G0077 stem: | A panel-test document whose root holds an addressList repeat | designer/src/panels/Rules.test.tsx:495 | 0 | 1 (1 run) | - | ! base document and whether its children are kept |
| G0025 stem: | An evaluator that always throws. | core/src/validation.test.ts:1283 | 1 (0 run) | 1 (0 run) | 1 | error message |
| G0085 stem: | A second plain string Field node beside the one under test. | designer/src/panels/Properties.test.tsx:1517 | 1 (1 run) | 1 (1 run) | 1 | key ('firstName' vs 'other') |
| G0003 same: | Instantiate a definition, failing the test when it is refuse | core/src/factory.test.ts:9 | 2 (0 run) | 0 | 0 |  |

Largest cluster: a pass-through `Screen_`/`Node`/`List`/`Box` renderer, 12 identical copies in 11 test files (G0008, and its 9-member subset in G0083), and a fake `rendererKit` in 10 designer test files (G0075). Canary rows were removed from these counts.

## Checks and deviations

- Fixtures: 29 of 29 passed. `verify --check coverage` and `verify --check reports` pass (12 runs used, 12556 samples).
- The inventory was re-run with real collection: `vitest list` in 5.x parses statically and does not expand parametrised titles.
- Weak: 25 targets mutated over 143 vitest runs in 160 s, selected by whole file because `file:line` misses `it.each`. Canary ids kept off every list. Canaries: slow 2.0 s sleep (1), weak W1 cannot_fail, W2 weak, W3 ok, W4 unreached (4), dupes D1 VARIANT with its changed field in the diff, D2 DIFFERENT (2). The skill plants no flaky canary when the lane is not run.
- Copied setup inside test bodies is not covered. `ignore.jsonl`: no entries proposed.
- To run the flaky lane, CI has to upload per-test results (a JUnit or JSON reporter in vitest and Playwright, uploaded by each job). Neither does today.
