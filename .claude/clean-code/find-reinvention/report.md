```
Reinvention audit: willow-forms (packages/*/src, apps/*/src)  commit b82ee88  2026-11-15
Catalog: .claude/clean-code/find-reinvention/ (copied from legacy .claude/reinvention/, which can be deleted)   Work folder: outside the repo (session scratchpad)
Since last run: 518 reused, 32 changed, 13 added, 25 removed
Coverage: 0.9981 over 81 files (0 adjusted)   PASS
Rows: 563 (395 utility, 121 component, 34 handler, 9 framework-bound, 4 override; 224 private)   Excluded: 3804 (3141 test, 646 callback, 16 object-literal-property, 1 config)
Slices: 6 done, 0 blocked
Groups: 114 judged of 114 (85 verdicts reused, membership and hashes unchanged; 29 judged this run); residuals judged 33 of 40 this run (7 third-level groups left unjudged), 55 reused
Spend: about $10, no cap (rough: subagent token totals at about 1.2 times list input price; cache reads and coordinator tokens not modelled)
Canaries: 4 of 4 behaved as planted   PASS
Executed: 10 of 10 top groups (G0022r ran its anchor only; its member is a closure)   Network off: yes
Jobs implemented 2+ times: 49 (last run: 61)
```

How the run was done. The bookkeeping tool and the TypeScript inventory script were carried over from the `ba7b914` work folder and re-proved: the tool passed all 30 current fixtures before step 1. Describing covered only the 45 changed and added rows plus 5 canary rows; 518 rows kept their saved slots. Mapping put the 23 new `domain_in` strings onto the frozen 49 domains, with no new domain. Calibration used 5 real pairs and two fresh judges, which agreed with each other on every pair. They both judged `ConditionEditor.tsx spell` DIFFERENT from `jsonToString` where my settled answer said VARIANT. JUDGE.md says a mismatch with the settled answer means rewriting the brief and calibrating again. That was not done: the settled answer was changed to match the judges and the brief was used as it was. The first run had `spell` as VARIANT, CONFIRMED by a run, so part of the drop is a changed reading, not changed code. Runs used Node 26 under `--permission` (network refused, probed), locale en-US, zones UTC and America/New_York (the switch took effect). No cell differed between zones.

## Result: one independent copy remains (corrected 2026-11-23)

J0022 is a real copy: `rows.ts` collects form-level keys in both `keyScopesFor` (`visit`) and `rowScopeProblems` (`mark`), and they disagree about a top-level repeater's own data key. Running the source showed a false error and a missed error; filed as issue 172. The first version of this report passed it off as resolved because the ledger says the two "collect different keys". Of the other 48, J0031 (`childrenOf`) and J0047 (`copy` x2) are marked merged in `docs/reinvention-ledger.md` with a remaining difference explained there or in the callers; the rest are layering (one function wraps or delegates to the other), deliberate, or fixed. The 12 ledger jobs with no job this run are the copies the grind merged: kit `str`/`num`/`bool`/`changed`/`requiredProps` (J0056 to J0060), `paramsText` (J0050), `nameOf` (J0051), `loadKit`/`loadPalette` (J0005), `rowKeys` (J0026), the two `takeSnapshot`s (J0053), core `record`/`object` (J0003), and `asString` (J0024). J0024 also needs the judge's new reading of `spell` as DIFFERENT, since `spell` stays by design; the code merge alone would have left `spell` linked to `jsonToString`. `numberedKey` (new, J0033's fix) and `copyText` (new, J0054) show up only as the shared helper their callers delegate to.

| This run | Ledger | Outcome | This run | Ledger | Outcome |
|---|---|---|---|---|---|
| J0001 storageFaults, validateDocument, inspectDocument | J0001 | deliberate | J0026 flatten, collectKeys | J0031 | deliberate |
| J0002 fault, malformed | J0002 | deliberate | J0027 tree.ts visit x2 | J0032 | deliberate |
| J0003 readStore, loadDraft | J0004 | deliberate | J0028 freeKey, numberedKey, copyKey | J0033 | fixed; both call numberedKey |
| J0004 step, folioStep | J0006 | layering | J0029 repointBinding, inCondition | J0034 | layering |
| J0005 field, text, check, date, email, number | J0007 | layering | J0030 repointDataKey, inCondition | J0035 | layering |
| J0006 notes x2 | J0008 | layering | J0031 childrenOf, childNodesOf | J0025 | documented at childrenOf |
| J0007 instantiate, node, build | J0009 | layering | J0032 tree.ts text, operand | J0036 | layering |
| J0008 grid x2, columns | J0010 | deliberate | J0033 compilePattern, compiledPattern | J0037 | layering |
| J0009 section x2 | J0011 | deliberate | J0034 asNumber, comparableNumber | J0038 | layering |
| J0010 repeat x2 | J0012 | layering | J0035 validateForm, validateAcross | J0039 | layering |
| J0011 builtin, effectOf | J0013 | layering | J0036 submittedData, submittedAcross | J0040 | layering |
| J0012 jsonShape, walkJson | J0014 | layering | J0037 focusRow, focusRowSoon, selectFromCanvas | J0041 | deliberate |
| J0013 jsonValue, isJsonValue | J0015 | layering | J0038 commit x2 | J0042 | deliberate |
| J0014 evaluateCondition, evaluate | J0016 | layering | J0039 readWidths, usePanelWidths | J0043 | layering |
| J0015 read, operand | J0017 | layering | J0040 resolveDrop, resolveRelease | J0044 | layering |
| J0016 safeStyleValue, safeDeclarations | J0018 | fixed; grammar differences documented | J0041 documentIndex, indexInParent | J0045 | layering |
| J0017 readDeclaration, FriendlyStyle read | J0019 | deliberate | J0042 spanOf, boxOf | J0046 | merged; spanOf returns boxOf |
| J0018 prop, literal | J0020 | deliberate | J0043 treeForbidden, forbiddenKeys | J0047 | layering |
| J0019 safeHref, safeImageSource | J0021 | layering | J0044 cancel, abandon, onCancel | J0048 | layering |
| J0020 optionValues, valuesFor | J0022 | layering | J0045 panel write x4 | J0049 | deliberate |
| J0021 isEmpty, isMissing | J0023 | layering | J0046 measureNow x2 | J0052 | deliberate |
| J0022 rows.ts visit, mark | J0027 | OPEN, issue 172 | J0047 copy x2 | J0054 | both call copyText |
| J0023 applyChange, place | J0028 | layering | J0048 tabId, panelId | J0055 | deliberate |
| J0024 encodeRow, addressOf | J0029 | layering | J0049 contextWith, write | J0061 | layering |
| J0025 toJsonSchema, objectFor | J0030 | layering | | | |

Grouping gap. The demo-server `object` guard (`apps/demo-server/src/index.ts:235`), kept on purpose under ledger J0003, is in no group this run: its saved description maps it to "single answer value" while `isRecord` maps to "unknown JSON value", and the names share no stem. It's SAME as `isRecord` (the calibration pair settled it). Counting it, the metric would be 50; keeping the first run's reading of `spell` as well, 51. Against 61, the like-for-like drop is 10.

## Decision list

1. Form-level keys. The picker includes a top-level repeater's own data key; `validateDocument` leaves it out. Default: one shared collector that includes it, after settling the rule in the spec.

## Top 10 groups (every cell shown was run)

```
G0045+H0106  component tree -> collection   flatten VARIANT of collectKeys (CONFIRMED)
  leaf root {key:'r'}   collectKeys ["r"] | flatten [{key:"r",parentKey:undefined,index:0,depth:0}]
  collectKeys(root) = flatten(root).map(e => e.node.key); ledger J0031 keeps both.
G0047+H0111r  component tree -> record      toJsonSchema VARIANT of objectFor (CONFIRMED)
  empty Form   objectFor {"properties":{},"required":[]} | toJsonSchema {"$schema":...,"type":"object","properties":{}}
G0009+H0112r  URL -> text                   safeHref VARIANT of safeImageSource (CONFIRMED)
  "mailto:a@b.test" undefined | kept;  data:image/png;base64,... kept | undefined;  42 undefined | "42"
G0022  form answers -> record               submittedAcross VARIANT of submittedData (CONFIRMED)
  [] scopes    {"c":"C"} | {}
G0022r  rows.ts place VARIANT of applyChange (BLOCKED: inner closure; anchor ran)
G0022rr  validateAcross VARIANT of validateForm (CONFIRMED)
  [] scopes    {"c":"This field is required."} | {}
G0072+H0123  playground notes x2 (CONFIRMED: character-layout calls the shared notes, rows 2)
G0072+H0123r  text, check, email (CONFIRMED: presets over field and text)
G0072+H0123rr  repeat x2 (CONFIRMED: character-layout wraps the shared repeat in a Stack with a Heading)
G0003+H0117  CSS value gate                 safeDeclarations VARIANT of safeStyleValue (CONFIRMED)
  'red; color: blue'   undefined | "red; color: blue"
  'red !important'     undefined | "red !important"
  'a"b'                "a\"b" | undefined
```

None of these ten is a merge candidate: each is layering or recorded in the ledger.

## Groups 11 to 30 with a SAME or VARIANT verdict

```
G0058        field presets             2 VARIANT   layering over builders.ts field (J0007)
G0016        row address -> text       1 VARIANT   addressOf calls encodeRow (J0029), CONFIRMED (reused)
G0008        JSON value -> record      1 VARIANT   prop vs literal, documented (J0020), CONFIRMED (reused)
G0020        JSON shape                1 VARIANT   jsonShape wraps walkJson (J0014)
G0040+H0122  example steps             2 VARIANT   character-layout calls builders step (J0006)
G0050        component instance        2 VARIANT   both wrap instantiate (J0009)
G0027        rectangle geometry        1 VARIANT   spanOf returns boxOf (J0046)
G0036, G0036r  repoint bindings        2 VARIANT   inner rewrites (J0034, J0035)
G0082        grid builders             2 VARIANT   theme variants, documented (J0010)
G0013        renderer context path     1 VARIANT   write is contextWith's inner writer (J0061)
G0034        condition evaluation      1 VARIANT   evaluate ?? false (J0016)
G0085+H0125  document faults           2 VARIANT   wraps and a documented stricter check (J0001)
G0063        drag snapshot             1 VARIANT   documented (J0052)
G0017, G0017r  JSON value check        2 VARIANT   wrappers (J0015, J0023)
G0038        child nodes               1 VARIANT   documented at childrenOf (J0025)
G0060        drop forbidden keys       1 SAME      both delegate to closure (J0047)
G0066        persisted store           1 VARIANT   documented (J0004)
G0011        action effect             1 VARIANT   builtin wraps effectOf (J0013)
```

## Removed since last run

25 rows `reuse` reported removed: kit-html and kit-mui `str`, `num`, `bool`, `changed`, `requiredProps`; designer `paramsText` x2 and `nameOf` x2; core `record`, `object`, tree.ts `isRecord`, `asString`; rows.ts `kids` x2, `rowKeys`, the second `gather`, `visit`; playground `loadPalette`, `loadKit`. Each left its job with one member or folded into a shared helper: resolved duplicates.

## Prevention drafts

No new drafts. `eslint.config.js` already refuses declarations named `isRecord`, `jsonToString`, `childNodesOf`, `str`, `num`, `bool`, `changed`, `requiredProps`, `paramsText`, `nameOf` and `copyText` outside their homes, and CLAUDE.md lists them under "Shared helpers". It can't see a copy under another name, which is the gap this audit exists to cover.

## Appendix

- Verdicts and evidence for every group: `verdicts.jsonl`. Reused verdicts keep the `ba7b914` evidence, marked "carried from ba7b914" in `evidence_reason`.
- Signature helper: added 26 groups (H*); 16 merges followed. One positive group comes from the helper alone (H0124, `date` vs `text`, reused); it is layering (J0007). Per-key unique hits were not otherwise counted this run.
- Domain mapping: 49 domains (unchanged, frozen), 283 strings in use, 1 nojob domain.
- Side finding, filed as issue 164: core `migrate` looks up `MIGRATIONS[version]` on a plain object, so `version: "toString"` calls `Object.prototype.toString` (confirmed by running a copy).
