# Theming

**Status: partial.** Both stylesheets are token-driven and both themes clear WCAG AA in CI, and the
toolbar can force either. The designer's tokens are not documented for consumers outside this file, and
the kit stylesheet does not style a scrollbar.

Two independent theme systems, deliberately. The designer's chrome and the form on the canvas are
different things owned by different people, and a host that restyles its builder has not thereby restyled
every form it produces.

## The two systems

|                 | Prefix   | Scope         | Owned by                          |
| --------------- | -------- | ------------- | --------------------------------- |
| Designer chrome | `--fs-`  | `.fs-shell`   | The host embedding the builder    |
| HTML kit        | `--fsh-` | `.fsh-screen` | The host, or the form's own brand |

A kit brings its own theming or inherits its component library's. `@formsmith/kit-mui` has no tokens of
its own because MUI's `ThemeProvider` already owns that; `@formsmith/kit-html` has a full set because
nothing else does.

## Designer tokens

Every value is a custom property on `.fs-shell`, so a host restyles by overriding tokens rather than
fighting specificity.

```css
.fs-shell {
  --fs-primary: #6d28d9;
  --fs-radius: 10px;
}
```

| Token                         | Used for                                            |
| ----------------------------- | --------------------------------------------------- |
| `--fs-bg-app`                 | The shell behind everything                         |
| `--fs-bg-panel`               | Panel and toolbar surfaces                          |
| `--fs-bg-well`                | Inset surfaces: inputs, rule cards, the JSON editor |
| `--fs-border`                 | Every divider and control outline                   |
| `--fs-control-border`         | The outline of an editable control, which is darker |
| `--fs-text`                   | Body text                                           |
| `--fs-text-muted`             | Hints, secondary labels, type names                 |
| `--fs-primary`                | Selection frames, focus rings, primary buttons      |
| `--fs-primary-text`           | Text on `--fs-primary`                              |
| `--fs-accent`                 | Drop indicators                                     |
| `--fs-danger`                 | Errors and destructive actions                      |
| `--fs-radius`                 | Corner radius                                       |
| `--fs-panel-width`            | Side pane width                                     |
| `--fs-scrollbar-thumb`        | Scrollbar thumb; the track is transparent           |
| `--fs-font`, `--fs-font-size` | Type                                                |

## HTML kit tokens

On `.fsh-screen`:

`--fsh-text`, `--fsh-muted`, `--fsh-surface`, `--fsh-field`, `--fsh-border`, `--fsh-accent`,
`--fsh-accent-text`, `--fsh-danger`, `--fsh-success`, `--fsh-warning`, `--fsh-shadow`, `--fsh-radius`,
`--fsh-font`.

Both lists are checked against the stylesheets by `test/docs.test.ts`. A token a host cannot find here is
a token they cannot override, which is the whole mechanism this section describes -- and three of the kit's
were missing, so an alert's success and warning accents and every shadow stayed on the default palette
however thoroughly a host restyled the rest.

## Light and dark

**Status: partial.** Light is the base. Dark is a token swap under both `prefers-color-scheme` and an
explicit attribute, so a host managing its own theme can force either:

```css
.fs-shell[data-fs-theme='dark'] {
  /* ... */
}
.fsh-screen[data-fsh-theme='dark'] {
  /* ... */
}
```

The toolbar sets that attribute. **System is the absence of it**, not a third palette: the stylesheet
already answers `prefers-color-scheme`, so writing an explicit value would override the media query with
nothing. See [04-shell.md](04-shell.md#toolbar).

## Contrast is enforced, not intended

**Status: built.** `test/contrast.test.ts` reads both stylesheets, folds the dark overrides onto the light
base, and computes every ratio. A token change that breaks one fails CI.

Thresholds are WCAG 2.2 AA: 4.5:1 for body text, 3:1 for interface component boundaries and focus
indicators. The lowest measured value in any palette is 3.35:1 against a 3:1 requirement, and it is a
user interface component rather than text: the scrollbar thumb on the designer's well background. The
lowest text pair is 5.25:1 against a 4.5:1 requirement.

Our primary button label is 5.49:1 in light and 6.39:1 in dark. Contrast failures in shipped builders
are common enough that measuring is the only way to know, which is why this is a test and not a goal.

Selectors are matched exactly, and the test throws if a palette finds nothing. Substring matching meant
`.fs-shell` also matched `.fs-shell[data-fs-theme='dark']`, so all 32 assertions ran twice against the
dark palette and never once against the light one.

## Scrollbars

**Status: built** for the designer. The kit's stylesheet still does not style one.

Thin scrollbars on both panes, the inspector's tab panel, the canvas, and the preview data block, with a
transparent track so the thumb sits directly on the surface below it. `scrollbar-width` and
`scrollbar-color` carry it, and the `::-webkit-scrollbar` rules say the same thing to browsers that never
shipped those. `test/contrast.test.ts` holds the thumb at 3:1 against all three surfaces it can land on.

The interesting part is what it took to stay inside invariant 3. Both standard properties **inherit**, so
setting them on the canvas surface pushes the designer's scrollbars into any scrollable region the kit
renders inside the form: a dark builder wrapped around a light form would have given that form dark
scrollbars. `.fs-canvas__surface [data-fs-key]` resets both to `auto`, which is the second rule in the
stylesheet that reaches into a kit component and, like the first, exists to give the component something
back rather than to style it. `designer.css.test.ts` pins each exception to the exact properties it may
declare, so neither can quietly grow a `background`.

## Icons

**Status: built.** Option 1 below, as recommended.

`IconName` in `@formsmith/core` is a closed union of 30 names. `packages/designer/src/Icon.tsx` draws
each one as an inline 24x24 stroke glyph on `currentColor`, and a kit picks names from the list. The
palette renders them beside the label, decoratively: the label already says the same word, so naming the
glyph would have a screen reader read every entry twice.

Three things fall out of the vocabulary being a union rather than a string:

- A kit's typo is a compile error rather than a blank square.
- `Record<IconName, ReactNode>` makes adding a name to core fail to compile until it is drawn.
- Two kits cannot invent two names for the same idea. Before this existed, `@formsmith/kit-mui` carried
  `view-column` and `text-field` while `@formsmith/kit-html` carried nothing, and no palette rendered
  either. That is the failure the closed set prevents.

The constraint that forced it: **the designer cannot import an icon library**, because it imports no
component library at all and a lint rule enforces that. The alternatives were a kit supplying its own
path data, which makes the metadata half stop being plain data and has every kit redraw the same twenty
glyphs, and a host-supplied renderer, which leaves the palette looking broken until someone writes one.

`ComponentDef.icon` stays optional, because a third-party kit is allowed to ship without icons. The
contract test requires one of the kits in this repository, since those are what a kit author copies.

The `icon` property editor named in [06-inspector.md](06-inspector.md#property-editors) exists: it offers
the vocabulary as a select with the glyph drawn beside it, so a kit property whose value is an icon name
is authored rather than typed.

**Missing:** `Icon` is not exported from `@formsmith/designer`. It waits for a host that needs to draw
one of these glyphs itself rather than name it.

## What is not themeable

The designer's **layout** is not a token. Pane widths are, but the three-pane arrangement is not
configurable and should not be: a builder whose layout varies per host is a builder nobody can write
documentation or a tutorial for.
