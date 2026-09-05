# Initial beta review

Review date: 2026-09-05. This review covers the documented contracts, core and renderer behavior, both kits, designer authoring, keyboard operation, visual layout, persistence failure handling, and package delivery. Changes are divided into focused review branches; the beta is a release candidate until those changes pass CI and are reviewed and merged.

## Product decision

The initial beta supports desktop form authoring, responsive form preview, JSON document interchange, localization, validation, repeaters, controlled step navigation, and host-dispatched actions. The full specification is not yet complete: the three Partial contracts below retain their planned features. No major architectural or product-scope change is proposed.

| Contract       | Beta assessment                                                                                                                                   | Evidence                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Document model | Implemented; version 1 loads through the canonical boundary.                                                                                      | Core document, JSON, tree, row, and depth suites.                        |
| Kit contract   | Both kits implement the metadata and renderer contract.                                                                                           | Cross-kit contracts, accessibility audits, and kit rendering suites.     |
| Components     | The documented catalogue, repeaters, and step navigation are implemented.                                                                         | Catalogue checks, runtime suites, authoring and repeater browser tests.  |
| Shell          | Implemented; labels are isolated per designer and the shell fits a laptop viewport.                                                               | Embedding, accessibility, keyboard, and layout regressions.              |
| Canvas         | Beta workflow implemented; direct keyboard selection on the canvas remains deferred.                                                              | Preview, drag, scroll, hidden-component, and viewport regressions.       |
| Inspector      | Editing is implemented; HTML attribute passthrough remains deferred.                                                                              | Properties, style, actions, rules, and scoped-rename suites.             |
| Bindings       | Literal, translation, expression, and conditional bindings work through the documented host contract. Rich expression authoring remains deferred. | Binding, localization, condition, and renderer suites.                   |
| Validation     | Shared browser/server rules are implemented. Custom data keys now validate while typing in preview.                                               | Validation, row, demo-server, and preview regressions.                   |
| Actions        | Events and validated host effect batches are implemented. Halt now stops processing immediately.                                                  | Core action, renderer event, and inspector action suites.                |
| Interchange    | JSON import/export and lossy JSON Schema export are implemented. Conditional constraints and required booleans now export consistently.           | Schema, document-dialog, packaging, and import/export browser suites.    |
| Theming        | Both palettes and documented tokens are implemented.                                                                                              | Contrast, CSS isolation, theme synchronization, and browser inspection.  |
| Public API     | Entry points, compatibility policy, and package exports are documented.                                                                           | Typecheck, consumer examples, build, and production distribution checks. |

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

- Desktop authoring is the verified workflow. Mobile and tablet controls simulate the runtime form; they do not promise a phone-sized authoring workspace.
- The Tree tab is the keyboard path for selecting and moving components. Direct canvas keyboard selection and palette-to-tree dragging remain deferred.
- HTML attribute passthrough and expression completion, syntax checking, and in-panel evaluation remain planned. Hosts still own sandboxing; the designer preview does not execute arbitrary source or apply host action effects.
- JSON Schema import, archive bundles, and a controlled document prop remain outside this beta. A different React key loads another form through the supported mount API. Version migrations will be needed when a second document version exists.
- Structured references follow component key renames. Expressions and arbitrary action parameters need manual review; editing a Data key is an explicit payload mapping change and does not automatically rewrite references.
- JSON Schema remains a lossy export, and `validateForm` is the authoritative validation engine. Conditional logic, cross-field rules, custom code, and shared data-key collisions cannot be represented completely by the export.
- Chromium is the automated browser gate. Firefox, Safari, assistive-technology testing with real screen readers, and the full declared React/Node compatibility matrix have not been established by this local review.

## Release gate

Local verification passed: frozen-lockfile installation, dependency audit (no known vulnerabilities), formatting, linting, typechecking, unit/integration suites, the full Chromium authoring suite, production-package browser smoke, and distribution checks for all five packages. Browser inspection covered both kits, light/dark themes, validation feedback, and mobile preview. The production playground still emits Vite's large-chunk advisory because the demo bundles both kits; it does not change the package export checks.

Run the complete [release procedure](RELEASING.md) on the reviewed commit. Local evidence and CI results must both be checked before publishing; the local environment uses Node 24.13.0, while CI uses Node 22. Publishing, tagging, and merging are separate release actions and are not performed by this review.
