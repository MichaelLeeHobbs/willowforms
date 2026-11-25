# Debt ledger report

```
Debt ledger: willowforms  commit 5d2d6dd3f9c6212cf8bb85280d41d0ba5ef988ed  2026-11-25   spec 1
Ledger: .claude/clean-code/debt-ledger/ (committed: yes)   Work folder: outside the repo (session scratchpad)
Since last run: first run (9 added)
Trend: not comparable (first_run)
Coverage: items 1.0000 over 293 files; baselines none found (0 files)   PASS
Canaries: patterns 10 of 10 languages, baseline 8 of 8 planted changes   PASS
Ages: from blame committer date, lower bounds
```

## Headline

```
Markers      0  (first run)   none of TODO, FIXME, HACK, XXX
Inline       8  (first run)   rule-specific suppressions
Blanket      1  (first run)   suppressions naming no rule
```

Baselines: none. No file BASELINES.md names, supported or unsupported, is tracked at this commit, so there are no entries, rule-offs or baseline changes to classify.

## Ages and owners

Ages in days (lower bounds): 0-29: 4, 30-89: 4, 90-364: 1, 365-729: 0, 730+: 0, unknown: 0. Re-derived 3 dates from the blamed commit's log entry; all agree.

Owners: packages/core 7, packages/designer 2. The repo has no code-owners file, so every owner is a package folder.

## Oldest 9 (all items)

```
packages/core/src/json.ts:150           inline   no-control-regex                     91  packages/core
packages/core/src/css.ts:80             inline   no-control-regex                     89  packages/core
packages/core/src/css.ts:110            inline   no-control-regex                     89  packages/core
packages/core/src/json.test.ts:171      inline   @typescript-eslint/unbound-method    86  packages/core
packages/core/src/json.test.ts:174      blanket  *                                    86  packages/core
packages/core/src/guards.ts:2           inline   no-restricted-syntax                 10  packages/core
packages/designer/src/language.ts:27    inline   no-restricted-syntax                 10  packages/designer
packages/designer/src/panels/text.ts:5  inline   no-restricted-syntax                 10  packages/designer
packages/core/src/rows.ts:127           inline   no-restricted-syntax                  1  packages/core
```

Identical items in one file share their dates as a group: which of two identical lines is older is not known.

## Footer

- Patterns: languages css, hash, html, js, jsonc, markdown, ts, tsx, xml, yaml; pattern-set hash a6db23bdb0ace83e7c6897de9c8b4b41ef4f9e10d5c97343c152bf34564dd127. Rows added this run, because PATTERNS.md lists no such language: `jsonc` (JSON files with C-family comments, as in tsconfig files) and `hash` (.npmrc, .gitignore, .gitattributes, .editorconfig and .prettierignore with `#` comments).
- Out of scope: clean-code folder 8. Tracked files at the commit: 301; searched: 293, of which 6 (the LICENSE files) have no comment syntax and got only the loose search. No file is marked vendored or generated.
- Loose hits: 10. Excluded, by reason: directive named in prose (code span) 1. Unexplained: 0.
- Before sharing this report outside the team, check that no path names a customer or a confidential project.
