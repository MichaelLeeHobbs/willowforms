# Theming

**Status: partial.** Both stylesheets are token-driven and both themes clear WCAG AA in CI. The designer
has no theme toggle, tokens are not documented for consumers, and there is no icon vocabulary.

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
| `--fs-text`                   | Body text                                           |
| `--fs-text-muted`             | Hints, secondary labels, type names                 |
| `--fs-primary`                | Selection frames, focus rings, primary buttons      |
| `--fs-primary-text`           | Text on `--fs-primary`                              |
| `--fs-accent`                 | Drop indicators                                     |
| `--fs-danger`                 | Errors and destructive actions                      |
| `--fs-radius`                 | Corner radius                                       |
| `--fs-panel-width`            | Side pane width                                     |
| `--fs-font`, `--fs-font-size` | Type                                                |

## HTML kit tokens

On `.fsh-screen`:

`--fsh-text`, `--fsh-muted`, `--fsh-surface`, `--fsh-field`, `--fsh-border`, `--fsh-accent`,
`--fsh-accent-text`, `--fsh-danger`, `--fsh-radius`, `--fsh-font`.

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

**Missing:** the designer has no control to set that attribute. A toggle belongs in the toolbar. See
[04-shell.md](04-shell.md#toolbar).

## Contrast is enforced, not intended

**Status: built.** `test/contrast.test.ts` reads both stylesheets, folds the dark overrides onto the light
base, and computes every ratio. A token change that breaks one fails CI.

Thresholds are WCAG 2.2 AA: 4.5:1 for body text, 3:1 for interface component boundaries and focus
indicators. The lowest measured value in any palette is 4.15:1 against a 3:1 requirement.

The studied product ships a primary button label at 3.03:1, which fails AA. Ours is 5.49:1 in light and
6.39:1 in dark. That comparison is the reason the test exists: a goal nobody measures is a wish.

That test was itself wrong once, in a way worth recording. It matched token blocks by substring, so
`.fs-shell` also matched `.fs-shell[data-fs-theme='dark']` and the light palette silently held the dark
values — 32 assertions passing while checking one palette twice. Selectors are matched exactly now, and
it throws if either finds nothing.

## Scrollbars

**Status: planned.** Neither stylesheet styles a scrollbar, so a dark theme shows the platform's light
ones. `scrollbar-width` and `scrollbar-color` from the existing tokens, plus the `::-webkit-scrollbar`
equivalents, on both panes and the canvas.

## Icons

**Status: undecided.** `ComponentDef.icon` exists and nothing renders it, so the palette is a wall of
text.

The constraint is real: **the designer cannot import an icon library**, because it imports no component
library at all and a lint rule enforces that. Three options:

1. **A shared vocabulary.** Core declares a closed set of icon names; the designer ships inline SVGs for
   them; kits pick names from the list. Keeps the designer dependency-free and gives every kit the same
   visual language. A kit needing an icon outside the set has to ask for one.
2. **The kit supplies the SVG.** `ComponentDef.icon` becomes path data rather than a name. Fully flexible,
   but the metadata half stops being pure data in spirit, and every kit reinvents the same twenty icons.
3. **The host supplies a renderer.** `<Designer iconRenderer={...} />`. Most flexible, most work for
   every consumer, and the palette looks broken until someone does it.

**Recommendation: option 1.** The set of things a form component can be is small and well understood, and
a closed vocabulary is what makes two kits look like one product.

## What is not themeable

The designer's **layout** is not a token. Pane widths are, but the three-pane arrangement is not
configurable and should not be: a builder whose layout varies per host is a builder nobody can write
documentation or a tutorial for.
