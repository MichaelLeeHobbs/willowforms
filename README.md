# Formsmith

An MIT-licensed visual form designer for React. The **designer**, not just the renderer.

> Status: beta. The builder works end to end and is covered by 864 tests, but nothing is published to
> npm yet and no release has been cut. [docs/ROADMAP.md](docs/ROADMAP.md) is the honest status,
> including what is still missing.

## Why this exists

Every good form builder splits the same way: the runtime is open source, the visual designer is not.

| Product          | Runtime                          | Designer                                                                            |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| FormEngine       | `@react-form-builder/core` — MIT | `@react-form-builder/designer` — proprietary EULA, ~$1,300/yr, source not published |
| SurveyJS         | `survey-core` — MIT              | `survey-creator-core` — commercial                                                  |
| Vueform          | `@vueform/vueform` — MIT         | Vueform Builder — commercial                                                        |
| OpnForm, HeyForm | AGPL-3.0                         | AGPL-3.0                                                                            |
| **Formsmith**    | **MIT**                          | **MIT**                                                                             |

`@formio/js` is the one honest exception and ships an MIT builder, but it is a 2018-era architecture
carrying `moment`, `dragula`, and jQuery-shaped patterns. Formsmith is the modern take.

The AGPL projects are genuinely open, and if AGPL suits you they are further along than this one is.
Formsmith exists for everyone who cannot take a copyleft dependency and refuses to pay four figures a
year for a drag-and-drop panel.

## What works

- **Canvas.** Click a component to select it, with a selection frame and hover outline. Drag from the
  palette onto the canvas or the tree, drag components to move them, reorder and reparent in the
  structure tree. Drop indicators show exactly where a release lands.
- **Properties.** Per-type panels built from kit metadata. Any property can be a literal value, a
  computed expression, or a translation key, with an editor for each.
- **Validation.** Ten rule types carrying their parameters in the type system, edited in a Rules tab,
  and the same engine runs in Node so a server enforces the form's own rules.
- **Localization.** Languages, a default, per-language writing direction, and translations edited inline
  beside the property they belong to.
- **JSON in and out.** Edit the document as JSON with parse and structural errors reported rather than
  swallowed, import a file, copy or download, and export a JSON Schema of the submitted data.
- **Keyboard and screen readers.** The tree is fully operable without a pointer, including moving
  components. See [docs/accessibility.md](docs/accessibility.md), which is honest about the gaps.
- **Two kits**, switchable at runtime on the same document.

The full specification is in [docs/spec](docs/spec/README.md), one file per contract, with a status on
every section.

Undo and redo cover all of it.

## Packages

| Package               | What it is                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `@formsmith/core`     | Document model, kit contract, tree operations, validation, JSON Schema export. No UI, runs in Node. |
| `@formsmith/renderer` | Runtime renderer. Embed a form without shipping the designer.                                       |
| `@formsmith/designer` | The visual builder. No UI-library dependency; chrome is plain CSS custom properties.                |
| `@formsmith/kit-mui`  | Material UI kit. The reference implementation of the kit contract.                                  |
| `@formsmith/kit-html` | Dependency-free HTML kit. Copy it to build your own.                                                |

Two apps, neither published: `apps/playground` (Vite demo) and `apps/demo-server` (a deliberately tiny
Hono server so the demo can persist a document and prove server-side validation shares one rule set).

## Quick start

```bash
pnpm install
pnpm dev          # playground at http://localhost:5180
pnpm test         # 864 tests
pnpm e2e          # 62 more, in a real browser
pnpm build        # tsc --build across all packages
```

## Using it

```tsx
import { Designer } from '@formsmith/designer'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'
import '@formsmith/designer/styles.css'

;<Designer
  initialDocument={doc}
  kit={muiKit}
  rendererKit={muiRendererKit}
  onChange={(next) => save(next)}
/>
```

Runtime only, no designer:

```tsx
import { FormRenderer } from '@formsmith/renderer'
import { validateForm } from '@formsmith/core'

const errors = validateForm(doc.root, data)
<FormRenderer document={doc} kit={muiRendererKit} data={data} errors={errors} onChange={set} />
```

The same `validateForm` runs in Node, so the server enforces the form's own rules without a second
implementation to keep in sync.

## Design commitments

These are the decisions worth holding onto as the project grows. Each is backed by something you can
check rather than a promise.

**The designer stays MIT.** No open-core split, no "enterprise" directory. The moment the designer goes
behind a license, this project has become the thing it was built to replace.

**Kits are pluggable, and that is demonstrated.** Adding `@formsmith/kit-html` touched four files outside
its own package, all of them build plumbing. Nothing in core, the renderer, or the designer changed.
`test/kit-contract.test.tsx` runs the contract against every kit in the repo, so a third one is added to
a list and nothing else. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**The designer has no UI-library dependency.** Chrome is plain CSS driven by custom properties, so it
drops into a host app without dragging in a second component library or fighting the host's theme. A
lint rule fails the build if anyone imports one.

**Code execution is the host's boundary.** Computed properties and custom rules run author-supplied
JavaScript. Core deliberately ships no evaluator, so the host injects one and owns the sandbox. With
none injected, those rules degrade to permissive rather than throwing.

**Accessibility is not a later milestone.** The prior-art study that seeded this project measured its subject at
30 buttons with no accessible name, zero `role="tablist"` wrappers, no landmarks, and a primary button at
3.03:1 contrast. Here every button is named, the tabs are a real tablist, contrast is computed from the
stylesheets in CI, and axe-core runs over the designer in six states.

## Contributing

`pnpm lint` enforces more than style. The architectural invariants in [CLAUDE.md](CLAUDE.md) are
`no-restricted-imports` rules, so importing React into core or a component library into the designer
fails with a message explaining why the rule exists. The CSS isolation rule and the colour-contrast
thresholds are enforced by tests that parse the stylesheets.

If one of those fires, read the message before silencing it. Each is there because the failure it
prevents is invisible to the type checker.

## Licence

MIT. See [LICENSE](LICENSE).
