# Compatibility policy

Formsmith is pre-release software. Until the first published `1.0.0`, public contracts may change, but
changes must be deliberate and documented rather than arriving as incidental refactors.

## Supported platforms

- Node.js 20 and 22 for `@formsmith/core` and server-side validation.
- React 18 and 19 for the renderer, designer, and kits.
- The current and previous major Material UI releases supported by `@formsmith/kit-mui` peer metadata.
- Current evergreen Chromium, Firefox, and Safari for runtime use. Automated browser coverage currently
  gates Chromium; the other engines are compatibility targets, not yet CI gates.

## Change rules

- The document `version` changes only when an existing document needs migration.
- `loadDocument` owns migrations and remains the supported boundary for stored or network input.
- Additive optional fields and new exports are compatible within a pre-release line.
- Removing or renaming a public export, prop, document field, component type, rule, event, or effect must
  include a migration path and a release note.
- A deprecated API remains for at least one minor release after the replacement ships. Runtime warnings
  must be actionable and must not expose form values.
- Kit contract changes land with cross-kit tests in the same change.

The package manifests are the source of truth for engine and peer ranges. The specification describes
behaviour; when either changes, this policy and the relevant contract change together.
