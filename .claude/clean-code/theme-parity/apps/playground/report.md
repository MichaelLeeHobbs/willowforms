# Theme parity: apps/playground

**This run failed one check: Decided.** 9.67% of the measured text could not be decided, against a limit of 5%. Every other check passed. Two causes hold nearly all of it: the page behind an open dialog on six screens (`overlap`), and Material UI's shrunk labels, which are drawn at 75% scale (`transform`). Without those six screens the share is 4.18%, inside the limit, but the screens were planned and stay in the result. The findings below come from decided text only.

```
Theme parity: playground  commit 6c3b1bf70d442a22c8f882fafa277fd27ed0fe86  2026-11-25  instance http://127.0.0.1:5190
Catalog: .claude/clean-code/theme-parity/apps/playground/   Work folder: session scratchpad, outside the repo
Browser: Chromium 158.0.8127.18 (headless)  viewport 1280 by the content height  Windows 10   Rendered: yes
Threshold: WCAG 2.2 AA   Themes: desert-dark, desert-light, willow-dark, willow-light
Coverage: 416 of 416 renders, 0 blocked, 0 skipped  1.0000  PASS
Switch: 0 screens did not switch   PASS
Nodes: 20832 pass, 134 fail, 2246 undecided, 81084 skipped, 940 exempt
Decided: undecided 0.0967 (overlap 1360, transform 836, gradient 50), unparsed colours 0.0000   FAIL
Clusters: 10; top 3 hold 0.7164 of failing nodes
Fixed colours: 33 failing, 33 in all; unmatched keys 0
Fixes: 8 PROVEN, 0 PARTIAL, 0 REFUTED, 2 BLOCKED
Canaries: 25 of 25 behaved; proof canary PROVEN   PASS
Ground truth: 0 of 40 samples off by more than 2   PASS
Spend: 35 min of a 12:00 EST cap, about $5 (estimated from tokens, at list price)
```

The tool passed all 51 fixtures. Attribution, proof and the report ran in one session, so the steps were not independent.

## Result

No token is wrong. Every text token of the designer, the playground and the HTML kit passes on every surface where it was decided, in all four themes. What fails is text that no token reaches:

- Placeholders in the designer's panels and in the example gallery keep the browser's own `#757575`, in light and dark alike. This is 132 of the 134 failing nodes.
- Material UI's default error red on the D&D sheet's own dark background. This is the other 2.

PR 219, which changed how the dark theme keeps a host's overrides, merged as 302fac7 before this run started, so it is in the audited commit. Because F1 to F4 use a token, a host's `--fs-text-muted` would also reach its placeholders in every mode.

## Fix lines

```
F1 literal:user-agent ::placeholder #757575 -> var(--fs-text-muted) in desert-dark, fixes 32 pairs on 28 screens, worst 3.50 -> 8.41, regressed 0, checked 33 of 33 screens  PROVEN
   literal; the browser's rule, no ::placeholder rule exists in any repo stylesheet; cluster C0001; add `:where(.fs-panel) ::placeholder { color: var(--fs-text-muted); opacity: 1 }` after packages/designer/src/designer.css:288
F2 the same rule in desert-light, fixes 32 pairs on 28 screens, worst 4.25 -> 5.77, regressed 0, checked 33 of 33 screens  PROVEN
   literal; cluster C0002
F3 the same rule in willow-dark, fixes 32 pairs on 28 screens, worst 3.50 -> 8.41, regressed 0, checked 33 of 33 screens  PROVEN
   literal; cluster C0003
F4 the same rule in willow-light, fixes 32 pairs on 28 screens, worst 4.25 -> 5.77, regressed 0, checked 33 of 33 screens  PROVEN
   literal; cluster C0004
F5 literal:user-agent ::placeholder #757575 -> var(--pg-muted) in desert-dark, fixes 1 pair on 1 screen, worst 3.07 -> 7.37, regressed 0, checked 1 of 1 screens  PROVEN
   literal; cluster C0006; add `.pg-gallery ::placeholder { color: var(--pg-muted); opacity: 1 }` after apps/playground/src/playground.css:248
F6 the same rule in desert-light, fixes 1 pair on 1 screen, worst 3.95 -> 5.37, regressed 0, checked 1 of 1 screens  PROVEN
   literal; cluster C0007
F7 the same rule in willow-dark, fixes 1 pair on 1 screen, worst 3.07 -> 7.37, regressed 0, checked 1 of 1 screens  PROVEN
   literal; cluster C0009
F8 the same rule in willow-light, fixes 1 pair on 1 screen, worst 3.95 -> 5.37, regressed 0, checked 1 of 1 screens  PROVEN
   literal; cluster C0010
F9 palette.error.main #f44336 -> #e57373 (error.light) in desert-dark, predicted to fix 1 pair on 1 screen, worst 4.26 -> 5.25, regressed 0  BLOCKED (no injection)
   literal; Material UI's default dark error, which the character theme does not set; cluster C0005; set `error: { main: '#e57373' }` in the dark palette at apps/playground/src/character-theme.ts:13
F10 the same setting in willow-dark, predicted to fix 1 pair on 1 screen, worst 4.26 -> 5.25, regressed 0  BLOCKED (no injection)
   literal; cluster C0008
```

Line numbers name the rule to add after. `.fs-panel` is designer markup, so invariant 3 holds and no kit placeholder changes. Each colour is the token its stylesheet already uses for muted text; `test/contrast.test.ts` already asserts the designer's on that surface. `opacity: 1` is there for Firefox, which fades placeholders; this run used Chromium only. On the one screen both rules touch, all four themes were rendered with both applied: 0 regressions.

## Decision list

1. Add the designer placeholder rule (F1 to F4)? It ships in `@willowforms/designer`, outside this audit's folder, so every host gets it. Default: yes.
2. Add the gallery placeholder rule (F5 to F8)? Default: yes.
3. Set the D&D sheet's dark error colour (F9, F10)? The theme is a script object, so the page could not be overridden and the fix is only predicted. `red[400]` also passes but at 4.50, with no margin. Default: `#e57373`, then re-run this screen.
4. Accept that the Decided check failed? The undecided text is behind a modal dialog or scaled by Material UI; neither is a token. Default: yes. For the next run, decide whether text made inert by an open dialog should count as exempt; today the skill has no such rule.
5. Check the event registration banner by eye. Its white text sits on an image and a dark overlay, so no ratio was computed, in either theme. Default: look once in each theme.
6. The HTML kit's `.fsh-input` has no placeholder rule either, and both kits offer a Placeholder property. No example sets one, so it was not measured. Default: add `.fsh-input::placeholder { color: var(--fsh-muted); opacity: 1 }` with an example that uses it, and re-run.

## Undecided

The first 10 groups in the tool's order (the rest are in appendix.md):

```
222 pairs on 6 screens  desert-dark   overlap    --fs-bg-panel (dark)
222 pairs on 6 screens  desert-light  overlap    --fs-bg-panel
222 pairs on 6 screens  willow-dark   overlap    --fs-bg-panel (dark)
222 pairs on 6 screens  willow-light  overlap    --fs-bg-panel
164 pairs on 11 screens desert-dark   transform  Material UI form surface
164 pairs on 11 screens desert-light  transform  Material UI form surface
164 pairs on 11 screens willow-dark   transform  Material UI form surface
164 pairs on 11 screens willow-light  transform  Material UI form surface
54 pairs on 6 screens   desert-dark   overlap    Material UI form surface
54 pairs on 6 screens   desert-light  overlap    Material UI form surface
```

What would decide them: the `overlap` rows are the page behind the gallery, the reset dialog, the JSON dialog and the form data dialog, and the same text is measured on screens where no dialog is open. The `transform` rows are Material UI labels, mostly on the compact D&D sheet; measuring them needs the 75% size, and Material UI labels that are not scaled pass. The `gradient` rows are the event registration banner and a Material UI alert in dark.

## How this run differs from the skill's letter

- **Screens.** No list was given and the app has no router. The 104 screens come from the app's own registries: 11 documents, 2 kits, editing, preview with each step, validated preview, and 20 shell states. The default rule would have been 2 screens.
- **Theme recipe.** The palette is the `willowforms.playground.palette` local storage key; light or dark is the toolbar's Designer theme select, with the emulated system scheme set to the opposite so that only the choice decides. System mode, narrow layouts, hover, focus and drag states were not rendered. Select values and typed input values are not text nodes, so they have no rows.
- **Sentinel.** The switch check hashes custom properties on `.pg-app`, `.fs-shell` and `.fsh-screen` as well as the root element, because this app sets none on the root.
- **Hit test.** Material UI labels have `pointer-events: none`, so the query cannot see them. The collector makes the text's own element hittable for its own query. Fully transparent text, Material UI's outline spacer, is skipped as `hidden`. Read without these two changes, `measure` gives 0.2327 undecided and the same 134 failures, so the check fails either way.
- **Canary.** The proof canary's override needs `!important`, because the canary sets its token in a style attribute.
- **Source label.** The browser's placeholder rule has no scope, so each fix names the surface it covers.
- **A collector slip.** On four rows of the settings screen the source of a transparent background was left empty. No colour or bucket was affected.

## Prevention drafts

- **Lint.** The repo lints TypeScript only; it has no stylesheet linter, and the run found no failing literal in its CSS, so no lint rule is drafted.
- **Test**, for `test/contrast.test.ts`, which already measures muted text on the field: assert that `designer.css` sets `::placeholder` to `var(--fs-text-muted)` and `playground.css` sets it to `var(--pg-muted)`.

```ts
it.each([
  [designerCss, '--fs-text-muted'],
  [read('../apps/playground/src/playground.css'), '--pg-muted'],
])('placeholders use a token, not the browser colour', (css, token) => {
  expect(css).toMatch(new RegExp(`::placeholder\\s*\\{[^}]*color:\\s*var\\(${token}\\)`))
})
```

- **Agent context line**, for `CLAUDE.md`: "Colour tokens live in `designer.css` (`--fs-`), `kit-html.css` (`--fsh-`), `playground.css` and `palettes.css` (`--pg-`). Never set a colour token in one theme scope without the others, and give a browser-coloured part such as `::placeholder` a token."

Every cluster, fixed colour, candidate table and undecided group is in [appendix.md](appendix.md).
