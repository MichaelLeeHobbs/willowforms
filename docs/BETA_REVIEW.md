# Initial beta review

Review date: 2026-09-05. This review covers the documented contracts, core and renderer behavior, both kits, designer authoring, keyboard operation, visual layout, persistence failure handling, and package delivery. Changes are divided into focused review branches; the beta is a release candidate until those changes pass CI and are reviewed and merged.

## Product decision

The initial beta supports desktop form authoring, responsive form preview, JSON document interchange, localization, validation, repeaters, controlled step navigation, and host-dispatched actions. Following the [mission and product principles](spec/README.md#product-principles), richer expression tooling, generic attribute passthrough, and direct canvas keyboard selection have been removed from scope. Standard file inputs have been removed with a documented custom-component replacement path. The complete ordinary-property accessibility audit remains Partial; the earlier local verification below does not establish complete accessibility conformance.

| Contract       | Beta assessment                                                                                                                                 | Evidence                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Document model | Implemented; version 1 loads through the canonical boundary.                                                                                    | Core document, JSON, tree, row, and depth suites.                             |
| Kit contract   | Metadata and rendering are implemented; the complete ordinary-property accessibility audit remains Partial.                                     | Existing cross-kit contracts, accessibility audits, and kit rendering suites. |
| Components     | The standard catalogue is implemented; attachments use custom components.                                                                       | Catalogue checks, runtime suites, attachment compatibility and browser tests. |
| Shell          | Implemented; labels are isolated per designer and the shell fits a laptop viewport.                                                             | Embedding, accessibility, keyboard, and layout regressions.                   |
| Canvas         | Implemented; the Tree and panels provide keyboard authoring. Direct canvas keyboard selection is outside scope.                                 | Preview, drag, scroll, hidden-component, and viewport regressions.            |
| Inspector      | Editing is implemented. Accessibility uses ordinary properties; generic attribute passthrough is outside scope.                                 | Properties, style, actions, rules, and scoped-rename suites.                  |
| Bindings       | Literal, translation, expression, and conditional bindings work through the documented host contract. Rich expression tooling is outside scope. | Binding, localization, condition, and renderer suites.                        |
| Validation     | Shared browser/server rules are implemented. Custom data keys now validate while typing in preview.                                             | Validation, row, demo-server, and preview regressions.                        |
| Actions        | Events and validated host effect batches are implemented. Halt now stops processing immediately.                                                | Core action, renderer event, and inspector action suites.                     |
| Interchange    | JSON import/export and lossy JSON Schema export are implemented. Conditional constraints and required booleans now export consistently.         | Schema, document-dialog, packaging, and import/export browser suites.         |
| Theming        | Both palettes and documented tokens are implemented.                                                                                            | Contrast, CSS isolation, theme synchronization, and browser inspection.       |
| Public API     | Entry points, compatibility policy, and package exports are documented.                                                                         | Typecheck, consumer examples, build, and production distribution checks.      |

## Fixes in this review

- Preserve custom data-key addressing during eager validation, including individual repeater rows.
- Keep document Delete/Undo shortcuts out of runtime preview controls.
- Preserve numeric and other JSON step identities through preview navigation.
- Add empty-form guidance, label selected hidden components, and refresh drop feedback when scrolling during a drag.
- Remove page overflow, style toolbar selectors consistently, and accommodate long form titles.
- Scope designer control IDs so labels and disclosure controls address their own embedded instance.
- Update structured answer references on key rename, keeping form and repeater scopes separate.
- Stop action evaluation at halt and prevent parameters from overriding built-in kinds.
- Omit conditional JSON Schema constraints, account for ancestor visibility, and require unconditional consent booleans to be true.
- Preserve unreadable local drafts, report failed saves, and simplify the playground header.
- Correct stale specification statuses and document isolated ports for concurrent browser test runs.

Comment cleanup is limited to code changed for these outcomes. No document version or package version is changed.

## Explicit beta limits

- Attachments belong to host-configured custom or community components. Legacy `FileUpload` nodes remain loadable and show the missing-component fallback until the host supplies a renderer. The [compatibility notes](COMPATIBILITY.md#pre-beta-corrections) describe replacement; Formsmith supplies no upload, storage, or attachment-viewing service.

- Desktop authoring is the verified workflow. Mobile and tablet controls simulate the runtime form; they do not promise a phone-sized authoring workspace.
- The Tree and panels provide keyboard authoring. Direct canvas keyboard selection is outside scope; palette-to-tree dragging remains an uncommitted idea.
- Generic HTML attribute passthrough and richer expression tooling are outside scope. Ordinary properties supply accessibility intent, with complete cross-kit verification still outstanding. Hosts own sandboxing; the designer preview does not execute arbitrary source or apply host action effects.
- Versioned Formsmith JSON is the supported import/export format. JSON Schema import and archive bundles are outside product scope; the existing schema projection remains an optional developer utility. A controlled document prop remains outside this beta: a different React key loads another form through the supported mount API. Version migrations will be needed when a second document version exists.
- Structured references follow component key renames. Expressions and arbitrary action parameters need manual review; editing a Data key is an explicit payload mapping change and does not automatically rewrite references.
- JSON Schema remains a lossy export, and `validateForm` is the authoritative validation engine. Conditional logic, cross-field rules, custom code, and shared data-key collisions cannot be represented completely by the export.
- Chromium is the automated browser gate. Firefox, Safari, assistive-technology testing with real screen readers, and the full declared React/Node compatibility matrix have not been established by this local review.

## Release gate

Local verification passed: frozen-lockfile installation, dependency audit (no known vulnerabilities), formatting, linting, typechecking, unit/integration suites, the full Chromium authoring suite, production-package browser smoke, and distribution checks for all five packages. Browser inspection covered both kits, light/dark themes, validation feedback, and mobile preview. The production playground still emits Vite's large-chunk advisory because the demo bundles both kits; it does not change the package export checks.

Run the complete [release procedure](RELEASING.md) on the reviewed commit. Local evidence and CI results must both be checked before publishing; the local environment uses Node 24.13.0, while CI uses Node 22. Publishing, tagging, and merging are separate release actions and are not performed by this review.
