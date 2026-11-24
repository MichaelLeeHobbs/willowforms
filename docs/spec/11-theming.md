# Theming

**Status: built.** Both stylesheets are token-driven, both themes clear WCAG AA in CI, the toolbar can
force either, and the public token vocabulary is documented here and linked from the project README.
The playground keeps its host-owned MUI palette aligned with the toolbar choice in both editing and
preview modes.

Two independent theme systems, deliberately. The designer's chrome and the form on the canvas are
different things owned by different people, and a host that restyles its builder has not thereby restyled
every form it produces.

## The two systems

|                 | Prefix   | Scope         | Owned by                          |
| --------------- | -------- | ------------- | --------------------------------- |
| Designer chrome | `--fs-`  | `.fs-shell`   | The host embedding the builder    |
| HTML kit        | `--fsh-` | `.fsh-screen` | The host, or the form's own brand |

A kit brings its own theming or inherits its component library's. `@willowforms/kit-mui` has no tokens of
its own because MUI's `ThemeProvider` already owns that; `@willowforms/kit-html` has a full set because
nothing else does.

That ownership boundary does not make the toolbar a dead end. `Designer` accepts a controlled `theme`
and reports toolbar choices through `onThemeChange`; an embedding host uses that event to update its kit
theme. The playground does this for MUI. Keeping the bridge in the host lets a branded MUI theme retain
its own palette instead of the designer replacing it with a generic one.

The kit root owns an opaque surface and its matching text colour. The designer canvas is intentionally
theme-independent, so relying on its background can place a dark-system kit's light controls over light
designer chrome. The HTML Screen uses its surface token; the MUI Screen uses `background.default` and
`text.primary`. Browser coverage holds that boundary in both editing and preview modes.

## Form density

`density` is a form-author choice independent of color. The renderer exports `FormDensity` (`comfortable | compact`), passes the inherited value through optional `NodeRendererProps.density`, and includes `data-fs-density` in node attributes when a choice is active. Older documents omit it and keep their host styling. Custom kits may use this value without depending on either reference kit.

The HTML kit styles its own controls using that attribute. The MUI kit applies a nested theme at explicit density boundaries, preserving the host palette, variants, and unrelated component defaults. Compact MUI labels remain above their controls even when empty. Comfortable restores normal sizing within a compact form. Authored gaps override density's fallback spacing. The D&D example uses a document-level compact choice; its host theme now supplies colors and button typography rather than required sizing overrides.

## Designer tokens

The playground's Palette selector offers Willow and Desert Willow — AZT Bi-Color independently of Light/Dark/System mode. Both palettes share neutral light surfaces and the original Willow forest surfaces in dark mode. Desert Willow changes the action and selection accents to burgundy and pink. Palette choices are saved locally; retired or invalid choices fall back to Willow. These host-owned accents leave example documents and kit styling independent.

The default WillowForms chrome uses soft neutral-gray workspace and panel surfaces, lighter editable fields, and restrained green accents in light mode. Dark mode retains forest surfaces and sage actions. Hover, selection, editable fields, and primary-button hover have separate tokens. Selected controls use a tinted fill and a contrasting indicator; secondary buttons use quiet borders. Chrome typography uses a 14px local Segoe UI/system sans-serif base, with monospace reserved for code. Example documents, rendered form typography, and kit palettes remain independent.

Every value is a custom property on `.fs-shell`, so a host restyles by overriding tokens rather than
fighting specificity.

```css
.fs-shell {
  --fs-primary: #6d28d9;
  --fs-radius: 10px;
}
```

| Token                                    | Used for                                            |
| ---------------------------------------- | --------------------------------------------------- |
| `--fs-bg-app`                            | The shell behind everything                         |
| `--fs-bg-panel`                          | Panel and toolbar surfaces                          |
| `--fs-bg-well`                           | Inset surfaces: rule cards and the JSON editor      |
| `--fs-bg-field`                          | Editable field surfaces                             |
| `--fs-bg-hover`                          | Neutral hover surfaces                              |
| `--fs-bg-selected`, `--fs-text-selected` | Selected control fill and text                      |
| `--fs-primary-hover`                     | Primary action hover fill                           |
| `--fs-border`                            | Every divider and control outline                   |
| `--fs-control-border`                    | The outline of an editable control, which is darker |
| `--fs-text`                              | Body text                                           |
| `--fs-text-muted`                        | Hints, secondary labels, type names                 |
| `--fs-primary`                           | Selection frames, focus rings, primary buttons      |
| `--fs-primary-text`                      | Text on `--fs-primary`                              |
| `--fs-accent`                            | Drop indicators                                     |
| `--fs-danger`                            | Errors and destructive actions                      |
| `--fs-radius`                            | Corner radius                                       |
| `--fs-radius-sm`                         | Half of it, for chrome drawn over the form          |
| `--fs-panel-width`                       | Side pane width                                     |
| `--fs-scrollbar-thumb`                   | Scrollbar thumb; the track is transparent           |
| `--fs-shadow-drag`                       | The shadow under the drag label                     |
| `--fs-shadow-frame`                      | The shadow around a tablet or mobile canvas frame   |
| `--fs-shadow-toolbar`                    | The shadow under the selection toolbar              |
| `--fs-drop-ring`                         | The halo around the drop bar                        |
| `--fs-backdrop`                          | The page behind an open dialog or drawer            |
| `--fs-font`, `--fs-font-size`            | Type                                                |
| `--fs-font-mono`                         | The JSON editor, the raw CSS box, the code editor   |

`--fs-radius-sm` derives from `--fs-radius` rather than standing on its own, so overriding the one
squares off the selection frame, the selection toolbar's buttons and the rule count badge along with
everything else. Six radii used to be written as literals and ignored the override entirely.

The dark palette deepens the three shadows and the backdrop, because a shadow dark enough to see on a light panel disappears on a dark one. `--fs-drop-ring` is the same in both: it is drawn over the form, whose colours belong to the host.

## HTML kit tokens

On `.fsh-screen`:

`--fsh-text`, `--fsh-muted`, `--fsh-surface`, `--fsh-field`, `--fsh-border`, `--fsh-accent`,
`--fsh-accent-text`, `--fsh-danger`, `--fsh-success`, `--fsh-warning`, `--fsh-shadow`, `--fsh-radius`,
`--fsh-font`, `--fsh-scrollbar-thumb`.

Both lists are checked against the stylesheets by `test/docs.test.ts`. A token a host cannot find here is
a token they cannot override, which is the whole mechanism this section describes -- and three of the kit's
were missing, so an alert's success and warning accents and every shadow stayed on the default palette
however thoroughly a host restyled the rest.

## Light and dark

**Status: built.** Light is the base. Dark is a token swap under both `prefers-color-scheme` and an
explicit attribute, so a host managing its own theme can force either:

```css
.fs-shell[data-fs-theme='dark'] {
  /* ... */
}
.fsh-screen[data-fsh-theme='dark'] {
  /* ... */
}
```

The toolbar sets that designer attribute and reports the same choice to the host. **System is the absence
of it**, not a third palette: the stylesheet already answers `prefers-color-scheme`, so writing an
explicit value would override the media query with nothing. See [04-shell.md](04-shell.md#toolbar).

## Contrast is enforced, not intended

**Status: built.** `test/contrast.test.ts` reads both stylesheets, folds the dark overrides onto the light
base, and computes every ratio. A token change that breaks one fails CI.

Thresholds are WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text, and 3:1 for interface component boundaries and focus indicators. The measured palette minima are recorded and checked against [accessibility.md](../accessibility.md#contrast).

Selectors are matched exactly, and the test throws if a palette finds nothing. Substring matching meant
`.fs-shell` also matched `.fs-shell[data-fs-theme='dark']`, so all 32 assertions ran twice against the
dark palette and never once against the light one.

## Scrollbars

**Status: built.** Both the designer and HTML kit use thin scrollbars with transparent tracks and
token-controlled thumbs.

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

`IconName` in `@willowforms/core` is a closed union of 30 names. `packages/designer/src/Icon.tsx` draws
each one as an inline 24x24 stroke glyph on `currentColor`, and a kit picks names from the list. The
palette renders them beside the label, decoratively: the label already says the same word, so naming the
glyph would have a screen reader read every entry twice.

Three things fall out of the vocabulary being a union rather than a string:

- A kit's typo is a compile error rather than a blank square.
- `Record<IconName, ReactNode>` makes adding a name to core fail to compile until it is drawn.
- Two kits cannot invent two names for the same idea. Before this existed, `@willowforms/kit-mui` carried
  `view-column` and `text-field` while `@willowforms/kit-html` carried nothing, and no palette rendered
  either. That is the failure the closed set prevents.

The constraint that forced it: **the designer cannot import an icon library**, because it imports no
component library at all and a lint rule enforces that. The alternatives were a kit supplying its own
path data, which makes the metadata half stop being plain data and has every kit redraw the same twenty
glyphs, and a host-supplied renderer, which leaves the palette looking broken until someone writes one.

`ComponentDef.icon` is optional for third-party kits. This repository's reference-kit tests require icons for the shipped palette entries to keep their presentation consistent. Supplying an icon uses the shared vocabulary; omitting one does not invalidate a custom kit. See the [kit requirements](02-kit-contract.md#rules-every-kit-must-satisfy).

The `icon` property editor named in [06-inspector.md](06-inspector.md#property-editors) exists: it offers
the vocabulary as a select with the glyph drawn beside it, so a kit property whose value is an icon name
is authored rather than typed.

`Icon` and `IconProps` are exported from `@willowforms/designer` for hosts that need to draw the shared
vocabulary outside the built-in palette.

## What is not themeable

The designer's **layout** is not a token. Pane widths are, but the three-pane arrangement is not
configurable and should not be: a builder whose layout varies per host is a builder nobody can write
documentation or a tutorial for.
