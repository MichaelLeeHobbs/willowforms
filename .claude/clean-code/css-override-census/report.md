# CSS override census

```
CSS override census: willowforms (whole repo)  commit 5d2d6dd3f9c6212cf8bb85280d41d0ba5ef988ed  2026-11-25
Catalog: .claude/clean-code/css-override-census/   Work folder: session scratchpad, outside the repo
Coverage: 1.0000 over 20 files (0 unparsed)   PASS
Rules: 406 (0 bad selectors)   Skipped: 2 rules inside @keyframes   Unexpanded: 0 @extend, 0 @include
!important: 0 in 0 rules  by cause: a11y-print 0, inline-style 0, library 0, own-code 0, unknown 0, utility 0  (0 BLOCKED)
Library internals: 0 rules use 0 internal classes; 0 dead now
Deep chains: 0 rules with 4+ compounds   ID selectors: 0   Max specificity: 0,3,1
z-index: 3 distinct values in 4 uses; 3 layers needed; 0 named
Canaries: 6 of 6 behaved as planted   PASS
Since last run: first run
```

Result: there is almost nothing to remove. The repo has no `!important`, no selector naming a Material UI internal class, no ID selector and no chain of four compounds. The findings are two defects in how the stylesheets meet a host page (decisions 1 and 2).

## Decision list

1. Isolate the designer's stacking (issue 205). `.fs-selection` at 4000 (designer.css:1159) and `.fs-drop` / `.fs-drag-label` at 5000 (designer.css:904, :921) compete in the host page, because nothing from `.fs-shell` down creates a stacking context. In a headless Chromium probe of the stylesheet, the selection toolbar painted over and took clicks through a host modal at 1300; `.fs-shell { isolation: isolate }` fixed it. Default: yes.
2. Make an explicit dark theme keep a host's token overrides (issue 206). `.fs-shell[data-fs-theme='dark']` and `.fsh-screen[data-fsh-theme='dark']` are (0,2,0), so a host's `.fs-shell { --fs-primary }` loses under Dark but wins under System on a dark machine. Measured in Chromium in both stylesheets. Default: wrap the attribute in `:where()`, as the system-dark blocks already do.
3. Adopt z tokens for the 3 layers (guide 1, selection 4000, drag 5000). Default: no. Four uses in one file, and a comment gives the reason for the two large values. Reconsider if decision 1 leads to renumbering.
4. Put library CSS in a lower cascade layer. Default: no. There are 0 library-cause `!important` for it to remove.
5. Apply the hot-spot rewrites below. Default: no. The highest specificity is (0,3,1) at depth 2, and lowering chrome rules to one class exposes them to a host's element rules such as `button:hover` (0,1,1).

## Dead overrides

None. No selector uses a library's internal class, so there was no token to search for.

## Library internals by component

None. Material UI (7.3.11 installed) is customized only through its public API: `sx` and `slotProps` (packages/kit-mui/src/renderers.tsx, 10 rules) and theme `styleOverrides` (packages/kit-mui/src/DensityTheme.tsx, apps/playground/src/character-theme.ts). The one `sx` selector key is `& > *`.

One rule exists to beat a library rule: designer.css:1150 `.fs-canvas__surface:not(.is-preview) [data-fs-key]` restores `pointer-events`, which MUI's disabled ButtonBase sets to none (`@mui/material/ButtonBase/ButtonBase.js:75`). It names no library class, and `packages/designer/src/designer.css.test.ts:101` pins the one property it may set.

One rule crosses packages: palettes.css:24 sets `--fs-*` tokens on `.fs-shell`, the documented theming surface (`docs/spec/11-theming.md:45`).

## The z ladder

| Value | Uses | Files | What it stacks | Proposed layer |
|---|---|---|---|---|
| 1 | 1 | 1 | dashed page guide, inside the canvas frame (designer.css:970) | guide |
| 4000 | 1 | 1 | selection and hover frames, with the toolbar (designer.css:1159) | selection |
| 5000 | 2 | 1 | drop indicator (designer.css:904), drag label (designer.css:921) | drag |

No two values stack in the wrong order. Tokens, if decision 3 is taken, in the existing `.fs-shell` custom properties:

```css
--fs-z-guide: 1;
--fs-z-selection: 4000;
--fs-z-drag: 5000;
```

Spaced values of 100, 200, 300 are not safe today: the selection shares the rendered form's stacking context and has to clear a kit's own raised elements (MUI's AppBar is 1100; see the comment above designer.css:901). Isolating `.fs-canvas__frame` as well as `.fs-shell` would make selection 100 and drag 200 safe. The guide should stay 1 even then: it is inside the frame, and a higher value would draw it over MUI's outlined labels. That is not tested.

## Cascade layers

Browser support allows `@layer` (`docs/COMPATIBILITY.md`, evergreen browsers). Nothing needs it. If it is ever needed, MUI injects its styles at runtime and the installed version exposes `enableCssLayer` on `StyledEngineProvider` (`@mui/styled-engine/StyledEngineProvider/StyledEngineProvider.d.ts:4`).

## Hot spots and files

| Rank | Rule | Spec | Rewrite, and what it stops needing to beat |
|---|---|---|---|
| 1 | designer.css:1209 `.fs-selection__toolbar button.is-danger:hover` | 0,3,1 | `.fs-selection__danger:hover`, with the base and hover rules moved to `.fs-selection__action`; stops beating designer.css:1204 |
| 2 | designer.css:654 `.fs-dialog__actions button.is-primary:hover` | 0,3,1 | `.fs-dialog__primary:hover`, with the shared rules moved to `.fs-dialog__action`; stops beating the `button:hover` rule above it |
| 3 | kit-html.css:452 `.fsh-switch__input:checked + .fsh-switch__track::after` | 0,3,1 | `:where(.fsh-switch__input:checked) + .fsh-switch__track::after`; wins over the base thumb by order |
| 4 | kit-html.css:610, the same selector under forced colors | 0,3,1 | the same `:where()` form, changed together with rank 3 |
| 5 | palettes.css:24 `.pg-app[data-pg-palette='desert'] .fs-shell` | 0,3,0 | `:where(.pg-app[data-pg-palette='desert']) .fs-shell`, only after decision 2; it has to beat (0,2,0) until then |
| 6 | designer.css:1089 `.fs-toolbar__toggle.is-active .fs-icon` | 0,3,0 | `:where(.fs-toolbar__toggle.is-active) .fs-icon`; wins over designer.css:385 by order |
| 7 | designer.css:1150 `.fs-canvas__surface:not(.is-preview) [data-fs-key]` | 0,3,0 | keep: it has to beat a kit's own disabled rule |
| 8 | designer.css:185 `.fs-body[data-fs-desktop-editing] > .fs-panel` | 0,3,0 | `:where(.fs-body[data-fs-desktop-editing]) > .fs-panel` |
| 9 | designer.css:190 `.fs-body[data-fs-desktop-editing] > .fs-canvas` | 0,3,0 | the same form, moved below designer.css:443, whose `min-width: 0` would otherwise win |
| 10 | designer.css:344 `.fs-palette__disclosure[aria-expanded='true'] .fs-icon` | 0,3,0 | `:where(.fs-palette__disclosure[aria-expanded='true']) .fs-icon`; no base rule sets `transform` |

No file holds a flagged rule, so the file table is empty.

## What this run did not see

- Out of scope: 72 unit test files and 43 browser and contract test files (Material UI class names occur there as locators).
- 16 style values come from function calls (13 `backgroundImageStyle`, `boxBackground`, 2 `frameStyle`) and are not expanded. No non-test source sets `zIndex`, so they cannot hold a z value.
- 13 `styled(...)` calls and `css:` values in the playground examples are document data, scoped by `packages/core/src/css.ts`, not CSS-in-JS. A text search found no `!important` or `z-index` in them.
- The renderer writes a `<style>` element from document CSS at runtime (packages/renderer/src/index.tsx:807). Core refuses `!important` there (packages/core/src/css.ts:77).
- Theme `styleOverrides` are outside the skill's object-style list. They were read by hand: no selector key, z value or `!important`.
- The coverage walk searched for `style={` rather than `style={{`, so it also counts conditional inline styles (packages/designer/src/ResponsivePanel.tsx).
- This worktree has no install, because pnpm hung. Library files and parsers were read from a sibling worktree whose installed lockfile differs only in `@types/node` and what depends on it; Material UI, Emotion, PostCSS and TypeScript match.
