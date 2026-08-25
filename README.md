# Formsmith

An MIT-licensed visual form designer for React. The **designer**, not just the renderer.

> Status: pre-alpha. The architecture and the core are real and tested. Most of the designer is not
> built yet. See [docs/ROADMAP.md](docs/ROADMAP.md) for what actually works today.

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

## Packages

| Package               | What it is                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `@formsmith/core`     | Document model, kit contract, tree operations, validation. Zero dependencies, no UI, runs in Node. |
| `@formsmith/renderer` | Runtime renderer. Embed a form without shipping the designer.                                      |
| `@formsmith/designer` | The visual builder. No UI-library dependency; chrome is plain CSS custom properties.               |
| `@formsmith/kit-mui`  | Material UI component kit. The reference implementation of the kit contract.                       |

Two apps, neither published: `apps/playground` (Vite demo) and `apps/demo-server` (a deliberately tiny
Hono server so the demo can persist a document and prove server-side validation shares one rule set).

## Quick start

```bash
pnpm install
pnpm dev          # playground at http://localhost:5180
pnpm test         # 52 tests
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

These are the decisions worth holding onto as the project grows.

**The designer stays MIT.** No open-core split, no "enterprise" directory. The moment the designer goes
behind a license, this project has become the thing it was built to replace.

**Kits are pluggable from day one.** The designer knows `ComponentDef` metadata and nothing about MUI.
Adding a kit is a new package, not a change to the designer. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**The designer has no UI-library dependency.** Chrome is plain CSS driven by custom properties, so it
drops into a host app without dragging in a second component library or fighting the host's theme.

**Accessibility is not a later milestone.** The teardown that seeded this project measured its subject at
30 buttons with no accessible name, zero `role="tablist"` wrappers, no landmarks, and a primary button
at 3.03:1 contrast. Those are the table stakes to clear, not stretch goals.

## Licence

MIT. See [LICENSE](LICENSE).
