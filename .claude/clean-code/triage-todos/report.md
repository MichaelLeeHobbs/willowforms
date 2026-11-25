# TODO triage: .

Commit 8e92d4cdbf476b77b614611d869ec24e35919337 (dirty: no). Run 2026-11-25. Trackers: GitHub issues on MichaelLeeHobbs/willowforms (#n).
Version control: yes. Tracker access: yes. Unmarked pass: on.

## Headline

Markers: 0 (tagged 0, unmarked 0). Skipped paths: 25 (clean-code folder 18, vendored 7).
Stale: 0 (Delete 0, Rewrite 0). Link: 0. Keep: 0. Conflict: 0. Unproven: 0.
Unmarked hits rejected: 10 (no condition 9, describes a value 1, string literal 0).

Zero is what the skill's listed tags and phrases find, not proof that no comment makes a promise. Six comments make one in other words. They are below, outside every count.

## Delete

None.

## Rewrite

None.

## Link

None.

## Conflict

None.

## Unproven

None.

## Keep

None.

## Outside the listed phrases (not counted)

`MARKERS.md` fixes the unmarked phrases, so these are not markers and change no number above. Adding them to the count would break the check that the count matches the search. A wider search of every comment found three of them, and a separate reader found all six (see Check). "Table" is what the decision table would give if the comment were a marker. Tracker read 2026-11-25.

| Path:line | Text | Issue | State (read) | Written | Code since | Condition now | Table |
|---|---|---|---|---|---|---|---|
| .github/dependabot.yml:15 | Node types track the oldest supported runtime (engines: node >=24), so | none | none | e1b62cb 2026-11-15, reworded 393679c 2026-11-24 | unchanged | holds: the packages' engines are `>=24`, `@types/node` is `^24.19.2` | row 13, no change proposed: it already reads as a rule |
| eslint.config.js:1 | Pinned to eslint 9, the newest major that the peer ranges of eslint-plugin-react | none | none | b0866be 2026-11-23 | unchanged | holds at the locked versions: the peers are `^9.7` (eslint-plugin-react 7.37.5) and `^9` (jsx-a11y 6.10.2), eslint is 9.39.5. Newer plugin releases were not checked | row 13, no change proposed: it already states a fact |
| packages/core/src/document.ts:21 | Add version N -> N+1 migrations here when a second document version is | none | none | b3339a9 2026-09-04 | unchanged (`MIGRATIONS`, line 26) | holds: `MIGRATIONS` is empty | row 13, no change proposed: a lasting instruction for whoever adds a version |
| packages/core/src/tree.test.ts:1686 | The premise. If this ever starts reporting, the three tests below are | none | none | b9dd190 2026-08-31 | unchanged | holds: the assertion at line 1689 still expects no report | row 13, no change proposed: it explains the assertion it sits on |
| playwright.config.ts:23 | See #190 before raising this. | #190 | open, "OPEN" | fffd0b6 2026-11-24 | unchanged (`workers`, d32795b) | holds: `workers: 2`, line 24 | Keep, row 9 |
| pnpm-workspace.yaml:5 | Strict peers refuse every install that resolves again, because this plugin decla | none | none | 5d2d6dd 2026-11-24 | unchanged, lines 7-9 | holds: `typescript` is 5.9.3, and the locked `@vitest/eslint-plugin` 1.6.28 declares the peer `>=6.0.0` | Link, row 12 |

Issue draft for `pnpm-workspace.yaml:5`, shown for a yes or no and not filed:

- Title: TypeScript 6 is refused, so pnpm-workspace.yaml has to override an ESLint plugin's peer range
- Body, line 1: `peerDependencyRules.allowedVersions` lets `@vitest/eslint-plugin` install with TypeScript 5.9.3 although it declares `>=6.0.0`. The comment says to remove it with the TypeScript 6 upgrade.
- Body, line 2: no issue tracks that upgrade. #196 suggested it as its own change, and pull request 94 (5.9.3 to 6.0.3) was closed on 2026-09-04 because typechecking failed.

Read and left out:

- `playwright.config.ts:48` and `playwright.dist.config.ts:28`, "No pnpm in front: see #163". #163 is closed as completed (2026-11-24), by d32795b, which added the command the comment explains. It records why, and promises no change.
- `.github/workflows/ci.yml:20` and `playwright.config.ts:26` cite #184, the pull request that made the change they explain.
- 21 comments the separate reader called borderline, most of them browser, jsdom or library facts with no stated action. Two of the 21 are the #163 notes above.

## Rejected unmarked hits

| Path:line | Phrase | Reason |
|---|---|---|
| apps/demo-server/src/index.ts:75 | temporary | describes a value: a temporary file |
| e2e/harness.ts:162 | until | no condition: a loop at run time |
| packages/core/src/validation.ts:535 | temporary | no condition: a field's hidden state at run time |
| packages/designer/src/Icon.tsx:9 | until | no condition: a lasting compile-time guard |
| packages/designer/src/designer.css.test.ts:109 | until | no condition: how the allowlist works |
| packages/designer/src/dnd.test.ts:356 | until | no condition: loop behaviour |
| packages/designer/src/drag.test.ts:635 | until | no condition: a listener's lifetime |
| packages/kit-html/src/kit-html.css:175 | until | no condition: layout at run time |
| packages/renderer/src/index.tsx:279 | until | no condition: state between renders |
| test/clipboard.ts:4 | until | no condition: a stub's lifetime |

## Canaries

Markers: 45 tagged planted, 45 found; 12 unmarked promises planted, 12 found; 11 negatives with no condition rejected, and no string, template, regex, attribute or prose negative found. Canary files: ts, tsx, js, jsonc, css, yaml, ignore files, ini files, xml, html, markdown. Verdicts: 7 of 7 on their planted verdict.

Forms added because `MARKERS.md` lists no such language: jsonc (`//` and `/* */`), ignore files (`#` at line start), ini files (`#` and `;` at line start), and code fences in Markdown by the fence's language.

## Check

- Marker count matches search: PASS (0 = 10 hits - 10 rejected; 313 tracked paths = 288 searched + 25 skipped; 1585 comments)
- Every Delete and Rewrite has a dated issue state or a commit: PASS (no Delete or Rewrite rows)
- Verifier: no Delete, Rewrite or Keep row to re-decide. So the rejections were checked instead: a separate reader, not told these verdicts, read all 1585 comments and rejected the same 10 hits, 0 disagreements
- Raw search cross-check: PASS. No TODO, FIXME, HACK or XXX in any tracked file outside `clean-code/`. 24 lines outside Markdown hold a listed phrase: the 10 hits above and 14 in code, test names, strings or JSX text
- debt-ledger cross-check: PASS (its list, at 5d2d6dd, has 0 markers, so none is missing)
- Run record appended: PASS

Recommendation: no counted marker sits on an open issue, so no line for the repo's agent context file is suggested.
